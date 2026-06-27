import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Amenity,
  Currency,
  Language,
  ListingStatus,
  MediaType,
  ParkingType,
  Prisma,
  PromotionType,
  PropertyType,
  TransactionType,
} from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import { DistrictsService } from '../geo';
import { PrismaService } from '../prisma';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
import { CreateListingDto } from './dto/create-listing.dto';
import { ListMyListingsQueryDto } from './dto/list-my-listings.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { OwnerListingAction } from './dto/owner-status.dto';
import { validateToursInput, TourWindow } from './tour-window';

/**
 * Краткий ответ операций create/update (API.md §7, ответ 201/200). Полная
 * карточка с переводами/медиа — `GET /api/v1/listings/:id` (TASK-051). `price`/
 * `created_at` отдаются строками (Decimal/ISO), как в контракте.
 */
export interface ListingResponse {
  id: string;
  status: ListingStatus;
  transaction_type: TransactionType;
  property_type: PropertyType;
  original_language: Language;
  price: string;
  currency: Currency;
  created_at: string;
}

/** Поля, общие для create/update — маппинг scalar-полей DTO в Prisma data. */
interface ListingScalarInput {
  transaction_type?: TransactionType;
  property_type?: PropertyType;
  price?: string;
  currency?: Currency;
  area?: string;
  lot_area?: string;
  rooms?: number;
  bathrooms?: number;
  parking_type?: ParkingType;
  amenities?: Amenity[];
  floor?: number;
  total_floors?: number;
  year_built?: number;
  address?: string;
  city_id?: string;
  district_id?: string;
  agency_id?: string;
  latitude?: string;
  longitude?: string;
  tours_enabled?: boolean;
  tour_windows?: { start: string; end: string }[];
}

/** Поля авторского перевода, общие для create/update. */
interface ListingTranslationInput {
  title?: string;
  description?: string;
  address_note?: string;
  features_text?: string;
}

/**
 * Scalar-поля listings в Prisma-нотации (camelCase), прямые значения. Подходят
 * и для create (unchecked), и для update — direct value входит в union полей
 * `ListingUpdateInput`, поэтому переиспользуется обеими операциями.
 */
interface ListingScalarData {
  transactionType?: TransactionType;
  propertyType?: PropertyType;
  price?: string;
  currency?: Currency;
  area?: string;
  lotArea?: string;
  rooms?: number;
  bathrooms?: number;
  parkingType?: ParkingType;
  amenities?: Amenity[];
  floor?: number;
  totalFloors?: number;
  yearBuilt?: number;
  address?: string;
  cityId?: string;
  districtId?: string;
  agencyId?: string;
  latitude?: string;
  longitude?: string;
  toursEnabled?: boolean;
  tourWindows?: Prisma.InputJsonValue;
}

const LISTING_SELECT = {
  id: true,
  status: true,
  transactionType: true,
  propertyType: true,
  originalLanguage: true,
  price: true,
  currency: true,
  createdAt: true,
} as const;

/** Статусы-источники, из которых владелец может СКРЫТЬ листинг (→ ARCHIVED). */
const HIDE_FROM: readonly ListingStatus[] = [
  ListingStatus.ACTIVE,
  ListingStatus.NEW,
  ListingStatus.DRAFT,
  ListingStatus.REJECTED,
];

/** Статусы-источники, из которых можно отметить ПРОДАНО/СДАНО. */
const SELL_FROM: readonly ListingStatus[] = [
  ListingStatus.ACTIVE,
  ListingStatus.ARCHIVED,
  ListingStatus.NEW,
  ListingStatus.DRAFT,
  ListingStatus.REJECTED,
];

/** Статусы-источники, из которых можно ВЕРНУТЬ листинг в продажу. */
const REACTIVATE_FROM: readonly ListingStatus[] = [
  ListingStatus.ARCHIVED,
  ListingStatus.SOLD,
  ListingStatus.RENTED,
];

/**
 * Один медиа-объект в карточке листинга (API.md §7). Файл лежит в S3 — в БД и
 * ответе только URL и метаданные показа.
 */
export interface ListingMediaResponse {
  id: string;
  url: string;
  thumbnail_url: string | null;
  sort_order: number;
  type: MediaType;
}

