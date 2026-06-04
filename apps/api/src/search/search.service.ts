import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Currency,
  Language,
  ListingStatus,
  Prisma,
  PromotionType,
  PropertyType,
  TransactionType,
} from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { TranslationsService } from '../translations';
import { SearchListingsQueryDto } from './dto/search-listings.dto';

/** Дефолт/максимум размера страницы (API.md §4: default 20, max 100). */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Карточка листинга в результатах поиска (API.md §9). Decimal/даты —
 * строки (контрактный формат). `effective_tier` — time-guarded тир промо
 * (истёкшая промо трактуется как `NORMAL`). `title`/`language` выбираются по
 * языку запроса с фолбэком на оригинал (ADR-012).
 */
export interface SearchListItem {
  id: string;
  status: ListingStatus;
  transaction_type: TransactionType;
  property_type: PropertyType;
  price: string;
  currency: Currency;
  rooms: number | null;
  city_id: string | null;
  district_id: string | null;
  latitude: string | null;
  longitude: string | null;
  promotion_type: PromotionType;
  promotion_expires_at: string | null;
  effective_tier: PromotionType;
  language: Language;
  title: string;
  thumbnail_url: string | null;
  created_at: string;
}

/**
 * Envelope keyset-коллекций (API.md §4/§9): `data` + `meta` с непрозрачным
 * `next_cursor` (или `null`, если страниц больше нет). `total` — общее число
 * совпадений по фильтрам (без учёта курсора).
 */
export interface CursorPaginatedResponse<T> {
  data: T[];
  meta: { limit: number; total: number; next_cursor: string | null };
}

/** Позиция keyset-курсора: `(created_at, id)` последнего элемента страницы. */
interface SearchCursor {
  createdAt: string;
  id: string;
}

