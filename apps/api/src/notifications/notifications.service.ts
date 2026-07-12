import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DevicePlatform,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import { PrismaService } from '../prisma';
import { ListNotificationsQueryDto } from './dto/list-notifications.dto';

/** Дефолт/максимум размера страницы (API.md §4: default 20, max 100). */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Ссылки на сущности промо для рендера письма (data_json уведомления). */
export interface PromotionExpiredNotificationData {
  listingId: string;
  promotionId: string;
  promotionType: string;
  expiredAt: string;
}

/** Ссылки на сущности saved-search алерта (data_json уведомления, TASK-102). */
export interface SavedSearchNewListingNotificationData {
  savedSearchId: string;
  savedSearchName: string;
  listingId: string;
}

/** Ссылки на сущности нового сообщения чата (data_json уведомления, TASK-111). */
export interface ChatMessageNotificationData {
  threadId: string;
  listingId: string;
  messageId: string;
  senderId: string;
}

/** data_json уведомления о новой заявке на тур (NEW_LEAD). */
export interface TourRequestNotificationData {
  tourRequestId: string;
  listingId: string;
  requestedDate: string;
  windowStart: string;
  windowEnd: string;
}

/** data_json уведомления о смене статуса заявки (TOUR_REQUEST_STATUS_CHANGED). */
export interface TourStatusChangedNotificationData {
  tourRequestId: string;
  listingId: string;
  status: string;
}

/** Данные уведомления о решении по заявке «Стать агентом» (ADR-0140). */
export interface AgentApplicationResolvedNotificationData {
  applicationId: string;
  status: 'APPROVED' | 'REJECTED';
  rejectReason: string | null;
}

/** Поля выборки уведомления под {@link NotificationResponse}. */
const SELECT = {
  id: true,
  type: true,
  channel: true,
  status: true,
  title: true,
  body: true,
  dataJson: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof SELECT }>;

/**
 * Позиция keyset-курсора ленты: `(created_at, id)` последнего элемента страницы.
 * Порядок — по времени создания (свежие сверху), как у `/favorites`.
 */
interface NotificationCursor {
  createdAt: string;
  id: string;
}

/** Объект уведомления в ответах API (API.md §14, snake_case контракт). */
export interface NotificationResponse {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationStatus;
  title: string | null;
  body: string | null;
  data_json: unknown;
  read_at: string | null;
  created_at: string;
}

/**
 * Ответ `GET /api/v1/notifications`: страница + `meta` с keyset-курсором и
 * счётчиком непрочитанных (API.md §14). `unread` — глобальный бейдж (все
 * непрочитанные пользователя), не зависит от фильтров `status`/`type`.
 */
export interface NotificationListResponse {
  data: NotificationResponse[];
  meta: {
    limit: number;
    total: number;
    unread: number;
    next_cursor: string | null;
  };
}

/**
 * Ответ `POST /api/v1/notifications/devices` (API.md §14). Минимальный квиток
 * регистрации push-устройства: подтверждает `id` строки и что токен активен.
 */
export interface DeviceResponse {
  id: string;
  platform: DevicePlatform;
  is_active: boolean;
}

