import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Currency,
  Language,
  ListingStatus,
  MediaType,
  Prisma,
  PromotionType,
  PropertyType,
  TransactionType,
  TranslationSource,
} from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import { PrismaService } from '../prisma';
import { CreateListingDto } from './dto/create-listing.dto';
import { ListMyListingsQueryDto } from './dto/list-my-listings.dto';
import { UpdateListingDto } from './dto/update-listing.dto';

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
  rooms?: number;
  floor?: number;
  total_floors?: number;
  year_built?: number;
  address?: string;
  city_id?: string;
  district_id?: string;
  agency_id?: string;
  latitude?: string;
  longitude?: string;
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
  rooms?: number;
  floor?: number;
  totalFloors?: number;
  yearBuilt?: number;
  address?: string;
  cityId?: string;
  districtId?: string;
  agencyId?: string;
  latitude?: string;
  longitude?: string;
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
 * Структурированный список удобств (`features`) появится отдельной задачей M5 —
 * модели в БД ещё нет; свободный текст удобств отдаётся в `features_text`.
 * Decimal/даты сериализуются строками (контрактный формат).
 */
export interface ListingDetailResponse {
  id: string;
  status: ListingStatus;
  transaction_type: TransactionType;
  property_type: PropertyType;
  price: string;
  currency: Currency;
  area: string | null;
  rooms: number | null;
  floor: number | null;
  total_floors: number | null;
  year_built: number | null;
  city_id: string | null;
  district_id: string | null;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  promotion_type: PromotionType;
  promotion_expires_at: string | null;
  owner_id: string;
  agency_id: string | null;
  language: Language;
  title: string;
  description: string | null;
  address_note: string | null;
  features_text: string | null;
  media: ListingMediaResponse[];
  published_at: string | null;
  created_at: string;
}

