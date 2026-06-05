import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Currency, ListingStatus, Prisma } from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import { NotificationsService } from '../notifications';
import { PrismaService } from '../prisma';
import { SearchService } from '../search';

/** Дефолт/максимум размера страницы (API.md §4: default 20, max 100). */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Превью листинга в карточке треда (API.md §13). Подмножество полей карточки
 * `/search`: гидратация делегируется {@link SearchService.cardsByIds}, чтобы не
 * дублировать выбор языка перевода и cover-медиа. `DELETED`-листинг не вырезается
 * (в отличие от `/favorites`) — переписку видно даже после снятия объявления,
 * `status` отражает текущее состояние.
 */
export interface ThreadListingPreview {
  title: string;
  thumbnail_url: string | null;
  price: string;
  currency: Currency;
  status: ListingStatus;
}

/** Элемент списка `GET /api/v1/chat/threads` (API.md §13). */
export interface ThreadListItem {
  id: string;
  listing_id: string;
  initiator_id: string;
  owner_id: string;
  last_message_at: string | null;
  unread_count: number;
  listing_preview: ThreadListingPreview | null;
}

/** Ответ `POST /api/v1/chat/threads` (API.md §13). */
export interface ThreadResponse {
  id: string;
  listing_id: string;
  initiator_id: string;
  owner_id: string;
  created_at: string;
}

/**
 * Результат создания/получения треда: `created` различает `201` (новый) и `200`
 * (тред уже существовал — идемпотентно), которые контроллер проставляет статусом.
 */
export interface CreateThreadResult {
  thread: ThreadResponse;
  created: boolean;
}

/**
 * Пагинированный ответ списка тредов. `next_cursor` — keyset-токен следующей
 * страницы (non-breaking-расширение к `{ limit, total }` из API.md §13).
 */
export interface ThreadListResponse {
  data: ThreadListItem[];
  meta: {
    limit: number;
    total: number;
    next_cursor: string | null;
  };
}

/**
 * Позиция keyset-курсора списка тредов: `(last_message_at, created_at, id)`
 * последнего элемента страницы. Порядок — по последней активности
 * (`last_message_at DESC NULLS LAST`), затем `created_at DESC`, затем `id DESC`
 * как уникальный тай-брейкер. `lastMessageAt = null` — треды без сообщений
 * (в TASK-110 это все треды) сортируются по `created_at` в хвосте после тредов
 * с активностью.
 */
interface ThreadCursor {
  lastMessageAt: string | null;
  createdAt: string;
  id: string;
}

/** Сообщение в ответах API (API.md §13, snake_case контракт). */
export interface MessageResponse {
  id: string;
  thread_id: string;
  sender_id: string | null;
  body: string;
  is_read: boolean;
  created_at: string;
}

/**
 * Ответ `GET /api/v1/chat/threads/:id/messages` (API.md §13). В отличие от списка
 * тредов, `total` не отдаётся (лента сообщения — бесконечный скролл в историю,
 * счётчик не нужен), только keyset-`next_cursor`.
 */
export interface MessageListResponse {
  data: MessageResponse[];
  meta: {
    limit: number;
    next_cursor: string | null;
  };
}

/**
 * Позиция keyset-курсора ленты сообщений: `(created_at, id)` последнего элемента
 * страницы. Порядок — свежие сверху (`created_at DESC, id DESC`), как у
 * `/notifications`; `next_cursor` листает в историю.
 */
interface MessageCursor {
  createdAt: string;
  id: string;
}