const SEARCH_SELECT = {
  id: true,
  status: true,
  transactionType: true,
  propertyType: true,
  price: true,
  currency: true,
  rooms: true,
  cityId: true,
  districtId: true,
  latitude: true,
  longitude: true,
  promotionType: true,
  promotionExpiresAt: true,
  originalLanguage: true,
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

type SearchRow = Prisma.ListingGetPayload<{ select: typeof SEARCH_SELECT }>;

/**
 * SearchService — публичный поиск объявлений (TASK-080, API.md §9).
 *
 * Возвращает ТОЛЬКО `status = ACTIVE` (`DELETED` и прочие непубличные статусы
 * исключены, DB_SCHEMA §15). В рамках TASK-080 — базовые фильтры и keyset-
 * пагинация с детерминированным хвостом `created_at DESC, id DESC`. Promotion-
 * приоритетная сортировка (`effective_promotion_tier DESC`) добавляется TASK-081,
 * гео-фильтры (PostGIS) — TASK-082; до этого `effective_tier` уже отдаётся в
 * ответе (time-guarded), чтобы форма карточки не менялась между задачами.
 *
 * Выбор языка перевода делегируется {@link TranslationsService} (TASK-070).
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly translations: TranslationsService,
  ) {}

  /** `GET /api/v1/search` — поиск ACTIVE-листингов по базовым фильтрам. */
  async search(
    query: SearchListingsQueryDto,
    langParam?: string,
    acceptLanguage?: string,
  ): Promise<CursorPaginatedResponse<SearchListItem>> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const filters = this.buildFilters(query);
    const cursor = this.decodeCursor(query.cursor);

    const where: Prisma.ListingWhereInput = {
      ...filters,
      // ACTIVE — единственный публичный статус (API.md §9). Курсорное условие
      // «строго после позиции» при ORDER BY (createdAt DESC, id DESC).
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              {
                createdAt: new Date(cursor.createdAt),
                id: { lt: cursor.id },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        select: SEARCH_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        // +1 элемент — индикатор наличия следующей страницы (есть ли next_cursor).
        take: limit + 1,
      }),
      this.prisma.listing.count({ where: filters }),
    ]);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    return {
      data: pageRows.map((row) =>
        this.toSearchItem(row, langParam, acceptLanguage),
      ),
      meta: {
        limit,
        total,
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
   * Базовые фильтры (TASK-080) + обязательный `status = ACTIVE`. Диапазон цены
   * применяется в пределах одной валюты (`currency`); FX-конвертации нет (§9).
   */
  private buildFilters(query: SearchListingsQueryDto): Prisma.ListingWhereInput {
    const where: Prisma.ListingWhereInput = { status: ListingStatus.ACTIVE };

    if (query.transaction_type !== undefined)
      where.transactionType = query.transaction_type;
    if (query.property_type !== undefined)
      where.propertyType = query.property_type;
    if (query.currency !== undefined) where.currency = query.currency;
    if (query.city_id !== undefined) where.cityId = query.city_id;
    if (query.district_id !== undefined) where.districtId = query.district_id;

    if (query.price_min !== undefined || query.price_max !== undefined) {
      where.price = {
        ...(query.price_min !== undefined ? { gte: query.price_min } : {}),
        ...(query.price_max !== undefined ? { lte: query.price_max } : {}),
      };
    }

    return where;
  }

  /** Карточка листинга в snake_case для результатов поиска (API.md §9). */
  private toSearchItem(
    listing: SearchRow,
    langParam?: string,
    acceptLanguage?: string,
  ): SearchListItem {
    const language = this.translations.resolveLanguage(
      listing.translations,
      listing.originalLanguage,
      langParam,
      acceptLanguage,
    );
    const translation =
      listing.translations.find((t) => t.language === language) ??
      listing.translations[0];
    const cover = listing.media[0];

    return {
      id: listing.id,
      status: listing.status,
      transaction_type: listing.transactionType,
      property_type: listing.propertyType,
      // Контракт §9 — price строкой с 2 дробными (Decimal.toString() срезал бы нули).
      price: listing.price.toFixed(2),
      currency: listing.currency,
      rooms: listing.rooms,
      city_id: listing.cityId,
      district_id: listing.districtId,
      latitude: listing.latitude?.toFixed(6) ?? null,
      longitude: listing.longitude?.toFixed(6) ?? null,
      promotion_type: listing.promotionType,
      promotion_expires_at: listing.promotionExpiresAt?.toISOString() ?? null,
      effective_tier: this.effectiveTier(
        listing.promotionType,
        listing.promotionExpiresAt,
      ),
      language,
      title: translation?.title ?? '',
      thumbnail_url: cover?.thumbnailUrl ?? cover?.url ?? null,
      created_at: listing.createdAt.toISOString(),
    };
  }

  /**
   * Time-guarded тир промо: листинг считается `VIP`/`TOP` только пока
   * `promotion_expires_at > now()`; истёкшая или отсутствующая промо → `NORMAL`
   * (ADR-006/007). Используется TASK-081 как первичный ключ сортировки.
   */
  private effectiveTier(
    promotionType: PromotionType,
    expiresAt: Date | null,
  ): PromotionType {
    if (promotionType === PromotionType.NORMAL) {
      return PromotionType.NORMAL;
    }
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      return PromotionType.NORMAL;
    }
    return promotionType;
  }

  /** Непрозрачный keyset-токен (base64url JSON позиции). */
  private encodeCursor(cursor: SearchCursor): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  /**
   * Разбор keyset-токена. Невалидный/повреждённый `cursor` → `400` (не молчаливый
   * сброс к первой странице, чтобы клиент заметил ошибку пагинации).
   */
  private decodeCursor(raw: string | undefined): SearchCursor | null {
    if (raw === undefined) {
      return null;
    }
    try {
      const json = Buffer.from(raw, 'base64url').toString('utf8');
      const parsed = JSON.parse(json) as Partial<SearchCursor>;
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
}
