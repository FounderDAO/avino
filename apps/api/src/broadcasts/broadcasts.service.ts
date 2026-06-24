import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BroadcastStatus,
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import {
  AudiencePreview,
  BroadcastAudienceService,
} from './broadcast-audience.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { ListBroadcastsQueryDto } from './dto/list-broadcasts.query.dto';
import { PreviewAudienceDto } from './dto/preview-audience.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Плоский view-объект рассылки (snake_case, отдаётся клиенту). */
export interface BroadcastView {
  id: string;
  status: BroadcastStatus;
  audience_type: string;
  language: string;
  channels: NotificationChannel[];
  title: string;
  recipient_count: number;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
}

/** Расширенный view для endpoint-а деталей рассылки. */
export interface BroadcastDetail extends BroadcastView {
  body: string;
  filter_status: string | null;
  filter_role: string | null;
  target_user_id: string | null;
  /** Статистика доставок: { channel: { status: count } }. */
  delivery_stats: Record<string, Record<string, number>>;
}

/** Строка списка рассылок (совпадает с BroadcastView, выделена для документации). */
export type BroadcastListItem = BroadcastView;

@Injectable()
export class BroadcastsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: BroadcastAudienceService,
    private readonly config: ConfigService,
  ) {}

  /** Превью аудитории без создания рассылки. Делегирует BroadcastAudienceService. */
  async preview(dto: PreviewAudienceDto): Promise<AudiencePreview> {
    return this.audience.previewCounts(dto);
  }

  /**
   * Создаёт рассылку в статусе SCHEDULED.
   * mode='now' → scheduledAt=new Date(); mode='scheduled' → валидация будущего времени (422).
   */
  async create(adminId: string, dto: CreateBroadcastDto): Promise<BroadcastView> {
    const scheduledAt =
      dto.mode === 'now' ? new Date() : new Date(dto.scheduledAt as string);

    if (dto.mode === 'scheduled' && scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'scheduledAt must be in the future',
      });
    }

    // Защита от рассылки на всю базу (M-4). Считаем аудиторию до сохранения строки.
    const maxRecipients =
      this.config.get<number>('broadcasts.maxRecipients') ?? 5000;
    const preview = await this.audience.previewCounts(dto);
    if (preview.total > maxRecipients) {
      throw new HttpException(
        {
          code: ApiErrorCode.VALIDATION_ERROR,
          message: `Audience size ${preview.total} exceeds the maximum allowed ${maxRecipients} recipients. Use a more specific filter or increase BROADCAST_MAX_RECIPIENTS.`,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const row = await this.prisma.broadcast.create({
      data: {
        createdById: adminId,
        audienceType: dto.audienceType,
        targetUserId: dto.targetUserId ?? null,
        language: dto.language,
        filterStatus: dto.filterStatus ?? null,
        filterRole: dto.filterRole ?? null,
        channels: dto.channels,
        title: dto.title,
        body: dto.body,
        status: BroadcastStatus.SCHEDULED,
        scheduledAt,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'BROADCAST_CREATE',
        entityType: 'broadcast',
        entityId: row.id,
        metadata: {
          audienceType: dto.audienceType,
          language: dto.language,
          channels: dto.channels,
          mode: dto.mode,
        },
      },
    });

    return this.toView(row);
  }

  /** Список рассылок с offset-пагинацией и опциональным фильтром по статусу. */
  async list(query: ListBroadcastsQueryDto): Promise<{
    data: BroadcastListItem[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const where: Prisma.BroadcastWhereInput = {};
    if (query.status) where.status = query.status;

    const [rows, total] = await Promise.all([
      this.prisma.broadcast.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.broadcast.count({ where }),
    ]);

    return { data: rows.map((r) => this.toView(r)), meta: { page, limit, total } };
  }

  /**
   * Детальный view рассылки: BroadcastView + body + фильтры + разбивка доставок.
   * delivery_stats: { channel: { status: count } }. IN_APP — по таблице notifications.
   */
  async getDetail(id: string): Promise<BroadcastDetail> {
    const row = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Broadcast not found',
      });
    }

    // Разбивка доставок по каналам/статусам через notificationDelivery.groupBy
    const grouped = await this.prisma.notificationDelivery.groupBy({
      by: ['channel', 'status'],
      where: { notification: { broadcastId: id } },
      _count: { _all: true },
    });
    const stats: Record<string, Record<string, number>> = {};
    for (const g of grouped) {
      stats[g.channel] ??= {};
      stats[g.channel][g.status] = g._count._all;
    }

    // IN_APP: считаем по самим notification (read/unread)
    const [inAppTotal, inAppRead] = await Promise.all([
      this.prisma.notification.count({ where: { broadcastId: id } }),
      this.prisma.notification.count({
        where: { broadcastId: id, status: NotificationStatus.READ },
      }),
    ]);
    stats[NotificationChannel.IN_APP] = { total: inAppTotal, read: inAppRead };

    return {
      ...this.toView(row),
      body: row.body,
      filter_status: row.filterStatus,
      filter_role: row.filterRole,
      target_user_id: row.targetUserId,
      delivery_stats: stats,
    };
  }

  /**
   * Отменяет рассылку в статусе SCHEDULED → CANCELED.
   * Если рассылка не найдена или не в статусе SCHEDULED — 400 BadRequest.
   */
  async cancel(adminId: string, id: string): Promise<BroadcastView> {
    const { count } = await this.prisma.broadcast.updateMany({
      where: { id, status: BroadcastStatus.SCHEDULED },
      data: { status: BroadcastStatus.CANCELED },
    });

    if (count === 0) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Only a SCHEDULED broadcast can be canceled',
      });
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'BROADCAST_CANCEL',
        entityType: 'broadcast',
        entityId: id,
        metadata: {},
      },
    });

    const row = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Broadcast not found',
      });
    }
    return this.toView(row);
  }

  // ─── private ──────────────────────────────────────────────────────────────

  private toView(row: {
    id: string;
    status: BroadcastStatus;
    audienceType: string;
    language: string;
    channels: NotificationChannel[];
    title: string;
    recipientCount: number;
    scheduledAt: Date | null;
    sentAt: Date | null;
    createdAt: Date;
  }): BroadcastView {
    return {
      id: row.id,
      status: row.status,
      audience_type: row.audienceType,
      language: row.language,
      channels: row.channels,
      title: row.title,
      recipient_count: row.recipientCount,
      scheduled_at: row.scheduledAt ? row.scheduledAt.toISOString() : null,
      sent_at: row.sentAt ? row.sentAt.toISOString() : null,
      created_at: row.createdAt.toISOString(),
    };
  }
}