/**
 * Полная карточка листинга — ответ `GET /api/v1/listings/:id` (TASK-051,
 * API.md §7). В отличие от {@link ListingResponse} (краткий ответ create/update),
 * включает все scalar-поля, разрешённый по языку перевод (плоско в корне) и медиа.
 * Структурированный список удобств — enum-массив `amenities` (ADR-0111); свободный
 * текст дополнительных пометок по-прежнему в `features_text`.
 * Decimal/даты сериализуются строками (контрактный формат).
 */
/**
 * Публичный контакт автора объявления (TASK-210, ADR-0069). Телефон публичен на
 * `ACTIVE`-объявлениях; `type`/`is_pro` выведены из ролей владельца (MVP-эвристика
 * до появления сущности агентства/pro-подписки).
 */
export interface ContactBlock {
  display_name: string | null;
  type: 'owner' | 'agent' | 'agency';
  is_pro: boolean;
  phone: string | null;
}

export interface ListingDetailResponse {
  id: string;
  status: ListingStatus;
  transaction_type: TransactionType;
  property_type: PropertyType;
  price: string;
  currency: Currency;
  area: string | null;
  lot_area: string | null;
  rooms: number | null;
  bathrooms: number | null;
  parking_type: ParkingType | null;
  amenities: Amenity[];
  floor: number | null;
  total_floors: number | null;
  year_built: number | null;
  city_id: string | null;
  district_id: string | null;
  /** Имя района по языку ответа (TASK-209); `null` если район не найден. */
  district_name: string | null;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  promotion_type: PromotionType;
  promotion_expires_at: string | null;
  owner_id: string;
  agency_id: string | null;
  /** Публичный контакт автора (TASK-210, ADR-0069). */
  contact: ContactBlock;
  language: Language;
  title: string;
  description: string | null;
  address_note: string | null;
  features_text: string | null;
  media: ListingMediaResponse[];
  tours_enabled: boolean;
  tour_windows: TourWindow[];
  published_at: string | null;
  created_at: string;
}

const LISTING_DETAIL_SELECT = {
  id: true,
  ownerId: true,
  agencyId: true,
  // Контакт автора (TASK-210, ADR-0069): телефон, профиль и роли владельца.
  owner: {
    select: {
      phone: true,
      profile: {
        select: {
          displayName: true,
          firstName: true,
          lastName: true,
          contactPhone: true,
        },
      },
      roles: {
        select: { role: { select: { code: true } } },
      },
    },
  },
  status: true,
  transactionType: true,
  propertyType: true,
  originalLanguage: true,
  price: true,
  currency: true,
  area: true,
  lotArea: true,
  rooms: true,
  bathrooms: true,
  parkingType: true,
  amenities: true,
  floor: true,
  totalFloors: true,
  yearBuilt: true,
  address: true,
  cityId: true,
  districtId: true,
  latitude: true,
  longitude: true,
  promotionType: true,
  promotionExpiresAt: true,
  publishedAt: true,
  createdAt: true,
  toursEnabled: true,
  tourWindows: true,
  translations: {
    select: {
      language: true,
      title: true,
      description: true,
      addressNote: true,
      featuresText: true,
    },
  },
  media: {
    select: {
      id: true,
      url: true,
      storageKey: true,
      thumbnailUrl: true,
      sortOrder: true,
      type: true,
    },
    orderBy: { sortOrder: Prisma.SortOrder.asc },
  },
} as const;

type ListingDetailRow = Prisma.ListingGetPayload<{
  select: typeof LISTING_DETAIL_SELECT;
}>;

/**
 * Компактная карточка листинга для коллекций (`GET /api/v1/listings/mine`,
 * TASK-052). В отличие от {@link ListingDetailResponse}, без полного описания/
 * координат/всех переводов: только поля, нужные для списка-управления владельца.
 * `title` берётся на `original_language` (владелец редактирует исходный текст),
 * `thumbnail_url` — обложка (первое медиа по `sort_order`). Decimal/даты — строки.
 */
export interface ListingListItem {
  id: string;
  status: ListingStatus;
  transaction_type: TransactionType;
  property_type: PropertyType;
  price: string;
  currency: Currency;
  area: string | null;
  lot_area: string | null;
  rooms: number | null;
  bathrooms: number | null;
  parking_type: ParkingType | null;
  city_id: string | null;
  district_id: string | null;
  promotion_type: PromotionType;
  promotion_expires_at: string | null;
  original_language: Language;
  title: string;
  thumbnail_url: string | null;
  published_at: string | null;
  created_at: string;
}

