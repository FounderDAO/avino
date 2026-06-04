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

/**
 * Позиция keyset-курсора: `(tier_rank, created_at, id)` последнего элемента
 * страницы. `tier_rank` — time-guarded числовой ранг промо-тира (2/1/0),
 * первичный ключ сортировки (TASK-081, ADR-0004).
 */
interface SearchCursor {
  rank: number;
  createdAt: string;
  id: string;
}

/**
 * Time-guarded числовой ранг промо-тира для `ORDER BY`/keyset: активный `VIP`=2,
 * активный `TOP`=1, иначе (истёкшая/отсутствующая промо или `NORMAL`)=0. Гард
 * `promotion_expires_at > now()` живёт в SQL — истёкшая промо ранжируется как
 * `NORMAL` независимо от expire-job (ADR-0004 §2/§4). Совпадает с
 * {@link SearchService.effectiveTier}, который формирует `effective_tier` карточки.
 */
const TIER_RANK_SQL = Prisma.sql`
  CASE
    WHEN promotion_type = 'VIP' AND promotion_expires_at > now() THEN 2
    WHEN promotion_type = 'TOP' AND promotion_expires_at > now() THEN 1
    ELSE 0
  END`;

/** Строка страницы из raw-запроса ранжирования (только ключи сортировки). */
interface RankedRow {
  id: string;
  created_at: Date;
  tier_rank: number;
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
 * исключены, DB_SCHEMA §15). Сортировка — promotion-приоритетная (TASK-081,
 * ADR-0004): `effective_tier DESC, created_at DESC, id DESC`, где `effective_tier`
 * — time-guarded ранг промо ({@link TIER_RANK_SQL}). Гео-фильтры (PostGIS) —
 * TASK-082.
 *
 * Ранжирование, keyset-пагинация и `total` считаются raw-SQL (Prisma `orderBy`
 * не выражает CASE с гардом по времени, ADR-0004 §2/§4); далее страница
 * гидратируется через Prisma по `id` с восстановлением порядка. Это держит
 * фильтры в одном SQL-билдере и сохраняет relation-load/маппинг карточки §9.
 *
 * Выбор языка перевода делегируется {@link TranslationsService} (TASK-070).
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly translations: TranslationsService,
  ) {}

  /** `GET /api/v1/search` — promotion-приоритетный поиск ACTIVE-листингов. */
  async search(
    query: SearchListingsQueryDto,
    langParam?: string,
    acceptLanguage?: string,
  ): Promise<CursorPaginatedResponse<SearchListItem>> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = this.decodeCursor(query.cursor);
    const filterSql = this.buildWhereSql(query);
    const pageWhere = cursor
      ? Prisma.sql`${filterSql} AND ${this.cursorConditionSql(cursor)}`
      : filterSql;

    // Ранжирование + keyset + total в raw-SQL: ORDER BY по time-guarded тиру
    // (effective_tier DESC, created_at DESC, id DESC), +1 строка — индикатор
    // следующей страницы. total — отдельный count по тем же фильтрам (без курсора).
    const [ranked, countRows] = await Promise.all([
      this.prisma.$queryRaw<RankedRow[]>(Prisma.sql`
        SELECT id, created_at, ${TIER_RANK_SQL} AS tier_rank
        FROM listings
        WHERE ${pageWhere}
        ORDER BY ${TIER_RANK_SQL} DESC, created_at DESC, id DESC
        LIMIT ${limit + 1}
      `),
      this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT count(*)::int AS count FROM listings WHERE ${filterSql}
      `),
    ]);

    const total = countRows[0]?.count ?? 0;
    const hasMore = ranked.length > limit;
    const pageRows = hasMore ? ranked.slice(0, limit) : ranked;
    const last = pageRows[pageRows.length - 1];

    // Гидратация relation-карточки по id + восстановление порядка ранжирования
    // (findMany не гарантирует порядок `IN (...)`).
    const hydrated = pageRows.length
      ? await this.prisma.listing.findMany({
          where: { id: { in: pageRows.map((row) => row.id) } },
          select: SEARCH_SELECT,
        })
      : [];
    const byId = new Map(hydrated.map((row) => [row.id, row]));

    return {
      data: pageRows
        .map((row) => byId.get(row.id))
        .filter((row): row is SearchRow => row !== undefined)
        .map((row) => this.toSearchItem(row, langParam, acceptLanguage)),
      meta: {
        limit,
        total,
        next_cursor:
          hasMore && last
            ? this.encodeCursor({
                rank: Number(last.tier_rank),
                createdAt: last.created_at.toISOString(),
                id: last.id,
              })
            : null,
      },
    };
  }

  /**
   * `WHERE`-фрагмент: обязательный `status = ACTIVE` + базовые фильтры (TASK-080).
   * Параметры биндятся через `Prisma.sql` (защита от инъекций). Enum-колонки
   * сравниваются через `::text` (не зависит от имени PG-типа); диапазон цены —
   * в пределах одной валюты (`currency`), FX-конвертации нет (API.md §9).
   */
  private buildWhereSql(query: SearchListingsQueryDto): Prisma.Sql {
    const conds: Prisma.Sql[] = [Prisma.sql`status = 'ACTIVE'`];

    if (query.transaction_type !== undefined)
      conds.push(Prisma.sql`transaction_type::text = ${query.transaction_type}`);
    if (query.property_type !== undefined)
      conds.push(Prisma.sql`property_type::text = ${query.property_type}`);
    if (query.currency !== undefined)
      conds.push(Prisma.sql`currency::text = ${query.currency}`);
    if (query.city_id !== undefined)
      conds.push(Prisma.sql`city_id = ${query.city_id}::uuid`);
    if (query.district_id !== undefined)
      conds.push(Prisma.sql`district_id = ${query.district_id}::uuid`);
    if (query.price_min !== undefined)
      conds.push(Prisma.sql`price >= ${query.price_min}::numeric`);
    if (query.price_max !== undefined)
      conds.push(Prisma.sql`price <= ${query.price_max}::numeric`);

    return Prisma.join(conds, ' AND ');
  }

  /**
   * Keyset-условие «строго после позиции» по `(tier_rank, created_at, id)`:
   * `rank < c.rank OR (rank = c.rank AND created_at < c.createdAt)
   *  OR (rank = c.rank AND created_at = c.createdAt AND id < c.id)`.
   */
  private cursorConditionSql(cursor: SearchCursor): Prisma.Sql {
    return Prisma.sql`(
      ${TIER_RANK_SQL} < ${cursor.rank}
      OR (${TIER_RANK_SQL} = ${cursor.rank} AND created_at < ${cursor.createdAt}::timestamptz)
      OR (${TIER_RANK_SQL} = ${cursor.rank} AND created_at = ${cursor.createdAt}::timestamptz AND id < ${cursor.id}::uuid)
    )`;
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
        typeof parsed.rank !== 'number' ||
        !Number.isFinite(parsed.rank) ||
        typeof parsed.createdAt !== 'string' ||
        typeof parsed.id !== 'string' ||
        Number.isNaN(new Date(parsed.createdAt).getTime())
      ) {
        throw new Error('malformed cursor');
      }
      return { rank: parsed.rank, createdAt: parsed.createdAt, id: parsed.id };
    } catch {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Invalid pagination cursor',
      });
    }
  }
}
