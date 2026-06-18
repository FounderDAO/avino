import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Currency,
  Language,
  ListingStatus,
  ModerationAction,
  NotificationChannel,
  NotificationType,
  Prisma,
  PropertyType,
  TransactionType,
  UserStatus,
} from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { ListAdminListingsQueryDto } from './dto/list-admin-listings.dto';
import { ModerateListingDto } from './dto/moderate-listing.dto';

/**
 * Инлайн-карточка автора объявления в админ-очереди (API.md §16). Модератору
 * важно сразу видеть, кто создал листинг, без отдельного `GET /admin/users/:id`
 * (он ADMIN-only, MODERATOR получил бы `403`). Поэтому минимальный профиль
 * автора отдаётся прямо в строке списка — он доступен и MODERATOR, и ADMIN.
 *
 * `display_name`/`first_name`/`last_name`/`contact_phone` — из `user_profiles`
 * (могут быть `null`, если профиль не заполнен); `email`/`phone`/`status`/
 * `created_at` — из `users`. `roles` — коды назначенных ролей (`USER`/`OWNER`/…).
 */
export interface AdminListingOwner {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  contact_phone: string | null;
  status: UserStatus;
  roles: string[];
  created_at: string;
}

/**
 * Компактная карточка листинга для админ-очереди (API.md §16). В отличие от
 * owner-списка включает `owner_id` (модератору важен автор) и любые статусы.
 * `title` берётся на `original_language` (исходный авторский текст). Decimal/
 * даты сериализуются строками (контрактный формат). `owner` — инлайн-профиль
 * автора (см. {@link AdminListingOwner}), чтобы карточка модерации показывала
 * «кто создал» без ADMIN-only `GET /admin/users/:id`.
 */
export interface AdminListingListItem {
  id: string;
  status: ListingStatus;
  transaction_type: TransactionType;
  property_type: PropertyType;
  price: string;
  currency: Currency;
  city_id: string | null;
  district_id: string | null;
  owner_id: string;
  owner: AdminListingOwner;
  original_language: Language;
  title: string;
  published_at: string | null;
  created_at: string;
}

/** Ответ `PATCH /api/v1/admin/listings/:id/status` (API.md §16). */
export interface ModerationResultResponse {
  id: string;
  status: ListingStatus;
  published_at: string | null;
}

/** Одна запись истории модерации (API.md §16, `GET .../moderation-logs`). */
export interface ModerationLogResponse {
  id: string;
  action: ModerationAction;
  old_status: ListingStatus | null;
  new_status: ListingStatus | null;
  moderator_id: string | null;
  reason: string | null;
  created_at: string;
}

/**
 * Единый envelope коллекций (API.md §4): `data` + `meta` с обязательным `total`.
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

/** Дефолты пагинации админ-списка (API.md §4: default `limit` 20, max 100). */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Маппинг действия модерации на целевой `listing_status` (API.md §16).
 * APPROVE → ACTIVE, SEND_TO_DRAFT → DRAFT, REJECT → REJECTED, DELETE → DELETED.
 */
const ACTION_TO_STATUS: Record<ModerationAction, ListingStatus> = {
  [ModerationAction.APPROVE]: ListingStatus.ACTIVE,
  [ModerationAction.SEND_TO_DRAFT]: ListingStatus.DRAFT,
  [ModerationAction.REJECT]: ListingStatus.REJECTED,
  [ModerationAction.DELETE]: ListingStatus.DELETED,
};

/**
 * Статусы, над которыми модерация имеет смысл (moderation queue, CLAUDE.md §9).
 * Владельческие терминальные статусы (ARCHIVED/SOLD/RENTED) и уже удалённые
 * листинги модератор не переводит — попытка → `422 INVALID_STATUS_TRANSITION`
 * (для DELETED — `404`, т.к. он исключён из read-path).
 */
const MODERATABLE_STATUSES: readonly ListingStatus[] = [
  ListingStatus.NEW,
  ListingStatus.ACTIVE,
  ListingStatus.DRAFT,
  ListingStatus.REJECTED,
];

/** Все языки, для которых обязателен перевод перед публикацией (ADR-0091). */
const REQUIRED_LANGUAGES: readonly Language[] = Object.values(Language);