const LISTING_DETAIL_SELECT = {
  id: true,
  ownerId: true,
  agencyId: true,
  status: true,
  transactionType: true,
  propertyType: true,
  originalLanguage: true,
  price: true,
  currency: true,
  area: true,
  rooms: true,
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
type ListingTranslationRow = ListingDetailRow['translations'][number];

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
  rooms: number | null;
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
  rooms: true,
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
    select: { url: true, thumbnailUrl: true },
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
 * ListingsService — создание и обновление объявлений (TASK-050, API.md §7).
 *
 * Новое объявление создаётся со статусом `NEW` (moderation queue, CLAUDE.md §9)
 * вместе с авторским переводом на `original_language` (source=USER). Обновлять
 * можно только собственное объявление — чужое → `403 FORBIDDEN`. `location`
 * (PostGIS) и ре-генерация машинных переводов — отдельные задачи M5.
 */
@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `POST /api/v1/listings` — создать объявление (статус `NEW`). */
  async create(
    ownerId: string,
    dto: CreateListingDto,
  ): Promise<ListingResponse> {
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
        create: {
          language: dto.original_language,
          source: TranslationSource.USER,
          isAutoTranslated: false,
          title: dto.translation.title,
          description: dto.translation.description ?? null,
          addressNote: dto.translation.address_note ?? null,
          featuresText: dto.translation.features_text ?? null,
        },
      },
    };

    const listing = await this.prisma.listing.create({
      data,
      select: LISTING_SELECT,
    });
    return this.toResponse(listing);
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
      select: { id: true, ownerId: true, originalLanguage: true },
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

    const language = this.resolveLanguage(
      listing.translations,
      listing.originalLanguage,
      langParam,
      acceptLanguage,
    );
    return this.toDetailResponse(listing, language);
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
      data: rows.map((row) => this.toListItem(row)),
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

  /**
   * Выбрать язык перевода: приоритет у `?lang`, затем `Accept-Language`, фолбэк —
   * `original_language` (ADR-012). Учитываются только языки, для которых перевод
   * реально существует (машинные переводы появляются после ACTIVE, ADR-005).
   */
  private resolveLanguage(
    translations: ListingTranslationRow[],
    originalLanguage: Language,
    langParam?: string,
    acceptLanguage?: string,
  ): Language {
    const available = new Set(translations.map((t) => t.language));
    const candidates = [
      this.normalizeLanguage(langParam),
      ...this.parseAcceptLanguage(acceptLanguage),
    ];
    for (const candidate of candidates) {
      if (candidate && available.has(candidate)) {
        return candidate;
      }
    }
    if (available.has(originalLanguage)) {
      return originalLanguage;
    }
    // Крайний случай (нет строки на original_language) — отдаём первую доступную.
    return translations[0]?.language ?? originalLanguage;
  }

  /** Нормализовать строку языка (`ru`/`RU`) к enum `Language` либо `null`. */
  private normalizeLanguage(value: string | undefined): Language | null {
    if (!value) {
      return null;
    }
    const upper = value.trim().toUpperCase();
    return (Object.values(Language) as string[]).includes(upper)
      ? (upper as Language)
      : null;
  }

  /** Языки из `Accept-Language` по убыванию приоритета (q-веса игнорируются). */
  private parseAcceptLanguage(header: string | undefined): Language[] {
    if (!header) {
      return [];
    }
    return header
      .split(',')
      .map((part) => this.normalizeLanguage(part.split(';')[0]?.split('-')[0]))
      .filter((lang): lang is Language => lang !== null);
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
    if (dto.rooms !== undefined) data.rooms = dto.rooms;
    if (dto.floor !== undefined) data.floor = dto.floor;
    if (dto.total_floors !== undefined) data.totalFloors = dto.total_floors;
    if (dto.year_built !== undefined) data.yearBuilt = dto.year_built;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.city_id !== undefined) data.cityId = dto.city_id;
    if (dto.district_id !== undefined) data.districtId = dto.district_id;
    if (dto.agency_id !== undefined) data.agencyId = dto.agency_id;
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;
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
  private toListItem(listing: ListingListRow): ListingListItem {
    const translation =
      listing.translations.find(
        (t) => t.language === listing.originalLanguage,
      ) ?? listing.translations[0];
    const cover = listing.media[0];
    return {
      id: listing.id,
      status: listing.status,
      transaction_type: listing.transactionType,
      property_type: listing.propertyType,
      price: listing.price.toFixed(2),
      currency: listing.currency,
      area: listing.area?.toFixed(2) ?? null,
      rooms: listing.rooms,
      city_id: listing.cityId,
      district_id: listing.districtId,
      promotion_type: listing.promotionType,
      promotion_expires_at: listing.promotionExpiresAt?.toISOString() ?? null,
      original_language: listing.originalLanguage,
      title: translation?.title ?? '',
      thumbnail_url: cover?.thumbnailUrl ?? cover?.url ?? null,
      published_at: listing.publishedAt?.toISOString() ?? null,
      created_at: listing.createdAt.toISOString(),
    };
  }

  /** Полная карточка листинга в snake_case (API.md §7) для разрешённого языка. */
  private toDetailResponse(
    listing: ListingDetailRow,
    language: Language,
  ): ListingDetailResponse {
    const translation = listing.translations.find(
      (t) => t.language === language,
    );
    return {
      id: listing.id,
      status: listing.status,
      transaction_type: listing.transactionType,
      property_type: listing.propertyType,
      // Decimal → строка фиксированной точности (контрактный формат, ADR-002).
      price: listing.price.toFixed(2),
      currency: listing.currency,
      area: listing.area?.toFixed(2) ?? null,
      rooms: listing.rooms,
      floor: listing.floor,
      total_floors: listing.totalFloors,
      year_built: listing.yearBuilt,
      city_id: listing.cityId,
      district_id: listing.districtId,
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
      media: listing.media.map((m) => ({
        id: m.id,
        url: m.url,
        thumbnail_url: m.thumbnailUrl,
        sort_order: m.sortOrder,
        type: m.type,
      })),
      published_at: listing.publishedAt?.toISOString() ?? null,
      created_at: listing.createdAt.toISOString(),
    };
  }
}