/**
 * ChatService — внутренний чат «инициатор ↔ владелец листинга» (TASK-110,
 * API.md §13, DB_SCHEMA.md §10).
 *
 * Все эндпоинты под Bearer ({@link JwtAuthGuard} на контроллере): `GUEST` без
 * токена → `401` (CLAUDE.md §10/§11). Тред уникален по
 * `(listing_id, initiator_id, owner_id)` — повторный `POST` идемпотентен
 * (возвращает существующий тред с `200`). Новый тред разрешён только на видимом
 * публично листинге (`ACTIVE`): иначе `404` (нет листинга) или `422
 * LISTING_NOT_AVAILABLE` (`DELETED`/непубличный). Писать самому себе нельзя
 * (`initiator == owner` → `403 FORBIDDEN`).
 *
 * MVP — polling (DB_SCHEMA.md §10); WebSocket добавляется позже без изменения
 * схемы. Создание сообщений и уведомление `NEW_CHAT_MESSAGE` — TASK-111.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * `POST /api/v1/chat/threads` — создать или получить тред с создателем листинга.
   * `owner_id` выводится из `listing.owner_id`, `initiator_id` — текущий
   * пользователь. Идемпотентно по unique-ключу: гонка на создание ловится как
   * `P2002` и разрешается возвратом существующего треда.
   */
  async createThread(
    user: AuthenticatedUser,
    listingId: string,
  ): Promise<CreateThreadResult> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { ownerId: true, status: true },
    });
    if (!listing) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }
    // Новый тред только на публично видимом (ACTIVE) листинге; DELETED и прочие
    // непубличные статусы → 422 LISTING_NOT_AVAILABLE (API.md §13).
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new UnprocessableEntityException({
        code: ApiErrorCode.LISTING_NOT_AVAILABLE,
        message: 'Listing is not available for chat',
      });
    }
    // Нельзя писать самому себе (владелец листинга = инициатор) — API.md §13.
    if (listing.ownerId === user.id) {
      throw new ForbiddenException({
        code: ApiErrorCode.FORBIDDEN,
        message: 'Cannot start a chat thread with yourself',
      });
    }

    const key = {
      listingId,
      initiatorId: user.id,
      ownerId: listing.ownerId,
    };

    const existing = await this.prisma.chatThread.findUnique({
      where: { listingId_initiatorId_ownerId: key },
      select: this.threadSelect(),
    });
    if (existing) {
      return { thread: this.toThreadResponse(existing), created: false };
    }

    try {
      const created = await this.prisma.chatThread.create({
        data: key,
        select: this.threadSelect(),
      });
      return { thread: this.toThreadResponse(created), created: true };
    } catch (error) {
      // Гонка двух параллельных POST: unique-индекс отдаёт P2002 — перечитываем
      // и возвращаем уже существующий тред (идемпотентность сохраняется).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.chatThread.findUnique({
          where: { listingId_initiatorId_ownerId: key },
          select: this.threadSelect(),
        });
        if (raced) {
          return { thread: this.toThreadResponse(raced), created: false };
        }
      }
      throw error;
    }
  }

  /**
   * `GET /api/v1/chat/threads` — треды текущего пользователя (как `initiator`
   * ИЛИ `owner`), keyset-пагинация по последней активности. Для каждого треда:
   * `unread_count` (входящие непрочитанные) и `listing_preview` (карточка как в
   * `/search`, язык по `lang`/`Accept-Language`).
   */
  async listThreads(
    user: AuthenticatedUser,
    limitParam: number | undefined,
    rawCursor: string | undefined,
    langParam?: string,
    acceptLanguage?: string,
  ): Promise<ThreadListResponse> {
    const limit = Math.min(limitParam ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = this.decodeCursor(rawCursor);

    const baseWhere: Prisma.ChatThreadWhereInput = {
      OR: [{ initiatorId: user.id }, { ownerId: user.id }],
    };
    const pageWhere: Prisma.ChatThreadWhereInput = cursor
      ? { AND: [baseWhere, this.cursorFilter(cursor)] }
      : baseWhere;

    const [rows, total] = await Promise.all([
      this.prisma.chatThread.findMany({
        where: pageWhere,
        orderBy: [
          { lastMessageAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: limit + 1,
        select: this.threadSelect(),
      }),
      this.prisma.chatThread.count({ where: baseWhere }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    const [previews, unreadByThread] = await Promise.all([
      this.previewsByListing(
        page.map((row) => row.listingId),
        langParam,
        acceptLanguage,
      ),
      this.unreadCounts(
        page.map((row) => row.id),
        user.id,
      ),
    ]);

    const data: ThreadListItem[] = page.map((row) => ({
      id: row.id,
      listing_id: row.listingId,
      initiator_id: row.initiatorId,
      owner_id: row.ownerId,
      last_message_at: row.lastMessageAt
        ? row.lastMessageAt.toISOString()
        : null,
      unread_count: unreadByThread.get(row.id) ?? 0,
      listing_preview: previews.get(row.listingId) ?? null,
    }));

    return {
      data,
      meta: {
        limit,
        total,
        next_cursor:
          hasMore && last
            ? this.encodeCursor({
                lastMessageAt: last.lastMessageAt
                  ? last.lastMessageAt.toISOString()
                  : null,
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              })
            : null,
      },
    };
  }

  /**
   * `GET /api/v1/chat/threads/:id/messages` — сообщения треда, keyset-пагинация,
   * свежие сверху. Доступ: участник треда (`initiator`/`owner`) ИЛИ
   * `MODERATOR`/`ADMIN` (complaint/support-flow, API.md §13). Чтение НЕ помечает
   * сообщения прочитанными — это отдельный `POST /read`.
   */
  async listMessages(
    user: AuthenticatedUser,
    threadId: string,
    limitParam: number | undefined,
    rawCursor: string | undefined,
  ): Promise<MessageListResponse> {
    const thread = await this.prisma.chatThread.findUnique({
      where: { id: threadId },
      select: { initiatorId: true, ownerId: true },
    });
    this.assertCanRead(user, thread);

    const limit = Math.min(limitParam ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = this.decodeMessageCursor(rawCursor);

    const where: Prisma.ChatMessageWhereInput = { threadId };
    if (cursor) {
      where.OR = [
        { createdAt: { lt: new Date(cursor.createdAt) } },
        { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
      ];
    }

    const rows = await this.prisma.chatMessage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: this.messageSelect(),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      data: page.map((row) => this.toMessageResponse(row)),
      meta: {
        limit,
        next_cursor:
          hasMore && last
            ? this.encodeMessageCursor({
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              })
            : null,
      },
    };
  }

  /**
   * `POST /api/v1/chat/threads/:id/messages` — отправить сообщение. Доступ —
   * только участник треда (`MODERATOR`/`ADMIN` писать не могут — они лишь читают
   * для разбора жалоб). Слать нельзя на `DELETED`-листинге → `422
   * LISTING_NOT_AVAILABLE` (на прочих статусах переписка продолжается: тред уже
   * существует, объявление могло уйти в `SOLD`/`ARCHIVED`). В одной транзакции:
   * создаём сообщение, двигаем `last_message_at` треда (порядок списка) и ставим
   * `NEW_CHAT_MESSAGE` второму участнику (атомарность сообщение↔уведомление).
   */
  async createMessage(
    user: AuthenticatedUser,
    threadId: string,
    body: string,
  ): Promise<MessageResponse> {
    const thread = await this.prisma.chatThread.findUnique({
      where: { id: threadId },
      select: {
        initiatorId: true,
        ownerId: true,
        listingId: true,
        listing: { select: { status: true } },
      },
    });
    if (!thread) {
      throw this.threadNotFound();
    }
    if (!this.isParticipant(user, thread)) {
      throw this.forbidden();
    }
    if (thread.listing.status === ListingStatus.DELETED) {
      throw new UnprocessableEntityException({
        code: ApiErrorCode.LISTING_NOT_AVAILABLE,
        message: 'Listing is not available for chat',
      });
    }

    // Получатель уведомления — второй участник треда (не отправитель).
    const recipientId =
      thread.initiatorId === user.id ? thread.ownerId : thread.initiatorId;

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: { threadId, senderId: user.id, body },
        select: this.messageSelect(),
      });
      await tx.chatThread.update({
        where: { id: threadId },
        data: { lastMessageAt: created.createdAt },
      });
      await this.notifications.queueChatMessage(tx, recipientId, {
        threadId,
        listingId: thread.listingId,
        messageId: created.id,
        senderId: user.id,
      });
      return created;
    });

    return this.toMessageResponse(message);
  }

  /**
   * `POST /api/v1/chat/threads/:id/read` — отметить входящие сообщения
   * прочитанными (`is_read=true` для чужих сообщений отправителя). Доступ — только
   * участник треда. Идемпотентно (повторный вызов ничего не меняет). → `204`.
   */
  async markRead(user: AuthenticatedUser, threadId: string): Promise<void> {
    const thread = await this.prisma.chatThread.findUnique({
      where: { id: threadId },
      select: { initiatorId: true, ownerId: true },
    });
    if (!thread) {
      throw this.threadNotFound();
    }
    if (!this.isParticipant(user, thread)) {
      throw this.forbidden();
    }
    await this.prisma.chatMessage.updateMany({
      where: { threadId, senderId: { not: user.id }, isRead: false },
      data: { isRead: true },
    });
  }

  /** Текущий пользователь — участник треда (initiator или owner). */
  private isParticipant(
    user: AuthenticatedUser,
    thread: { initiatorId: string; ownerId: string },
  ): boolean {
    return thread.initiatorId === user.id || thread.ownerId === user.id;
  }

  /** Модератор/админ — доступ к чужим тредам только для complaint-flow (чтение). */
  private isModerator(user: AuthenticatedUser): boolean {
    return (
      user.roles.includes(UserRole.MODERATOR) ||
      user.roles.includes(UserRole.ADMIN)
    );
  }

  /**
   * Гард чтения сообщений: `404` если треда нет, `403` если запрашивающий не
   * участник и не модератор/админ.
   */
  private assertCanRead(
    user: AuthenticatedUser,
    thread: { initiatorId: string; ownerId: string } | null,
  ): asserts thread {
    if (!thread) {
      throw this.threadNotFound();
    }
    if (!this.isParticipant(user, thread) && !this.isModerator(user)) {
      throw this.forbidden();
    }
  }

  private threadNotFound(): NotFoundException {
    return new NotFoundException({
      code: ApiErrorCode.NOT_FOUND,
      message: 'Chat thread not found',
    });
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      code: ApiErrorCode.FORBIDDEN,
      message: 'Not a participant of this chat thread',
    });
  }

  /** Колонки сообщения под {@link MessageResponse}. */
  private messageSelect() {
    return {
      id: true,
      threadId: true,
      senderId: true,
      body: true,
      isRead: true,
      createdAt: true,
    } satisfies Prisma.ChatMessageSelect;
  }

  private toMessageResponse(row: {
    id: string;
    threadId: string;
    senderId: string | null;
    body: string;
    isRead: boolean;
    createdAt: Date;
  }): MessageResponse {
    return {
      id: row.id,
      thread_id: row.threadId,
      sender_id: row.senderId,
      body: row.body,
      is_read: row.isRead,
      created_at: row.createdAt.toISOString(),
    };
  }

  /** Непрозрачный keyset-токен ленты сообщений (base64url JSON позиции). */
  private encodeMessageCursor(cursor: MessageCursor): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  /** Разбор keyset-токена сообщений; повреждённый → `400` (как у тредов). */
  private decodeMessageCursor(raw: string | undefined): MessageCursor | null {
    if (raw === undefined) {
      return null;
    }
    try {
      const json = Buffer.from(raw, 'base64url').toString('utf8');
      const parsed = JSON.parse(json) as Partial<MessageCursor>;
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

  /** Колонки треда, нужные для ответов (создание и список). */
  private threadSelect() {
    return {
      id: true,
      listingId: true,
      initiatorId: true,
      ownerId: true,
      lastMessageAt: true,
      createdAt: true,
    } satisfies Prisma.ChatThreadSelect;
  }

  private toThreadResponse(row: {
    id: string;
    listingId: string;
    initiatorId: string;
    ownerId: string;
    createdAt: Date;
  }): ThreadResponse {
    return {
      id: row.id,
      listing_id: row.listingId,
      initiator_id: row.initiatorId,
      owner_id: row.ownerId,
      created_at: row.createdAt.toISOString(),
    };
  }

  /**
   * Превью листингов для карточек тредов: переиспользует
   * {@link SearchService.cardsByIds} (язык/перевод/cover-медиа) и сводит карточку
   * к подмножеству полей превью. Возвращает map `listingId → preview`.
   */
  private async previewsByListing(
    listingIds: string[],
    langParam?: string,
    acceptLanguage?: string,
  ): Promise<Map<string, ThreadListingPreview>> {
    const cards = await this.search.cardsByIds(
      listingIds,
      langParam,
      acceptLanguage,
    );
    return new Map(
      cards.map((card) => [
        card.id,
        {
          title: card.title,
          thumbnail_url: card.thumbnail_url,
          price: card.price,
          currency: card.currency,
          status: card.status,
        },
      ]),
    );
  }

  /**
   * Количество входящих непрочитанных сообщений по каждому треду страницы:
   * `sender_id != currentUser AND is_read = false`. В TASK-110 сообщений ещё нет
   * (эндпоинты — TASK-111), поэтому фактически возвращает пустую map (все `0`);
   * логика корректна заранее и заработает с появлением сообщений.
   */
  private async unreadCounts(
    threadIds: string[],
    userId: string,
  ): Promise<Map<string, number>> {
    if (threadIds.length === 0) {
      return new Map();
    }
    const grouped = await this.prisma.chatMessage.groupBy({
      by: ['threadId'],
      where: {
        threadId: { in: threadIds },
        isRead: false,
        senderId: { not: userId },
      },
      _count: { _all: true },
    });
    return new Map(grouped.map((g) => [g.threadId, g._count._all]));
  }

  /**
   * Keyset-предикат «строго после курсора» для порядка
   * `last_message_at DESC NULLS LAST, created_at DESC, id DESC`. Две ветки:
   * курсор в секции с `last_message_at` (тогда следующими идут меньшие даты и
   * вся NULL-секция) либо курсор уже в NULL-хвосте (тогда только меньшие
   * `created_at`/`id` среди NULL).
   */
  private cursorFilter(cursor: ThreadCursor): Prisma.ChatThreadWhereInput {
    const createdAt = new Date(cursor.createdAt);
    if (cursor.lastMessageAt === null) {
      return {
        lastMessageAt: null,
        OR: [
          { createdAt: { lt: createdAt } },
          { createdAt, id: { lt: cursor.id } },
        ],
      };
    }
    const lastMessageAt = new Date(cursor.lastMessageAt);
    return {
      OR: [
        { lastMessageAt: { lt: lastMessageAt } },
        { lastMessageAt, createdAt: { lt: createdAt } },
        { lastMessageAt, createdAt, id: { lt: cursor.id } },
        { lastMessageAt: null },
      ],
    };
  }

  /** Непрозрачный keyset-токен (base64url JSON позиции). */
  private encodeCursor(cursor: ThreadCursor): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  /**
   * Разбор keyset-токена. Невалидный/повреждённый `cursor` → `400` (не молчаливый
   * сброс к первой странице, чтобы клиент заметил ошибку пагинации).
   */
  private decodeCursor(raw: string | undefined): ThreadCursor | null {
    if (raw === undefined) {
      return null;
    }
    try {
      const json = Buffer.from(raw, 'base64url').toString('utf8');
      const parsed = JSON.parse(json) as Partial<ThreadCursor>;
      const lastMessageAtOk =
        parsed.lastMessageAt === null ||
        (typeof parsed.lastMessageAt === 'string' &&
          !Number.isNaN(new Date(parsed.lastMessageAt).getTime()));
      if (
        !lastMessageAtOk ||
        typeof parsed.createdAt !== 'string' ||
        typeof parsed.id !== 'string' ||
        Number.isNaN(new Date(parsed.createdAt).getTime())
      ) {
        throw new Error('malformed cursor');
      }
      return {
        lastMessageAt: parsed.lastMessageAt ?? null,
        createdAt: parsed.createdAt,
        id: parsed.id,
      };
    } catch {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Invalid pagination cursor',
      });
    }
  }
}
