import { Injectable } from '@nestjs/common';
import {
  ListingStatus,
  ModerationAction,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma,
  PromotionAdminAction,
  PromotionType,
} from '@prisma/client';
import { PaginatedResponse } from '../moderation';
import { PrismaService } from '../prisma';
import { ListModerationLogsQueryDto } from './dto/list-moderation-logs.dto';
import { ListNotificationLogsQueryDto } from './dto/list-notification-logs.dto';
import { ListPromotionLogsQueryDto } from './dto/list-promotion-logs.dto';

/** Запись глобального журнала модерации (API.md §16, `GET /admin/moderation-logs`). */
export interface ModerationLogItem {
  id: string;
  listing_id: string;
  moderator_id: string | null;
  action: ModerationAction;
  old_status: ListingStatus | null;
  new_status: ListingStatus | null;
  reason: string | null;
  created_at: string;
}

/** Запись журнала промо-действий (API.md §16, `GET /admin/promotion-logs`). */
export interface PromotionLogItem {
  id: string;
  listing_promotion_id: string | null;
  listing_id: string;
  admin_id: string | null;
  action: PromotionAdminAction;
  old_type: PromotionType | null;
  new_type: PromotionType | null;
  old_expires_at: string | null;
  new_expires_at: string | null;
  reason: string | null;
  created_at: string;
}

/** Запись журнала уведомлений (API.md §16, `GET /admin/notification-logs`). */
export interface NotificationLogItem {
  id: string;
  user_id: string;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationStatus;
  title: string | null;
  body: string | null;
  data_json: unknown;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
}

/** Дефолты пагинации админ-списка (API.md §4: default `limit` 20, max 100). */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const MODERATION_SELECT = {
  id: true,
  listingId: true,
  moderatorId: true,
  action: true,
  oldStatus: true,
  newStatus: true,
  reason: true,
  createdAt: true,
} as const;

const PROMOTION_SELECT = {
  id: true,
  listingPromotionId: true,
  listingId: true,
  adminId: true,
  action: true,
  oldType: true,
  newType: true,
  oldExpiresAt: true,
  newExpiresAt: true,
  reason: true,
  createdAt: true,
} as const;

const NOTIFICATION_SELECT = {
  id: true,
  userId: true,
  type: true,
  channel: true,
  status: true,
  title: true,
  body: true,
  dataJson: true,
  readAt: true,
  sentAt: true,
  createdAt: true,
} as const;

type ModerationLogRow = Prisma.ModerationLogGetPayload<{
  select: typeof MODERATION_SELECT;
}>;
type PromotionLogRow = Prisma.PromotionLogGetPayload<{
  select: typeof PROMOTION_SELECT;
}>;
type NotificationLogRow = Prisma.NotificationGetPayload<{
  select: typeof NOTIFICATION_SELECT;
}>;

/**
 * AdminLogsService — read-side доменных журналов для админ-панели (TASK-131,
 * API.md §16). Глобальные (по всем сущностям) пагинированные срезы трёх таблиц:
 *  - `moderation_logs` (TASK-053) — журнал модерации;
 *  - `promotion_logs` (TASK-121/122) — журнал админских действий над промо;
 *  - `notifications` (TASK-100..) — журнал уведомлений.
 *
 * `audit_logs` читается отдельно — {@link AuditService} (кросс-доменная таблица).
 * Доступ — только ADMIN (RolesGuard в {@link AdminLogsController}). Везде
 * сортировка `created_at DESC, id DESC` — детерминированный хвост при равных
 * таймстемпах. Фильтры опциональны и комбинируются через AND.
 */
@Injectable()
export class AdminLogsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `GET /api/v1/admin/moderation-logs` — глобальный журнал модерации. */
  async listModerationLogs(
    query: ListModerationLogsQueryDto,
  ): Promise<PaginatedResponse<ModerationLogItem>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const where: Prisma.ModerationLogWhereInput = {};
    if (query.listing_id) where.listingId = query.listing_id;
    if (query.moderator_id) where.moderatorId = query.moderator_id;
    if (query.action) where.action = query.action;

    const [rows, total] = await Promise.all([
      this.prisma.moderationLog.findMany({
        where,
        select: MODERATION_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.moderationLog.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toModeration(row)),
      meta: { page, limit, total },
    };
  }

  /** `GET /api/v1/admin/promotion-logs` — журнал админских промо-действий. */
  async listPromotionLogs(
    query: ListPromotionLogsQueryDto,
  ): Promise<PaginatedResponse<PromotionLogItem>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const where: Prisma.PromotionLogWhereInput = {};
    if (query.listing_id) where.listingId = query.listing_id;
    if (query.admin_id) where.adminId = query.admin_id;
    if (query.action) where.action = query.action;

    const [rows, total] = await Promise.all([
      this.prisma.promotionLog.findMany({
        where,
        select: PROMOTION_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.promotionLog.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toPromotion(row)),
      meta: { page, limit, total },
    };
  }

  /** `GET /api/v1/admin/notification-logs` — глобальный журнал уведомлений. */
  async listNotificationLogs(
    query: ListNotificationLogsQueryDto,
  ): Promise<PaginatedResponse<NotificationLogItem>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const where: Prisma.NotificationWhereInput = {};
    if (query.user_id) where.userId = query.user_id;
    if (query.type) where.type = query.type;
    if (query.channel) where.channel = query.channel;
    if (query.status) where.status = query.status;

    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select: NOTIFICATION_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toNotification(row)),
      meta: { page, limit, total },
    };
  }

  private toModeration(row: ModerationLogRow): ModerationLogItem {
    return {
      id: row.id,
      listing_id: row.listingId,
      moderator_id: row.moderatorId,
      action: row.action,
      old_status: row.oldStatus,
      new_status: row.newStatus,
      reason: row.reason,
      created_at: row.createdAt.toISOString(),
    };
  }

  private toPromotion(row: PromotionLogRow): PromotionLogItem {
    return {
      id: row.id,
      listing_promotion_id: row.listingPromotionId,
      listing_id: row.listingId,
      admin_id: row.adminId,
      action: row.action,
      old_type: row.oldType,
      new_type: row.newType,
      old_expires_at: row.oldExpiresAt?.toISOString() ?? null,
      new_expires_at: row.newExpiresAt?.toISOString() ?? null,
      reason: row.reason,
      created_at: row.createdAt.toISOString(),
    };
  }

  private toNotification(row: NotificationLogRow): NotificationLogItem {
    return {
      id: row.id,
      user_id: row.userId,
      type: row.type,
      channel: row.channel,
      status: row.status,
      title: row.title,
      body: row.body,
      data_json: row.dataJson ?? null,
      read_at: row.readAt?.toISOString() ?? null,
      sent_at: row.sentAt?.toISOString() ?? null,
      created_at: row.createdAt.toISOString(),
    };
  }
}
