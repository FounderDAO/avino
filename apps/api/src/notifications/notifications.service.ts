import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
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