const LISTING_LIST_SELECT = {
  id: true,
  ownerId: true,
  status: true,
  transactionType: true,
  propertyType: true,
  originalLanguage: true,
  price: true,
  currency: true,
  cityId: true,
  districtId: true,
  publishedAt: true,
  createdAt: true,
  translations: {
    select: { language: true, title: true },
  },
  // Инлайн-профиль автора для карточки модерации (см. AdminListingOwner).
  owner: {
    select: {
      id: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
      roles: { select: { role: { select: { code: true } } } },
      profile: {
        select: {
          firstName: true,
          lastName: true,
          displayName: true,
          contactPhone: true,
        },
      },
    },
  },
} as const;

type AdminListingRow = Prisma.ListingGetPayload<{
  select: typeof LISTING_LIST_SELECT;
}>;

/**
 * ModerationService — модерация объявлений (TASK-053, API.md §16).
 *
 * Каждый листинг проходит moderation queue (CLAUDE.md §9): создание → `NEW`,
 * модератор/админ переводит в `ACTIVE | DRAFT | REJECTED | DELETED`. Любое
 * действие атомарно: смена статуса + запись `moderation_logs` (доменный лог) +
 * `audit_logs(LISTING_STATUS_CHANGE)` + постановка уведомления владельцу в
 * очередь (`notifications`, status=PENDING — BullMQ-воркер подберёт её позже,
 * см. EmailService). Доступ — только MODERATOR/ADMIN (RolesGuard в контроллере).
 */
