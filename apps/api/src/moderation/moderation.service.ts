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
import { normalizedAddressSql } from '../listings/address-sql';
import { PrismaService } from '../prisma';
import { UploadsService } from '../uploads';
import { ExportAdminListingsQueryDto } from './dto/export-admin-listings.dto';
import { ListAdminListingsQueryDto } from './dto/list-admin-listings.dto';
import { ModerateListingDto } from './dto/moderate-listing.dto';
import {
  buildListingExport,
  EXPORT_MAX_ROWS,
  ListingExportRow,
} from './listing-export.builder';

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
  /** Публичный человекочитаемый номер объявления (ADR-0137); поиск по нему в админке. */
  reference: number;
  status: ListingStatus;
  transaction_type: TransactionType;
  property_type: PropertyType;
  price: string;
  currency: Currency;
  city_id: string | null;
  district_id: string | null;
  /** Имя района (nameRu) — для колонки «Район» в админ-таблице; нет района → null. */
  district_name: string | null;
  /** Точный адрес (из Яндекс-карты при создании); null, если не задан. */
  address: string | null;
  /** Число комнат — для колонки «Комн.»; null для участков и т.п. */
  rooms: number | null;
  /** Счётчик просмотров листинга (`listings.views_count`). */
  views_count: number;
  owner_id: string;
  owner: AdminListingOwner;
  original_language: Language;
  title: string;
  /**
   * Свежий URL обложки (первое media по `sort_order`) или `null`, если фото нет.
   * Sign-on-read (ADR-0086): presigned-URL генерируется на каждый ответ из
   * `storage_key` (legacy-фолбэк — `extractKey` из сохранённого `url`). Нужен,
   * чтобы админ-список и очередь модерации показывали реальную обложку, а не
   * статичный плейсхолдер.
   */
  photo_url: string | null;
  published_at: string | null;
  created_at: string;
}

/**
 * Карточка возможного дубликата (`GET /admin/listings/:id/duplicates`).
 * Совпадение ищется по цене + площади + этажности + адресу (регистр и лишние
 * пробелы адреса не учитываются) среди NEW/ACTIVE-объявлений. Decimal/даты —
 * строками (контрактный формат), `title` — на языке оригинала дубликата.
 */
export interface AdminListingDuplicate {
  id: string;
  reference: number;
  status: ListingStatus;
  transaction_type: TransactionType;
  price: string;
  currency: Currency;
  area: string | null;
  total_floors: number | null;
  address: string | null;
  title: string;
  photo_url: string | null;
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
 * Маппинг решения модератора на целевой `listing_status` (API.md §16).
 * APPROVE → ACTIVE, SEND_TO_DRAFT → DRAFT, REJECT → REJECTED, DELETE → DELETED,
 * ARCHIVE → ARCHIVED.
 * OWNER_EDIT сюда не входит — это системное событие, не переход по решению
 * модератора (пишется из ListingsService при правке владельцем).
 */
const ACTION_TO_STATUS: Partial<Record<ModerationAction, ListingStatus>> = {
  [ModerationAction.APPROVE]: ListingStatus.ACTIVE,
  [ModerationAction.SEND_TO_DRAFT]: ListingStatus.DRAFT,
  [ModerationAction.REJECT]: ListingStatus.REJECTED,
  [ModerationAction.DELETE]: ListingStatus.DELETED,
  [ModerationAction.ARCHIVE]: ListingStatus.ARCHIVED,
};

/**
 * Статусы, над которыми модерация имеет смысл (moderation queue, CLAUDE.md §9).
 * Из владельческих терминальных статусов (ARCHIVED/SOLD/RENTED) и из уже
 * удалённых листингов модератор ничего не переводит — попытка →
 * `422 INVALID_STATUS_TRANSITION` (для DELETED — `404`, т.к. он исключён из
 * read-path). В ARCHIVED модератор переводить может (действие ARCHIVE).
 */
const MODERATABLE_STATUSES: readonly ListingStatus[] = [
  ListingStatus.NEW,
  ListingStatus.ACTIVE,
  ListingStatus.DRAFT,
  ListingStatus.REJECTED,
];

/**
 * Статусы, среди которых ищутся дубликаты: живые объявления (ACTIVE) и уже
 * ждущие модерации (NEW). REJECTED/DRAFT/DELETED и владельческие терминальные
 * не считаются — их повторная публикация легитимна.
 */
const DUPLICATE_STATUSES: readonly ListingStatus[] = [
  ListingStatus.NEW,
  ListingStatus.ACTIVE,
];

/** Максимум карточек-дубликатов в ответе (админу хватает первых совпадений). */
const DUPLICATES_LIMIT = 10;

/** Все языки, для которых обязателен перевод перед публикацией (ADR-0091). */
const REQUIRED_LANGUAGES: readonly Language[] = Object.values(Language);

/**
 * Поля автора для инлайн-профиля (см. {@link AdminListingOwner}). Вынесено, чтобы
 * список модерации и `getListingOwner` (admin-деталь, item #6) читали один набор.
 */
const OWNER_SELECT = {
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
      contactPhoneVerified: true,
    },
  },
} as const;