/**
 * Единый envelope коллекций (API.md §4): `data` + `meta`. Для page-based списков
 * `meta.total` обязателен; `page`/`limit` отражают фактически применённые значения.
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

const LISTING_LIST_SELECT = {
  id: true,
  status: true,
  transactionType: true,
  propertyType: true,
  originalLanguage: true,
  price: true,
  currency: true,
  area: true,
  lotArea: true,
  rooms: true,
  bathrooms: true,
  parkingType: true,
  cityId: true,
  districtId: true,
  promotionType: true,
  promotionExpiresAt: true,
  publishedAt: true,
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

type ListingListRow = Prisma.ListingGetPayload<{
  select: typeof LISTING_LIST_SELECT;
}>;

/** Дефолты пагинации `mine` (API.md §4: default `limit` 20, max 100). */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Роли, которые видят непубличные (не-ACTIVE) листинги наравне с владельцем. */
const PRIVILEGED_VIEW_ROLES: readonly UserRole[] = [
  UserRole.MODERATOR,
  UserRole.ADMIN,
];

/**
 * «Продавцовские» роли — дают право публиковать объявления. Список совпадает с
 * `@Roles(...)` на `POST /listings` (ListingsController). Автор без любой из них
 * при создании ПЕРВОГО объявления авто-апгрейдится до OWNER (ADR-0083): низкий
 * порог входа — зарегистрировался как USER → можешь продавать/сдавать сразу,
 * без ручного назначения роли админом.
 */
const SELLER_ROLES: readonly UserRole[] = [
  UserRole.OWNER,
  UserRole.AGENT,
  UserRole.AGENCY,
  UserRole.LANDLORD,
  UserRole.PROPERTY_MANAGER,
];

/**
 * ListingsService — создание и обновление объявлений (TASK-050, API.md §7).
 *
 * Новое объявление создаётся со статусом `NEW` (moderation queue, CLAUDE.md §9)
 * вместе с авторским переводом на `original_language` (source=USER). Обновлять
 * можно только собственное объявление — чужое → `403 FORBIDDEN`. `location`
 * (PostGIS) и ре-генерация машинных переводов — отдельные задачи M5.
 *
 * Логика переводов (построение авторской строки, выбор языка ответа с фолбэком)
 * делегируется {@link TranslationsService} — единому источнику (TASK-070).
 */