@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `GET /api/v1/admin/listings` — очередь модерации и админ-список (API.md §16).
   *
   * Без `status` возвращает все статусы (включая DELETED — модератор видит всё,
   * в отличие от owner-/публичных путей). Фильтры `status`/`property_type`/
   * `transaction_type` и `q` (поиск по заголовкам переводов) комбинируются.
   * Сортировка — `created_at DESC, id DESC` (детерминированный хвост `id`).
   */
  async listListings(
    query: ListAdminListingsQueryDto,
  ): Promise<PaginatedResponse<AdminListingListItem>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const where: Prisma.ListingWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.property_type) where.propertyType = query.property_type;
    if (query.transaction_type) where.transactionType = query.transaction_type;
    if (query.q) {
      where.translations = {
        some: { title: { contains: query.q, mode: 'insensitive' } },
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        select: LISTING_LIST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toListItem(row)),
      meta: { page, limit, total },
    };
  }

  /**
   * `PATCH /api/v1/admin/listings/:id/status` — модерация листинга (API.md §16).
   *
   * Отсутствующий/DELETED листинг → `404 NOT_FOUND` (DELETED исключён из
   * read-path). Терминальный владельческий статус (ARCHIVED/SOLD/RENTED) или
   * переход в тот же статус → `422 INVALID_STATUS_TRANSITION`.
   *
   * APPROVE → ACTIVE требует наличия переводов на все языки (ADR-0091):
   * отсутствие хотя бы одного → `422 VALIDATION_ERROR`. При прохождении гейта
   * выставляет `published_at` при первой публикации (повторное одобрение его
   * не сбрасывает). Авто-постановка джобы перевода удалена: переводы теперь
   * создаются модератором вручную до одобрения.
   */
  async changeStatus(
    moderatorId: string,
    listingId: string,
    dto: ModerateListingDto,
  ): Promise<ModerationResultResponse> {
    const existing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, ownerId: true, status: true, publishedAt: true },
    });

    // DELETED исключён из read-path — для всех 404, как и в ListingsService.
    if (!existing || existing.status === ListingStatus.DELETED) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }

    const newStatus = ACTION_TO_STATUS[dto.action];
    if (
      !MODERATABLE_STATUSES.includes(existing.status) ||
      newStatus === existing.status
    ) {
      throw new HttpException(
        {
          code: ApiErrorCode.INVALID_STATUS_TRANSITION,
          message: `Cannot ${dto.action} a listing in status ${existing.status}`,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // APPROVE требует переводов на все языки (ADR-0091): публикация без
    // проверенного перевода запрещена. Остальные действия гейт не трогают.
    if (dto.action === ModerationAction.APPROVE) {
      const rows = await this.prisma.listingTranslation.findMany({
        where: { listingId },
        select: { language: true },
      });
      const present = new Set(rows.map((r) => r.language));
      if (REQUIRED_LANGUAGES.some((lang) => !present.has(lang))) {
        throw new HttpException(
          {
            code: ApiErrorCode.VALIDATION_ERROR,
            message: 'Translations required for all languages before publishing',
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    }

    // published_at ставится только при первой публикации (APPROVE → ACTIVE) и
    // не сбрасывается при повторном одобрении.
    const publishedAt =
      newStatus === ListingStatus.ACTIVE
        ? (existing.publishedAt ?? new Date())
        : existing.publishedAt;

    const reason = dto.reason ?? null;

    // Атомарно: статус листинга + доменный лог + аудит + постановка уведомления.
    const updated = await this.prisma.$transaction(async (tx) => {
      const listing = await tx.listing.update({
        where: { id: listingId },
        data: { status: newStatus, publishedAt },
        select: { id: true, status: true, publishedAt: true },
      });

      await tx.moderationLog.create({
        data: {
          listingId,
          moderatorId,
          action: dto.action,
          oldStatus: existing.status,
          newStatus,
          reason,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: moderatorId,
          action: 'LISTING_STATUS_CHANGE',
          entityType: 'listing',
          entityId: listingId,
          metadata: {
            moderation_action: dto.action,
            old_status: existing.status,
            new_status: newStatus,
            reason,
          },
        },
      });

      // Уведомление владельцу: создаётся как PENDING-джоба (BullMQ-воркер
      // подберёт и отправит EMAIL позже — транспорт ещё не подключён, см.
      // EmailService). data_json несёт ссылки сущностей для рендера письма.
      await tx.notification.create({
        data: {
          userId: existing.ownerId,
          type: NotificationType.LISTING_MODERATION_STATUS_CHANGED,
          channel: NotificationChannel.EMAIL,
          dataJson: {
            listing_id: listingId,
            moderation_action: dto.action,
            old_status: existing.status,
            new_status: newStatus,
            reason,
          },
        },
      });

      return listing;
    });

    return {
      id: updated.id,
      status: updated.status,
      published_at: updated.publishedAt?.toISOString() ?? null,
    };
  }

  /**
   * `GET /api/v1/admin/listings/:id/moderation-logs` — история модерации
   * листинга (API.md §16). Отсутствующий листинг → `404`. Сортировка —
   * `created_at DESC` (свежие действия сверху).
   */
  async findLogs(listingId: string): Promise<ModerationLogResponse[]> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true },
    });
    if (!listing) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }

    const logs = await this.prisma.moderationLog.findMany({
      where: { listingId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        oldStatus: true,
        newStatus: true,
        moderatorId: true,
        reason: true,
        createdAt: true,
      },
    });

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      old_status: log.oldStatus,
      new_status: log.newStatus,
      moderator_id: log.moderatorId,
      reason: log.reason,
      created_at: log.createdAt.toISOString(),
    }));
  }

  /** Компактная карточка листинга в snake_case для админ-списка. */
  private toListItem(listing: AdminListingRow): AdminListingListItem {
    const translation =
      listing.translations.find(
        (t) => t.language === listing.originalLanguage,
      ) ?? listing.translations[0];
    return {
      id: listing.id,
      status: listing.status,
      transaction_type: listing.transactionType,
      property_type: listing.propertyType,
      price: listing.price.toFixed(2),
      currency: listing.currency,
      city_id: listing.cityId,
      district_id: listing.districtId,
      owner_id: listing.ownerId,
      owner: this.toOwner(listing.owner),
      original_language: listing.originalLanguage,
      title: translation?.title ?? '',
      published_at: listing.publishedAt?.toISOString() ?? null,
      created_at: listing.createdAt.toISOString(),
    };
  }

  /** Инлайн-профиль автора (snake_case) для строки админ-списка. */
  private toOwner(owner: AdminListingRow['owner']): AdminListingOwner {
    return {
      id: owner.id,
      display_name: owner.profile?.displayName ?? null,
      first_name: owner.profile?.firstName ?? null,
      last_name: owner.profile?.lastName ?? null,
      email: owner.email,
      phone: owner.phone,
      contact_phone: owner.profile?.contactPhone ?? null,
      status: owner.status,
      roles: owner.roles.map((r) => r.role.code),
      created_at: owner.createdAt.toISOString(),
    };
  }
}