const LISTING_LIST_SELECT = {
  id: true,
  reference: true,
  ownerId: true,
  status: true,
  transactionType: true,
  propertyType: true,
  originalLanguage: true,
  price: true,
  currency: true,
  cityId: true,
  districtId: true,
  address: true,
  rooms: true,
  viewsCount: true,
  publishedAt: true,
  createdAt: true,
  translations: {
    select: { language: true, title: true },
  },
  // Обложка для строки списка: первое media по sort_order. storage_key/url —
  // для sign-on-read (ADR-0086), thumbnailUrl — облегчённая версия, если есть.
  media: {
    select: { url: true, storageKey: true, thumbnailUrl: true },
    orderBy: { sortOrder: Prisma.SortOrder.asc },
    take: 1,
  },
  // Инлайн-профиль автора для карточки модерации (см. AdminListingOwner).
  owner: { select: OWNER_SELECT },
} as const;

type AdminListingRow = Prisma.ListingGetPayload<{
  select: typeof LISTING_LIST_SELECT;
}>;

/**
 * Поля строки выгрузки (см. {@link ListingExportRow}). Без media: обложка в
 * файле не нужна, а sign-on-read на тысячи строк — это тысячи подписей URL.
 */
const LISTING_EXPORT_SELECT = {
  reference: true,
  status: true,
  transactionType: true,
  propertyType: true,
  originalLanguage: true,
  price: true,
  currency: true,
  districtId: true,
  address: true,
  rooms: true,
  area: true,
  lotArea: true,
  viewsCount: true,
  publishedAt: true,
  createdAt: true,
  translations: {
    select: { language: true, title: true },
  },
  owner: {
    select: {
      email: true,
      phone: true,
      profile: {
        select: {
          firstName: true,
          lastName: true,
          displayName: true,
          contactPhone: true,
          contactPhoneVerified: true,
        },
      },
    },
  },
} as const;

/** Поля карточки дубликата (см. {@link AdminListingDuplicate}). */
const DUPLICATE_CARD_SELECT = {
  id: true,
  reference: true,
  status: true,
  transactionType: true,
  price: true,
  currency: true,
  area: true,
  totalFloors: true,
  address: true,
  originalLanguage: true,
  createdAt: true,
  translations: {
    select: { language: true, title: true },
  },
  media: {
    select: { url: true, storageKey: true, thumbnailUrl: true },
    orderBy: { sortOrder: Prisma.SortOrder.asc },
    take: 1,
  },
} as const;

type DuplicateCardRow = Prisma.ListingGetPayload<{
  select: typeof DUPLICATE_CARD_SELECT;
}>;