/**
 * NotificationsService — постановка и чтение уведомлений (DB_SCHEMA §11).
 *
 * Две роли:
 * - **Producer** (`queue*`): доменные модули ставят PENDING-строку `notifications`
 *   в своей транзакции; отдельный воркер отправит EMAIL/PUSH позже — синхронной
 *   отправки в запросе/джобе нет (как в ModerationService).
 * - **Reader** (TASK-100, API.md §14): in-app лента и отметки прочтения. Все
 *   read/write-операции scoped по `user_id` — пользователь видит и меняет только
 *   свои уведомления (`GUEST` отсекает {@link JwtAuthGuard} на контроллере).
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Поставить уведомление владельцу об истечении промо (TASK-123,
   * `NotificationType.PROMOTION_EXPIRED`). Канал — EMAIL (как у статусов
   * модерации); транспорт подключается позже. Принимает `tx`, чтобы коммититься
   * в одной транзакции с доменной мутацией.
   */
  async queuePromotionExpired(
    tx: Prisma.TransactionClient,
    userId: string,
    data: PromotionExpiredNotificationData,
  ): Promise<void> {
    await tx.notification.create({
      data: {
        userId,
        type: NotificationType.PROMOTION_EXPIRED,
        channel: NotificationChannel.EMAIL,
        dataJson: {
          listing_id: data.listingId,
          promotion_id: data.promotionId,
          promotion_type: data.promotionType,
          expired_at: data.expiredAt,
        },
      },
    });
  }

  /**
   * Поставить уведомление о новом объявлении по сохранённому поиску (TASK-102,
   * `NotificationType.SAVED_SEARCH_NEW_LISTING`). Канал — EMAIL (saved-search
   * алерты — это email-уведомления, §11/§16); одно уведомление на новое
   * совпадение. Принимает `tx`, чтобы коммититься в одной транзакции с продвижкой
   * `last_checked_at` матчера — постановка алертов и сдвиг watermark атомарны.
   */
  async queueSavedSearchNewListing(
    tx: Prisma.TransactionClient,
    userId: string,
    data: SavedSearchNewListingNotificationData,
  ): Promise<void> {
    await tx.notification.create({
      data: {
        userId,
        type: NotificationType.SAVED_SEARCH_NEW_LISTING,
        channel: NotificationChannel.EMAIL,
        dataJson: {
          saved_search_id: data.savedSearchId,
          saved_search_name: data.savedSearchName,
          listing_id: data.listingId,
        },
      },
    });
  }

  /**
   * Поставить уведомление получателю о новом сообщении в чате (TASK-111,
   * `NotificationType.NEW_CHAT_MESSAGE`). Канал — IN_APP: чат — это in-app
   * уведомление (бейдж/лента TASK-100), а не email-дайджест; PUSH-транспорт
   * подключится с регистрацией устройств (DB_SCHEMA §11, стаб). Получатель —
   * второй участник треда (не отправитель), вычисляется в {@link ChatService}.
   * Принимает `tx`, чтобы коммититься в одной транзакции с созданием сообщения
   * и продвижкой `last_message_at` треда (атомарность сообщение↔уведомление).
   */
  async queueChatMessage(
    tx: Prisma.TransactionClient,
    userId: string,
    data: ChatMessageNotificationData,
  ): Promise<void> {
    await tx.notification.create({
      data: {
        userId,
        type: NotificationType.NEW_CHAT_MESSAGE,
        channel: NotificationChannel.IN_APP,
        dataJson: {
          thread_id: data.threadId,
          listing_id: data.listingId,
          message_id: data.messageId,
          sender_id: data.senderId,
        },
      },
    });
  }

  /**
   * Уведомить владельца о новой заявке на тур (оживляем NEW_LEAD). Канал IN_APP.
   * Принимает `tx`, чтобы коммититься в одной транзакции с созданием заявки.
   */
  async queueTourRequest(
    tx: Prisma.TransactionClient,
    userId: string,
    data: TourRequestNotificationData,
  ): Promise<void> {
    await tx.notification.create({
      data: {
        userId,
        type: NotificationType.NEW_LEAD,
        channel: NotificationChannel.IN_APP,
        dataJson: {
          tour_request_id: data.tourRequestId,
          listing_id: data.listingId,
          requested_date: data.requestedDate,
          window_start: data.windowStart,
          window_end: data.windowEnd,
        },
      },
    });
  }

  /**
   * Уведомить вторую сторону о смене статуса заявки. Канал IN_APP.
   * Принимает `tx`, чтобы коммититься в одной транзакции со сменой статуса.
   */
  async queueTourStatusChanged(
    tx: Prisma.TransactionClient,
    userId: string,
    data: TourStatusChangedNotificationData,
  ): Promise<void> {
    await tx.notification.create({
      data: {
        userId,
        type: NotificationType.TOUR_REQUEST_STATUS_CHANGED,
        channel: NotificationChannel.IN_APP,
        dataJson: {
          tour_request_id: data.tourRequestId,
          listing_id: data.listingId,
          status: data.status,
        },
      },
    });
  }

  /**
   * Уведомить заявителя о решении по заявке «Стать агентом» (ADR-0140).
   * Канал IN_APP. Принимает `tx`, чтобы коммититься в одной транзакции со
   * сменой статуса заявки.
   */
  async queueAgentApplicationResolved(
    tx: Prisma.TransactionClient,
    userId: string,
    data: AgentApplicationResolvedNotificationData,
  ): Promise<void> {
    await tx.notification.create({
      data: {
        userId,
        type: NotificationType.AGENT_APPLICATION_RESOLVED,
        channel: NotificationChannel.IN_APP,
        dataJson: {
          application_id: data.applicationId,
          status: data.status,
          reject_reason: data.rejectReason,
        },
      },
    });
  }

  /**
   * `GET /api/v1/notifications` — лента пользователя, свежие сверху
   * (`created_at DESC, id DESC`), keyset-пагинация. Опциональные фильтры
   * `status`/`type`. `unread` в `meta` считается по всем непрочитанным
   * пользователя (бейдж), независимо от фильтров.
   */
  async list(
    user: AuthenticatedUser,
    query: ListNotificationsQueryDto,
  ): Promise<NotificationListResponse> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = this.decodeCursor(query.cursor);

    const baseWhere: Prisma.NotificationWhereInput = { userId: user.id };
    if (query.status !== undefined) {
      baseWhere.status = query.status;
    }
    if (query.type !== undefined) {
      baseWhere.type = query.type;
    }
    const pageWhere: Prisma.NotificationWhereInput = cursor
      ? {
          ...baseWhere,
          OR: [
            { createdAt: { lt: new Date(cursor.createdAt) } },
            { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
          ],
        }
      : baseWhere;

    const [rows, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: pageWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: SELECT,
      }),
      this.prisma.notification.count({ where: baseWhere }),
      this.prisma.notification.count({
        where: { userId: user.id, readAt: null },
      }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      data: page.map((row) => this.toResponse(row)),
      meta: {
        limit,
        total,
        unread,
        next_cursor:
          hasMore && last
            ? this.encodeCursor({
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              })
            : null,
      },
    };
  }

  /**
   * `POST /api/v1/notifications/:id/read` — отметить уведомление прочитанным
   * (`read_at = now`, `status = READ`). Только своё (`(id, user_id)`-фильтр):
   * чужое/несуществующее → `404`. Идемпотентно (повторная отметка → `204`). → `204`.
   */
  async markRead(user: AuthenticatedUser, id: string): Promise<void> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
    if (count === 0) {
      throw this.notFound();
    }
  }

  /**
   * `POST /api/v1/notifications/read-all` — отметить все непрочитанные
   * прочитанными. Обновляет только свои строки с `read_at IS NULL` (идемпотентно,
   * не трогает уже прочитанные). → `204`.
   */
  async markAllRead(user: AuthenticatedUser): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
  }

  /**
   * `POST /api/v1/notifications/devices` — регистрация push-токена устройства
   * (stub, ADR-0010). Идемпотентна по `push_token` (upsert): один и тот же токен
   * клиент FCM/APNs переотправляет при каждом запуске и ротации. Если токен уже
   * есть, строка «переназначается» текущему пользователю (claim — устройство
   * сменило аккаунт) и реактивируется (`is_active=true`, `last_seen_at=now`).
   * Поэтому коллизии `UNIQUE(push_token)` не происходит — `409` не возвращается. → `201`.
   */
  async registerDevice(
    user: AuthenticatedUser,
    platform: DevicePlatform,
    pushToken: string,
  ): Promise<DeviceResponse> {
    const now = new Date();
    const device = await this.prisma.notificationDevice.upsert({
      where: { pushToken },
      create: {
        userId: user.id,
        platform,
        pushToken,
        isActive: true,
        lastSeenAt: now,
      },
      update: {
        userId: user.id,
        platform,
        isActive: true,
        lastSeenAt: now,
      },
      select: { id: true, platform: true, isActive: true },
    });
    return {
      id: device.id,
      platform: device.platform,
      is_active: device.isActive,
    };
  }

  /**
   * `DELETE /api/v1/notifications/devices/:id` — отвязать устройство (hard delete).
   * Удаление scoped по `(id, user_id)`: чужое/несуществующее → `404` (отвязать
   * чужой токен нельзя). Физическое удаление освобождает `push_token` для чистой
   * повторной регистрации. → `204`.
   */
  async removeDevice(user: AuthenticatedUser, id: string): Promise<void> {
    const { count } = await this.prisma.notificationDevice.deleteMany({
      where: { id, userId: user.id },
    });
    if (count === 0) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Device not found',
      });
    }
  }

  /** Непрозрачный keyset-токен (base64url JSON позиции). */
  private encodeCursor(cursor: NotificationCursor): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  /**
   * Разбор keyset-токена. Невалидный/повреждённый `cursor` → `400` (не молчаливый
   * сброс к первой странице, чтобы клиент заметил ошибку пагинации).
   */
  private decodeCursor(raw: string | undefined): NotificationCursor | null {
    if (raw === undefined) {
      return null;
    }
    try {
      const json = Buffer.from(raw, 'base64url').toString('utf8');
      const parsed = JSON.parse(json) as Partial<NotificationCursor>;
      if (
        typeof parsed.createdAt !== 'string' ||
        typeof parsed.id !== 'string' ||
        Number.isNaN(new Date(parsed.createdAt).getTime())
      ) {
        throw new Error('malformed cursor');
      }
      return { createdAt: parsed.createdAt, id: parsed.id };
    } catch {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Invalid pagination cursor',
      });
    }
  }

  private toResponse(row: NotificationRow): NotificationResponse {
    return {
      id: row.id,
      type: row.type,
      channel: row.channel,
      status: row.status,
      title: row.title,
      body: row.body,
      data_json: row.dataJson ?? null,
      read_at: row.readAt ? row.readAt.toISOString() : null,
      created_at: row.createdAt.toISOString(),
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: ApiErrorCode.NOT_FOUND,
      message: 'Notification not found',
    });
  }
}