@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly translations: TranslationsService,
    private readonly districts: DistrictsService,
    private readonly uploads: UploadsService,
  ) {}

  /** `POST /api/v1/listings` — создать объявление (статус `NEW`). */
  async create(
    ownerId: string,
    dto: CreateListingDto,
  ): Promise<ListingResponse> {
    validateToursInput(dto.tours_enabled ?? false, (dto.tour_windows as TourWindow[]) ?? []);
    // Optional-поля даёт toScalarData; required (после спреда) выставляются явно,
    // чтобы их типы оставались non-undefined. ownerId + nested translations.create
    // резолвят data в UncheckedCreateInput (scalar FK + дочерняя relation).
    const data: Prisma.ListingUncheckedCreateInput = {
      ...this.toScalarData(dto),
      ownerId,
      status: ListingStatus.NEW,
      transactionType: dto.transaction_type,
      propertyType: dto.property_type,
      originalLanguage: dto.original_language,
      price: dto.price,
      currency: dto.currency,
      translations: {
        create: this.translations.buildOriginalTranslationInput(
          dto.original_language,
          dto.translation,
        ),
      },
    };

    // Авто-апгрейд автора до OWNER при первом объявлении и сама запись — в одной
    // транзакции (ADR-0083). Это позволяет свежему USER публиковать сразу, не
    // дожидаясь ручного назначения роли; атомарность исключает рассинхрон
    // «листинг создан, а роли нет».
    const listing = await this.prisma.$transaction(async (tx) => {
      await this.ensureSellerRole(tx, ownerId);
      return tx.listing.create({ data, select: LISTING_SELECT });
    });
    return this.toResponse(listing);
  }

  /**
   * Гарантировать, что автор имеет «продавцовскую» роль (ADR-0083). Если у него
   * уже есть любая из {@link SELLER_ROLES} (в т.ч. агентские) — апгрейд не нужен;
   * иначе выдаём OWNER. `upsert` по составному ключу `userId_roleId` идемпотентен
   * и безопасен при гонке параллельных созданий. Если роль OWNER не засидена в БД
   * — создание не блокируем (best-effort): право публиковать уже дал RolesGuard,
   * а роль лишь уточняет тип контакта в карточке.
   */
  private async ensureSellerRole(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    const sellerRoleCount = await tx.userRole.count({
      where: { userId, role: { code: { in: [...SELLER_ROLES] } } },
    });
    if (sellerRoleCount > 0) {
      return;
    }
    const ownerRole = await tx.role.findUnique({
      where: { code: UserRole.OWNER },
      select: { id: true },
    });
    if (!ownerRole) {
      return;
    }
    await tx.userRole.upsert({
      where: { userId_roleId: { userId, roleId: ownerRole.id } },
      create: { userId, roleId: ownerRole.id },
      update: {},
    });
  }

  /**
   * `PATCH /api/v1/listings/:id` — обновить собственное объявление.
   * Чужое объявление → `403 FORBIDDEN`; отсутствующее/DELETED → `404 NOT_FOUND`.
   */
  async update(
    ownerId: string,
    listingId: string,
    dto: UpdateListingDto,
  ): Promise<ListingResponse> {
    const existing = await this.prisma.listing.findFirst({
      where: { id: listingId, status: { not: ListingStatus.DELETED } },
      select: { id: true, ownerId: true, originalLanguage: true, status: true, toursEnabled: true, tourWindows: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }
    if (existing.ownerId !== ownerId) {
      throw new ForbiddenException({
        code: ApiErrorCode.FORBIDDEN,
        message: 'You can only update your own listing',
      });
    }

    const effectiveEnabled = dto.tours_enabled ?? (existing.toursEnabled as boolean);
    const effectiveWindows =
      (dto.tour_windows as TourWindow[]) ??
      ((existing.tourWindows as unknown as TourWindow[]) ?? []);
    validateToursInput(effectiveEnabled, effectiveWindows);

    const data: Prisma.ListingUpdateInput = this.toScalarData(dto);

    const translationData = this.toTranslationData(dto.translation);
    if (translationData) {
      // Правится только авторская строка (original_language). Машинные переводы
      // ре-генерируются отдельной задачей после ACTIVE (ADR-005).
      data.translations = {
        update: {
          where: {
            listingId_language: {
              listingId,
              language: existing.originalLanguage,
            },
          },
          data: translationData,
        },
      };
    }

    // Smart-return: правка скрытого (ARCHIVED) листинга требует повторной
    // модерации при возврате в продажу.
    if (existing.status === ListingStatus.ARCHIVED) {
      data.editedSinceHidden = true;
    }

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data,
      select: LISTING_SELECT,
    });
    return this.toResponse(updated);
  }

  /**
   * `PATCH /api/v1/listings/:id/status` — владельческая смена статуса
   * (скрыть / продано / сдано / вернуть). Зеркалит админский moderation-флоу,
   * но для статусов, зарезервированных за владельцем (ARCHIVED/SOLD/RENTED).
   *
   * Чужой листинг → `403`; отсутствующий/DELETED → `404`; недопустимый переход
   * или несовпадение transaction_type → `422 INVALID_STATUS_TRANSITION`.
   *
   * Smart-return (REACTIVATE из ARCHIVED): сразу `ACTIVE`, только если листинг был
   * опубликован (`published_at != null`) и не редактировался скрытым
   * (`edited_since_hidden = false`); иначе → `NEW` (повторная модерация). Из
   * SOLD/RENTED — всегда `NEW`. `published_at` при `→ ACTIVE` не сбрасывается.
   */
  async setOwnerStatus(
    ownerId: string,
    listingId: string,
    action: OwnerListingAction,
  ): Promise<ListingResponse> {
    const existing = await this.prisma.listing.findFirst({
      where: { id: listingId, status: { not: ListingStatus.DELETED } },
      select: {
        id: true,
        ownerId: true,
        status: true,
        transactionType: true,
        publishedAt: true,
        editedSinceHidden: true,
      },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }
    if (existing.ownerId !== ownerId) {
      throw new ForbiddenException({
        code: ApiErrorCode.FORBIDDEN,
        message: 'You can only change the status of your own listing',
      });
    }

    const invalid = () =>
      new HttpException(
        {
          code: ApiErrorCode.INVALID_STATUS_TRANSITION,
          message: `Cannot ${action} a listing in status ${existing.status}`,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

    const data: Prisma.ListingUpdateInput = {};

    switch (action) {
      case OwnerListingAction.HIDE: {
        if (!HIDE_FROM.includes(existing.status)) throw invalid();
        data.status = ListingStatus.ARCHIVED;
        data.editedSinceHidden = false;
        break;
      }
      case OwnerListingAction.MARK_SOLD: {
        if (
          !SELL_FROM.includes(existing.status) ||
          existing.transactionType !== TransactionType.SALE
        ) {
          throw invalid();
        }
        data.status = ListingStatus.SOLD;
        break;
      }
      case OwnerListingAction.MARK_RENTED: {
        if (
          !SELL_FROM.includes(existing.status) ||
          existing.transactionType !== TransactionType.RENT
        ) {
          throw invalid();
        }
        data.status = ListingStatus.RENTED;
        break;
      }
      case OwnerListingAction.REACTIVATE: {
        if (!REACTIVATE_FROM.includes(existing.status)) throw invalid();
        if (existing.status === ListingStatus.ARCHIVED) {
          const canGoActive =
            existing.publishedAt !== null && !existing.editedSinceHidden;
          data.status = canGoActive ? ListingStatus.ACTIVE : ListingStatus.NEW;
          data.editedSinceHidden = false;
        } else {
          // SOLD / RENTED — листинг мог устареть, всегда на повторную модерацию.
          data.status = ListingStatus.NEW;
        }
        break;
      }
    }

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data,
      select: LISTING_SELECT,
    });
    return this.toResponse(updated);
  }

  /**
   * `GET /api/v1/listings/:id` — публичная карточка листинга (API.md §7).
   *
   * Видимость: `ACTIVE` доступен всем; непубличные статусы видят только владелец
   * и роли {@link PRIVILEGED_VIEW_ROLES} (MODERATOR/ADMIN). `DELETED` исключён из
   * всех read-path (API.md §7) — всегда `404`. Чтобы не раскрывать существование
   * скрытого листинга, недоступный для зрителя ресурс тоже отдаёт `404`.
   *
   * Перевод выбирается по `?lang`/`Accept-Language` с фолбэком на
   * `original_language` (ADR-012); медиа отдаются по `sort_order`.
   */
  async findOne(
    listingId: string,
    viewer: AuthenticatedUser | undefined,
    langParam?: string,
    acceptLanguage?: string,
  ): Promise<ListingDetailResponse> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: LISTING_DETAIL_SELECT,
    });

    const notFound = new NotFoundException({
      code: ApiErrorCode.NOT_FOUND,
      message: 'Listing not found',
    });
    // DELETED исключён из read-path — для всех 404, даже для владельца/админа.
    if (!listing || listing.status === ListingStatus.DELETED) {
      throw notFound;
    }
    if (
      listing.status !== ListingStatus.ACTIVE &&
      !this.canViewNonActive(listing.ownerId, viewer)
    ) {
      throw notFound;
    }

    const language = this.translations.resolveLanguage(
      listing.translations,
      listing.originalLanguage,
      langParam,
      acceptLanguage,
    );
    // Имя района по district_id на языке ответа (TASK-209, ADR-0068).
    const districtNames = await this.districts.namesByIds(
      listing.districtId ? [listing.districtId] : [],
    );
    const districtName = this.districts.pickName(
      listing.districtId ? districtNames.get(listing.districtId) : undefined,
      language,
    );
    return this.toDetailResponse(listing, language, districtName);
  }

  /**
   * `GET /api/v1/listings/mine` — листинги текущего пользователя (API.md §7).
   *
   * Auth: Bearer (любой аутентифицированный — отдаёт только свои `ownerId`).
   * Возвращаются любые статусы, КРОМЕ `DELETED`: soft-deleted листинги исключены
   * из всех read-path (API.md §7), поэтому фильтр `status=DELETED` трактуется как
   * «без фильтра» (всё, кроме удалённых). Сортировка — `created_at DESC, id DESC`
   * (детерминированный хвост `id` для стабильного порядка). Пагинация page-based
   * (1-based) + `limit`; `meta.total` обязателен (API.md §4).
   */
  async findMine(
    ownerId: string,
    query: ListMyListingsQueryDto,
  ): Promise<PaginatedResponse<ListingListItem>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const where: Prisma.ListingWhereInput = {
      ownerId,
      status:
        query.status && query.status !== ListingStatus.DELETED
          ? query.status
          : { not: ListingStatus.DELETED },
    };

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
      data: await Promise.all(rows.map((row) => this.toListItem(row))),
      meta: { page, limit, total },
    };
  }

  /** Владелец листинга или привилегированная роль (MODERATOR/ADMIN). */
  private canViewNonActive(
    ownerId: string,
    viewer: AuthenticatedUser | undefined,
  ): boolean {
    if (!viewer) {
      return false;
    }
    if (viewer.id === ownerId) {
      return true;
    }
    return viewer.roles.some((role) => PRIVILEGED_VIEW_ROLES.includes(role));
  }

  /** DTO (snake_case) → Prisma scalar data (camelCase). Пропускает undefined. */
  private toScalarData(dto: ListingScalarInput): ListingScalarData {
    const data: ListingScalarData = {};
    if (dto.transaction_type !== undefined)
      data.transactionType = dto.transaction_type;
    if (dto.property_type !== undefined) data.propertyType = dto.property_type;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.area !== undefined) data.area = dto.area;
    if (dto.lot_area !== undefined) data.lotArea = dto.lot_area;
    if (dto.rooms !== undefined) data.rooms = dto.rooms;
    if (dto.bathrooms !== undefined) data.bathrooms = dto.bathrooms;
    if (dto.parking_type !== undefined) data.parkingType = dto.parking_type;
    if (dto.amenities !== undefined) data.amenities = dto.amenities;
    if (dto.floor !== undefined) data.floor = dto.floor;
    if (dto.total_floors !== undefined) data.totalFloors = dto.total_floors;
    if (dto.year_built !== undefined) data.yearBuilt = dto.year_built;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.city_id !== undefined) data.cityId = dto.city_id;
    if (dto.district_id !== undefined) data.districtId = dto.district_id;
    if (dto.agency_id !== undefined) data.agencyId = dto.agency_id;
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;
    if (dto.tours_enabled !== undefined) data.toursEnabled = dto.tours_enabled;
    if (dto.tour_windows !== undefined) data.tourWindows = dto.tour_windows as unknown as Prisma.InputJsonValue;
    return data;
  }

  /**
   * DTO-перевод → Prisma data. Возвращает `null`, если обновлять нечего
   * (translation не передан или пуст) — тогда строку перевода не трогаем.
   */
  private toTranslationData(
    translation: ListingTranslationInput | undefined,
  ): Prisma.ListingTranslationUpdateInput | null {
    if (!translation) {
      return null;
    }
    const data: Prisma.ListingTranslationUpdateInput = {};
    if (translation.title !== undefined) data.title = translation.title;
    if (translation.description !== undefined)
      data.description = translation.description;
    if (translation.address_note !== undefined)
      data.addressNote = translation.address_note;
    if (translation.features_text !== undefined)
      data.featuresText = translation.features_text;
    return Object.keys(data).length > 0 ? data : null;
  }

  private toResponse(listing: {
    id: string;
    status: ListingStatus;
    transactionType: TransactionType;
    propertyType: PropertyType;
    originalLanguage: Language;
    price: Prisma.Decimal;
    currency: Currency;
    createdAt: Date;
  }): ListingResponse {
    return {
      id: listing.id,
      status: listing.status,
      transaction_type: listing.transactionType,
      property_type: listing.propertyType,
      original_language: listing.originalLanguage,
      // Контракт §7 — price строкой с 2 дробными; Decimal.toString() срезал бы
      // хвостовые нули ("4500000.00" → "4500000"), поэтому toFixed(2).
      price: listing.price.toFixed(2),
      currency: listing.currency,
      created_at: listing.createdAt.toISOString(),
    };
  }

  /** Компактная карточка листинга в snake_case для коллекций (TASK-052). */
  private async toListItem(listing: ListingListRow): Promise<ListingListItem> {
    const translation =
      listing.translations.find(
        (t) => t.language === listing.originalLanguage,
      ) ?? listing.translations[0];
    const cover = listing.media[0];
    // Обложка: thumbnail если есть (перевыпуск из его url), иначе основное фото
    // (перевыпуск из storage_key). Всегда свежий presigned URL — ADR-0086.
    const thumbnailUrl = cover
      ? cover.thumbnailUrl
        ? await this.uploads.resolveMediaUrl(null, cover.thumbnailUrl)
        : await this.uploads.resolveMediaUrl(cover.storageKey, cover.url)
      : null;
    return {
      id: listing.id,
      status: listing.status,
      transaction_type: listing.transactionType,
      property_type: listing.propertyType,
      price: listing.price.toFixed(2),
      currency: listing.currency,
      area: listing.area?.toFixed(2) ?? null,
      lot_area: listing.lotArea?.toFixed(2) ?? null,
      rooms: listing.rooms,
      bathrooms: listing.bathrooms,
      parking_type: listing.parkingType,
      city_id: listing.cityId,
      district_id: listing.districtId,
      promotion_type: listing.promotionType,
      promotion_expires_at: listing.promotionExpiresAt?.toISOString() ?? null,
      original_language: listing.originalLanguage,
      title: translation?.title ?? '',
      thumbnail_url: thumbnailUrl,
      published_at: listing.publishedAt?.toISOString() ?? null,
      created_at: listing.createdAt.toISOString(),
    };
  }

  /**
   * Публичный контакт автора (TASK-210, ADR-0069). `type`/`is_pro` выведены из
   * ролей владельца (AGENCY→agency, AGENT→agent, иначе owner; pro = agent/agency).
   * Телефон — `contact_phone` профиля, иначе телефон аккаунта (публичен на ACTIVE).
   */
  private buildContact(owner: ListingDetailRow['owner']): ContactBlock {
    const profile = owner.profile;
    const roleCodes = new Set(owner.roles.map((r) => r.role.code));
    const type: ContactBlock['type'] = roleCodes.has(UserRole.AGENCY)
      ? 'agency'
      : roleCodes.has(UserRole.AGENT)
        ? 'agent'
        : 'owner';
    const fullName = [profile?.firstName, profile?.lastName]
      .filter((part): part is string => Boolean(part))
      .join(' ');
    return {
      display_name:
        profile?.displayName ?? (fullName.length > 0 ? fullName : null),
      type,
      is_pro: type !== 'owner',
      phone: profile?.contactPhone ?? owner.phone ?? null,
    };
  }

  /** Полная карточка листинга в snake_case (API.md §7) для разрешённого языка. */
  private async toDetailResponse(
    listing: ListingDetailRow,
    language: Language,
    districtName: string | null,
  ): Promise<ListingDetailResponse> {
    const translation = listing.translations.find(
      (t) => t.language === language,
    );
    // Свежий presigned URL на каждое фото (ADR-0086): перевыпуск из storage_key,
    // thumbnail — из его url (legacy-фолбэк через extractKey внутри resolveMediaUrl).
    const media = await Promise.all(
      listing.media.map(async (m) => ({
        id: m.id,
        url: await this.uploads.resolveMediaUrl(m.storageKey, m.url),
        thumbnail_url: m.thumbnailUrl
          ? await this.uploads.resolveMediaUrl(null, m.thumbnailUrl)
          : null,
        sort_order: m.sortOrder,
        type: m.type,
      })),
    );
    return {
      id: listing.id,
      contact: this.buildContact(listing.owner),
      status: listing.status,
      transaction_type: listing.transactionType,
      property_type: listing.propertyType,
      // Decimal → строка фиксированной точности (контрактный формат, ADR-002).
      price: listing.price.toFixed(2),
      currency: listing.currency,
      area: listing.area?.toFixed(2) ?? null,
      lot_area: listing.lotArea?.toFixed(2) ?? null,
      rooms: listing.rooms,
      bathrooms: listing.bathrooms,
      parking_type: listing.parkingType,
      amenities: listing.amenities,
      floor: listing.floor,
      total_floors: listing.totalFloors,
      year_built: listing.yearBuilt,
      city_id: listing.cityId,
      district_id: listing.districtId,
      district_name: districtName,
      address: listing.address,
      latitude: listing.latitude?.toFixed(6) ?? null,
      longitude: listing.longitude?.toFixed(6) ?? null,
      promotion_type: listing.promotionType,
      promotion_expires_at: listing.promotionExpiresAt?.toISOString() ?? null,
      owner_id: listing.ownerId,
      agency_id: listing.agencyId,
      language,
      title: translation?.title ?? '',
      description: translation?.description ?? null,
      address_note: translation?.addressNote ?? null,
      features_text: translation?.featuresText ?? null,
      media,
      tours_enabled: listing.toursEnabled,
      tour_windows: (listing.tourWindows as unknown as TourWindow[]) ?? [],
      published_at: listing.publishedAt?.toISOString() ?? null,
      created_at: listing.createdAt.toISOString(),
    };
  }
}