/**
 * ModerationService — модерация объявлений (TASK-053, API.md §16).
 *
 * Каждый листинг проходит moderation queue (CLAUDE.md §9): создание → `NEW`,
 * модератор/админ переводит в `ACTIVE | DRAFT | REJECTED | DELETED | ARCHIVED`. Любое
 * действие атомарно: смена статуса + запись `moderation_logs` (доменный лог) +
 * `audit_logs(LISTING_STATUS_CHANGE)` + постановка уведомления владельцу в
 * очередь (`notifications`, status=PENDING — BullMQ-воркер подберёт её позже,
 * см. EmailService). Доступ — только MODERATOR/ADMIN (RolesGuard в контроллере).
 */
@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

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
    const where = this.buildListWhere(query);

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

    const districtNames = await this.loadDistrictNames(rows);

    return {
      data: await Promise.all(
        rows.map((row) => this.toListItem(row, districtNames)),
      ),
      meta: { page, limit, total },
    };
  }

  /**
   * `GET /api/v1/admin/listings/export` — выгрузка админ-списка в `.xlsx`.
   *
   * Фильтры и сортировка — те же, что у {@link listListings}: в файле то, что
   * админ видит в таблице, но без пагинации. `page`/`limit` игнорируются;
   * потолок — {@link EXPORT_MAX_ROWS} самых свежих объявлений. `ids` сужает
   * выгрузку до отмеченных в таблице объявлений.
   */
  async exportListings(query: ExportAdminListingsQueryDto): Promise<Buffer> {
    const where = this.buildListWhere(query);
    if (query.ids?.length) where.id = { in: query.ids };

    const rows = await this.prisma.listing.findMany({
      where,
      select: LISTING_EXPORT_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: EXPORT_MAX_ROWS,
    });
    const districtNames = await this.loadDistrictNames(rows);

    return buildListingExport(
      rows.map((row): ListingExportRow => {
        const translation =
          row.translations.find((t) => t.language === row.originalLanguage) ??
          row.translations[0];
        const profile = row.owner.profile;
        return {
          reference: row.reference,
          title: translation?.title ?? '',
          address: row.address,
          transactionType: row.transactionType,
          propertyType: row.propertyType,
          price: row.price.toNumber(),
          currency: row.currency,
          rooms: row.rooms,
          // У участка жилой площади нет — показываем площадь участка.
          area: (row.area ?? row.lotArea)?.toNumber() ?? null,
          districtName:
            (row.districtId && districtNames.get(row.districtId)) || null,
          ownerName:
            profile?.displayName?.trim() ||
            [profile?.firstName, profile?.lastName]
              .map((part) => part?.trim())
              .filter(Boolean)
              .join(' ') ||
            null,
          // Вход через Google/Apple — телефона аккаунта нет; тогда контактный,
          // но только подтверждённый (ADR-0151).
          ownerPhone:
            row.owner.phone ??
            (profile?.contactPhoneVerified ? profile.contactPhone : null),
          ownerEmail: row.owner.email,
          status: row.status,
          viewsCount: row.viewsCount,
          createdAt: row.createdAt,
          publishedAt: row.publishedAt,
        };
      }),
    );
  }

  /** Условие выборки админ-списка — общее для таблицы и выгрузки. */
  private buildListWhere(
    query: ListAdminListingsQueryDto,
  ): Prisma.ListingWhereInput {
    const where: Prisma.ListingWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.property_type) where.propertyType = query.property_type;
    if (query.transaction_type) where.transactionType = query.transaction_type;
    // Точный поиск по короткому номеру объявления (ADR-0137) — «найти быстро по id».
    if (query.reference !== undefined) where.reference = query.reference;
    if (query.q) {
      where.translations = {
        some: { title: { contains: query.q, mode: 'insensitive' } },
      };
    }
    return where;
  }

  /**
   * Имена районов одним запросом по districtId переданных строк: relation
   * Listing→District в схеме нет (districtId — просто скалярный указатель).
   */
  private async loadDistrictNames(
    rows: ReadonlyArray<{ districtId: string | null }>,
  ): Promise<Map<string, string>> {
    const districtIds = [
      ...new Set(
        rows
          .map((row) => row.districtId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const districts = districtIds.length
      ? await this.prisma.district.findMany({
          where: { id: { in: districtIds } },
          select: { id: true, nameRu: true },
        })
      : [];
    return new Map(districts.map((d) => [d.id, d.nameRu]));
  }

  /**
   * `PATCH /api/v1/admin/listings/:id/status` — модерация листинга (API.md §16).
   *
   * Отсутствующий/DELETED листинг → `404 NOT_FOUND` (DELETED исключён из
   * read-path). Исходный терминальный владельческий статус
   * (ARCHIVED/SOLD/RENTED) или переход в тот же статус →
   * `422 INVALID_STATUS_TRANSITION`.
   *
   * ARCHIVE → ARCHIVED снимает листинг с публикации без удаления; владелец
   * может вернуть его сам (REACTIVATE). `edited_since_hidden` ставится так,
   * чтобы возврат шёл сразу в ACTIVE только для листинга, архивированного из
   * ACTIVE; из NEW/DRAFT/REJECTED — обратно через очередь модерации.
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
      !newStatus ||
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

    // Smart-return владельца (ListingsService.setOwnerStatus) пускает из архива
    // сразу в ACTIVE при `edited_since_hidden = false`. Контент, архивированный
    // не из ACTIVE, модерацию не проходил — помечаем его как требующий проверки.
    const archiveData =
      newStatus === ListingStatus.ARCHIVED
        ? { editedSinceHidden: existing.status !== ListingStatus.ACTIVE }
        : {};

    // Атомарно: статус листинга + доменный лог + аудит + постановка уведомления.
    const updated = await this.prisma.$transaction(async (tx) => {
      const listing = await tx.listing.update({
        where: { id: listingId },
        data: { status: newStatus, publishedAt, ...archiveData },
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

  /**
   * `GET /api/v1/admin/listings/:id/owner` — инлайн-профиль автора для
   * админ-детали (item #6, «Автор»). Публичный `GET /listings/:id` отдаёт лишь
   * `owner_id` (PII там недопустима), поэтому имя/контакт автора берём этим
   * admin-only роутом. Доступен и MODERATOR, и ADMIN (в отличие от ADMIN-only
   * `GET /admin/users/:id`). Не фильтрует по статусу — админ видит автора любого
   * листинга; отсутствующий листинг → 404.
   */
  async getListingOwner(id: string): Promise<AdminListingOwner> {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      select: { owner: { select: OWNER_SELECT } },
    });
    if (!listing) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }
    return this.toOwner(listing.owner);
  }

  /**
   * `GET /api/v1/admin/listings/:id/duplicates` — возможные дубликаты для
   * карточки модерации. Совпадение: та же цена + площадь + этажность + адрес
   * (адрес сравнивается без учёта регистра и лишних пробелов — нормализация
   * в SQL через `lower(regexp_replace(btrim(...)))`). Кандидаты — только
   * NEW/ACTIVE, само объявление исключено. Без адреса надёжная детекция
   * невозможна → пустой список. Отсутствующий/DELETED листинг → `404`.
   * Порядок — свежие первыми (как в raw-запросе), максимум {@link DUPLICATES_LIMIT}.
   */
  async findDuplicates(listingId: string): Promise<AdminListingDuplicate[]> {
    const source = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        status: true,
        price: true,
        area: true,
        totalFloors: true,
        address: true,
      },
    });
    if (!source || source.status === ListingStatus.DELETED) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }
    if (!source.address) return [];

    // Поиск кандидатов raw-SQL: Prisma-фильтры не умеют нормализовать адрес
    // (регистр + схлопывание пробелов), а точные равенства по Decimal/Int
    // null-безопасно выражаются через IS NOT DISTINCT FROM.
    const candidates = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM listings
      WHERE id <> ${listingId}::uuid
        AND status::text IN (${Prisma.join([...DUPLICATE_STATUSES])})
        AND price = ${source.price.toFixed(2)}::numeric
        AND area IS NOT DISTINCT FROM ${source.area?.toFixed(2) ?? null}::numeric
        AND total_floors IS NOT DISTINCT FROM ${source.totalFloors}::int
        AND address IS NOT NULL
        AND ${normalizedAddressSql(Prisma.raw('address'))} =
            ${normalizedAddressSql(Prisma.sql`${source.address}`)}
      ORDER BY created_at DESC, id DESC
      LIMIT ${DUPLICATES_LIMIT}
    `;
    if (candidates.length === 0) return [];

    const cards = await this.prisma.listing.findMany({
      where: { id: { in: candidates.map((c) => c.id) } },
      select: DUPLICATE_CARD_SELECT,
    });
    // findMany порядок не гарантирует — восстанавливаем порядок raw-запроса.
    const byId = new Map(cards.map((card) => [card.id, card]));
    return Promise.all(
      candidates
        .map((c) => byId.get(c.id))
        .filter((card): card is DuplicateCardRow => card !== undefined)
        .map((card) => this.toDuplicate(card)),
    );
  }

  /** Карточка дубликата в snake_case (см. {@link AdminListingDuplicate}). */
  private async toDuplicate(
    listing: DuplicateCardRow,
  ): Promise<AdminListingDuplicate> {
    const translation =
      listing.translations.find(
        (t) => t.language === listing.originalLanguage,
      ) ?? listing.translations[0];
    const cover = listing.media[0];
    const photoUrl = cover
      ? cover.thumbnailUrl
        ? await this.uploads.resolveMediaUrl(null, cover.thumbnailUrl)
        : await this.uploads.resolveMediaUrl(cover.storageKey, cover.url)
      : null;
    return {
      id: listing.id,
      reference: listing.reference,
      status: listing.status,
      transaction_type: listing.transactionType,
      price: listing.price.toFixed(2),
      currency: listing.currency,
      area: listing.area?.toFixed(2) ?? null,
      total_floors: listing.totalFloors,
      address: listing.address,
      title: translation?.title ?? '',
      photo_url: photoUrl,
      created_at: listing.createdAt.toISOString(),
    };
  }

  /** Компактная карточка листинга в snake_case для админ-списка. */
  private async toListItem(
    listing: AdminListingRow,
    districtNames: ReadonlyMap<string, string>,
  ): Promise<AdminListingListItem> {
    const translation =
      listing.translations.find(
        (t) => t.language === listing.originalLanguage,
      ) ?? listing.translations[0];
    // Свежий presigned-URL обложки (ADR-0086): предпочитаем thumbnail (его url
    // уже хранит ключ), иначе основное фото из storage_key. Нет media → null.
    const cover = listing.media[0];
    const photoUrl = cover
      ? cover.thumbnailUrl
        ? await this.uploads.resolveMediaUrl(null, cover.thumbnailUrl)
        : await this.uploads.resolveMediaUrl(cover.storageKey, cover.url)
      : null;
    return {
      id: listing.id,
      reference: listing.reference,
      status: listing.status,
      transaction_type: listing.transactionType,
      property_type: listing.propertyType,
      price: listing.price.toFixed(2),
      currency: listing.currency,
      city_id: listing.cityId,
      district_id: listing.districtId,
      district_name:
        (listing.districtId && districtNames.get(listing.districtId)) || null,
      address: listing.address,
      rooms: listing.rooms,
      views_count: listing.viewsCount,
      owner_id: listing.ownerId,
      owner: this.toOwner(listing.owner),
      original_language: listing.originalLanguage,
      title: translation?.title ?? '',
      photo_url: photoUrl,
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
      contact_phone:
        owner.profile?.contactPhoneVerified && owner.profile.contactPhone
          ? owner.profile.contactPhone
          : null,
      status: owner.status,
      roles: owner.roles.map((r) => r.role.code),
      created_at: owner.createdAt.toISOString(),
    };
  }
}
