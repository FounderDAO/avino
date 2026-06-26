import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
import { DistrictsService } from '../geo';
import type { DistrictNames } from '../geo';
import { PrismaService } from '../prisma';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
import {
  BoundsSearchQueryDto,
  NearMeSearchQueryDto,
  parsePolygonRing,
  PolygonSearchQueryDto,
  PolygonVertex,
  RadiusSearchQueryDto,
} from './dto/geo-search.dto';
import { polygonVerticesFromFilters } from './dto/polygon-ring.util';
import { SearchListingsQueryDto, SortMode } from './dto/search-listings.dto';

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
  /** До 3 свежих presigned URL фото (индекс 0 = обложка, ADR-0086). */
  thumbnails: string[];
  created_at: string;
  /**
   * Дистанция от точки запроса в метрах (округлённая). Присутствует только в
   * гео-ответах (`/search/radius`, `/search/near-me`); в обычном `/search`
   * отсутствует (опциональное поле — non-breaking, API.md §4/§10).
   */
  distance_m?: number;
  /**
   * Человекочитаемое название района на языке запроса (TASK-209, ADR-0068).
   * Разрешается batch-запросом к `districts`; `null` если `district_id` не
   * совпадает ни с одним известным районом (graceful degradation).
   */
  district_name: string | null;
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
 * Совпадение сохранённого поиска для polling-матчера (TASK-102): id ставшего
 * видимым ACTIVE-листинга и его `published_at` (watermark для следующего прогона).
 */
export interface SavedSearchMatch {
  id: string;
  publishedAt: Date;
}

/**
 * Обобщённый keyset-курсор (TASK-207): `rank` — time-guarded числовой ранг
 * промо-тира (первичный ключ), `val` — строковое представление вторичного ключа
 * сортировки (ISO-дата, числовая строка — зависит от `SortMode`), `id` — tie-break.
 */
interface SearchCursor {
  rank: number;
  val: string;
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

/**
 * Строка страницы из raw-запроса ранжирования (ключи сортировки + опц. дистанция).
 * `sort_val` — строковое значение вторичного ключа сортировки (ISO-дата или число),
 * используется для кодирования курсора. `distance_m` присутствует только в
 * гео-запросах (`ST_Distance`, метры).
 */
interface RankedRow {
  id: string;
  created_at: Date;
  tier_rank: number;
  sort_val: string | Date | number | null;
  distance_m?: number | null;
}

/**
 * Конфигурация вторичного ключа сортировки (TASK-207). Описывает:
 * - SQL-выражение вторичного ключа для SELECT/ORDER BY,
 * - направление сортировки,
 * - как читать `sort_val` из строки raw-результата,
 * - как биндить значение из курсора обратно в SQL.
 */
interface SortConfig {
  /** SQL-выражение вторичного ключа (без алиаса). */
  secondary: Prisma.Sql;
  /** Направление сортировки вторичного ключа. */
  dir: 'ASC' | 'DESC';
  /** Прочитать `sort_val` из raw-строки в строку для курсора. */
  encodeVal: (row: RankedRow) => string;
  /** Строку из курсора в параметр для keyset-условия (с кастом типа). */
  bindVal: (val: string) => Prisma.Sql;
}

/**
 * Карта конфигураций сортировки (TASK-207, API.md §9).
 * Promotion-тир — ВСЕГДА первичный ключ; вторичный ключ зависит от `sort`.
 * `area_desc`: NULL-area → COALESCE(area, -1) (area ≥ 0 по CHECK → -1 всегда < 0 → NULL-area последними).
 */
const SORTS: Record<SortMode, SortConfig> = {
  date_desc: {
    secondary: Prisma.sql`created_at`,
    dir: 'DESC',
    encodeVal: (row) =>
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.sort_val ?? row.created_at),
    bindVal: (val) => Prisma.sql`${val}::timestamptz`,
  },
  price_asc: {
    secondary: Prisma.sql`price`,
    dir: 'ASC',
    encodeVal: (row) => String(row.sort_val ?? '0'),
    bindVal: (val) => Prisma.sql`${val}::numeric`,
  },
  price_desc: {
    secondary: Prisma.sql`price`,
    dir: 'DESC',
    encodeVal: (row) => String(row.sort_val ?? '0'),
    bindVal: (val) => Prisma.sql`${val}::numeric`,
  },
  area_desc: {
    secondary: Prisma.sql`COALESCE(area, -1)`,
    dir: 'DESC',
    encodeVal: (row) => String(row.sort_val ?? '-1'),
    bindVal: (val) => Prisma.sql`${val}::numeric`,
  },
};

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
    select: { url: true, storageKey: true, thumbnailUrl: true },
    orderBy: { sortOrder: Prisma.SortOrder.asc },
    take: 3,
  },
} as const;

type SearchRow = Prisma.ListingGetPayload<{ select: typeof SEARCH_SELECT }>;

/**
 * SearchService — публичный поиск объявлений (TASK-080, API.md §9).
 *
 * Возвращает ТОЛЬКО `status = ACTIVE` (`DELETED` и прочие непубличные статусы
 * исключены, DB_SCHEMA §15). Сортировка — promotion-приоритетная (TASK-081,
 * ADR-0004): `effective_tier DESC, <secondary> <dir>, id DESC`, где `effective_tier`
 * — time-guarded ранг промо ({@link TIER_RANK_SQL}), вторичный ключ зависит от
 * параметра `sort` (TASK-207: date_desc/price_asc/price_desc/area_desc).
 *
 * Гео-поиск (PostGIS) — {@link SearchService.searchRadius} (`ST_DWithin`, GIST) и
 * {@link SearchService.searchNearMe} (`ST_Distance` сортировка), TASK-082;
 * {@link SearchService.searchBounds} (bbox `ST_MakeEnvelope`/`ST_Within`), TASK-083.
 * Гео-эндпоинты всегда используют `date_desc`-конфиг (сортировка по дате, keyset
 * не зависит от user-sort).
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
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly translations: TranslationsService,
    private readonly districts: DistrictsService,
    private readonly uploads: UploadsService,
  ) {}

  /** `GET /api/v1/search` — promotion-приоритетный поиск ACTIVE-листингов. */
  async search(
    query: SearchListingsQueryDto,
    langParam?: string,
    acceptLanguage?: string,
  ): Promise<CursorPaginatedResponse<SearchListItem>> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cfg = SORTS[query.sort ?? 'date_desc'];
    const cursor = this.decodeCursor(query.cursor);
    const filterSql = this.buildWhereSql(query);
    const pageWhere = cursor
      ? Prisma.sql`${filterSql} AND ${this.cursorConditionSql(cursor, cfg)}`
      : filterSql;

    // Ранжирование + keyset + total в raw-SQL: ORDER BY по time-guarded тиру
    // (effective_tier DESC, <secondary> <dir>, id DESC), +1 строка — индикатор
    // следующей страницы. total — отдельный count по тем же фильтрам (без курсора).
    // sort_val — вторичный ключ в SELECT для кодирования курсора.
    const orderDir =
      cfg.dir === 'DESC' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const [ranked, countRows] = await Promise.all([
      this.prisma.$queryRaw<RankedRow[]>(Prisma.sql`
        SELECT id, created_at, ${TIER_RANK_SQL} AS tier_rank,
               (${cfg.secondary}) AS sort_val
        FROM listings
        WHERE ${pageWhere}
        ORDER BY ${TIER_RANK_SQL} DESC, (${cfg.secondary}) ${orderDir}, id DESC
        LIMIT ${limit + 1}
      `),
      this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT count(*)::int AS count FROM listings WHERE ${filterSql}
      `),
    ]);

    return this.buildKeysetEnvelope(
      ranked,
      countRows[0]?.count ?? 0,
      limit,
      cfg,
      langParam,
      acceptLanguage,
    );
  }

  /**
   * `GET /api/v1/search/radius` — ACTIVE-листинги в радиусе `radius_m` метров от
   * точки (`ST_DWithin` по GIST-индексу `idx_listings_location`). Порядок —
   * promotion-приоритетный, как у `/search` (keyset с тиром), каждый элемент
   * получает `distance_m` (`ST_Distance`, метры). API.md §10, ADR-0003.
   * Гео-эндпоинт всегда использует `date_desc`-конфиг (создан_at DESC).
   */
  async searchRadius(
    query: RadiusSearchQueryDto,
    langParam?: string,
    acceptLanguage?: string,
  ): Promise<CursorPaginatedResponse<SearchListItem>> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cfg = SORTS['date_desc'];
    const cursor = this.decodeCursor(query.cursor);
    const point = this.pointSql(query.lng, query.lat);
    // ST_DWithin по GIST-индексу; NULL-location отсекается (NULL не проходит WHERE).
    const filterSql = Prisma.sql`${this.buildWhereSql(query)} AND location IS NOT NULL AND ST_DWithin(location, ${point}, ${query.radius_m})`;
    const pageWhere = cursor
      ? Prisma.sql`${filterSql} AND ${this.cursorConditionSql(cursor, cfg)}`
      : filterSql;

    const [ranked, countRows] = await Promise.all([
      this.prisma.$queryRaw<RankedRow[]>(Prisma.sql`
        SELECT id, created_at, ${TIER_RANK_SQL} AS tier_rank,
               (${cfg.secondary}) AS sort_val,
               ST_Distance(location, ${point}) AS distance_m
        FROM listings
        WHERE ${pageWhere}
        ORDER BY ${TIER_RANK_SQL} DESC, created_at DESC, id DESC
        LIMIT ${limit + 1}
      `),
      this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT count(*)::int AS count FROM listings WHERE ${filterSql}
      `),
    ]);

    return this.buildKeysetEnvelope(
      ranked,
      countRows[0]?.count ?? 0,
      limit,
      cfg,
      langParam,
      acceptLanguage,
    );
  }

  /**
   * `GET /api/v1/search/bounds` — ACTIVE-листинги внутри видимой области карты
   * (bbox `ST_MakeEnvelope`). Порядок — promotion-приоритетный, как у `/search`
   * (keyset с тиром); `distance_m` не возвращается (центра у bbox нет). API.md §10.
   *
   * Фильтр: `&&` (bbox-оверлап по GIST-индексу geography — быстрый префильтр) +
   * точный `ST_Within(location::geometry, envelope)`. Для точечной геометрии `&&`
   * по осевому прямоугольнику уже эквивалентен «точка внутри», но `ST_Within`
   * оставлен явно (контракт API.md §10, комментарий миграции idx_listings_location).
   * Гео-эндпоинт всегда использует `date_desc`-конфиг (created_at DESC).
   */
  async searchBounds(
    query: BoundsSearchQueryDto,
    langParam?: string,
    acceptLanguage?: string,
  ): Promise<CursorPaginatedResponse<SearchListItem>> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cfg = SORTS['date_desc'];
    const cursor = this.decodeCursor(query.cursor);
    const envelope = this.envelopeSql(query);
    // GIST-префильтр `&&` по geography + точный ST_Within (geometry); NULL-location отсекается.
    const filterSql = Prisma.sql`${this.buildWhereSql(query)} AND location IS NOT NULL AND location && ${envelope}::geography AND ST_Within(location::geometry, ${envelope})`;
    const pageWhere = cursor
      ? Prisma.sql`${filterSql} AND ${this.cursorConditionSql(cursor, cfg)}`
      : filterSql;

    const [ranked, countRows] = await Promise.all([
      this.prisma.$queryRaw<RankedRow[]>(Prisma.sql`
        SELECT id, created_at, ${TIER_RANK_SQL} AS tier_rank,
               (${cfg.secondary}) AS sort_val
        FROM listings
        WHERE ${pageWhere}
        ORDER BY ${TIER_RANK_SQL} DESC, created_at DESC, id DESC
        LIMIT ${limit + 1}
      `),
      this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT count(*)::int AS count FROM listings WHERE ${filterSql}
      `),
    ]);

    return this.buildKeysetEnvelope(
      ranked,
      countRows[0]?.count ?? 0,
      limit,
      cfg,
      langParam,
      acceptLanguage,
    );
  }

  /**
   * `GET /api/v1/search/polygon` — ACTIVE-листинги внутри произвольного полигона
   * (freehand-ласо, TASK-193, API.md §10). Порядок — promotion-приоритетный
   * (keyset с тиром), как у `/search/bounds`; `distance_m` не возвращается
   * (центральной точки нет).
   *
   * Полигон строится как `geometry(Polygon,4326)` через PostGIS:
   * `ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[...])), 4326)`. Все координаты
   * биндятся через `Prisma.sql` (защита от инъекций). Кольцо замыкается здесь
   * же: если первая и последняя вершины не совпадают — первая добавляется в конец
   * (ST_MakePolygon требует ≥ 4 точек в замкнутом кольце).
   *
   * Предположение (MVP): кольцо простое, невыпуклое, без самопересечений —
   * ST_MakeValid не применяется для упрощения; самопересекающийся контур вернёт
   * пустую или некорректную выдачу. При необходимости добавить ST_MakeValid в v2.
   *
   * Гео-эндпоинт всегда использует `date_desc`-конфиг (created_at DESC).
   */
  async searchPolygon(
    query: PolygonSearchQueryDto,
    langParam?: string,
    acceptLanguage?: string,
  ): Promise<CursorPaginatedResponse<SearchListItem>> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cfg = SORTS['date_desc'];
    const cursor = this.decodeCursor(query.cursor);
    const vertices = parsePolygonRing(query.points);
    const polygon = this.polygonSql(vertices);
    // GIST-префильтр `&&` по geography + точный ST_Within (geometry); NULL-location отсекается.
    const filterSql = Prisma.sql`${this.buildWhereSql(query)} AND location IS NOT NULL AND location && ${polygon}::geography AND ST_Within(location::geometry, ${polygon})`;
    const pageWhere = cursor
      ? Prisma.sql`${filterSql} AND ${this.cursorConditionSql(cursor, cfg)}`
      : filterSql;

    const [ranked, countRows] = await Promise.all([
      this.prisma.$queryRaw<RankedRow[]>(Prisma.sql`
        SELECT id, created_at, ${TIER_RANK_SQL} AS tier_rank,
               (${cfg.secondary}) AS sort_val
        FROM listings
        WHERE ${pageWhere}
        ORDER BY ${TIER_RANK_SQL} DESC, created_at DESC, id DESC
        LIMIT ${limit + 1}
      `),
      this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT count(*)::int AS count FROM listings WHERE ${filterSql}
      `),
    ]);

    return this.buildKeysetEnvelope(
      ranked,
      countRows[0]?.count ?? 0,
      limit,
      cfg,
      langParam,
      acceptLanguage,
    );
  }

  /**
   * `GET /api/v1/search/near-me` — ближайшие к точке ACTIVE-листинги,
   * отсортированные по дистанции (`ST_Distance` ASC); промо — вторичный ключ при
   * равенстве (API.md §10: для near-me основной ключ — дистанция). Одна страница
   * размером `limit`, keyset не применяется (`next_cursor = null`). Каждый
   * элемент получает `distance_m` (метры).
   */
  async searchNearMe(
    query: NearMeSearchQueryDto,
    langParam?: string,
    acceptLanguage?: string,
  ): Promise<CursorPaginatedResponse<SearchListItem>> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const point = this.pointSql(query.lng, query.lat);
    const filterSql = Prisma.sql`${this.buildWhereSql(query)} AND location IS NOT NULL`;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<RankedRow[]>(Prisma.sql`
        SELECT id, created_at, ${TIER_RANK_SQL} AS tier_rank,
               created_at AS sort_val,
               ST_Distance(location, ${point}) AS distance_m
        FROM listings
        WHERE ${filterSql}
        ORDER BY ST_Distance(location, ${point}) ASC, ${TIER_RANK_SQL} DESC, created_at DESC, id DESC
        LIMIT ${limit}
      `),
      this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT count(*)::int AS count FROM listings WHERE ${filterSql}
      `),
    ]);

    return {
      data: await this.hydrateCards(rows, langParam, acceptLanguage),
      meta: { limit, total: countRows[0]?.count ?? 0, next_cursor: null },
    };
  }

  /**
   * Точка запроса как `geography(Point,4326)`. Порядок аргументов
   * `ST_MakePoint(lng, lat)` — долгота первой (как в sync-триггере `location`,
   * DB_SCHEMA §14); перепутанный порядок дал бы неверную дистанцию.
   */
  private pointSql(lng: number, lat: number): Prisma.Sql {
    return Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
  }

  /**
   * Прямоугольник видимой области карты как `geometry(Polygon,4326)`.
   * `ST_MakeEnvelope(xmin, ymin, xmax, ymax, srid)` — порядок аргументов
   * (долгота, широта): `xmin=sw_lng, ymin=sw_lat, xmax=ne_lng, ymax=ne_lat`.
   * Перевёрнутый/вырожденный bbox (`sw > ne`) даёт пустую выдачу, а не ошибку.
   */
  private envelopeSql(query: BoundsSearchQueryDto): Prisma.Sql {
    return Prisma.sql`ST_MakeEnvelope(${query.sw_lng}, ${query.sw_lat}, ${query.ne_lng}, ${query.ne_lat}, 4326)`;
  }

  /**
   * Произвольный полигон из вершин кольца как `geometry(Polygon,4326)` (TASK-193).
   *
   * Строит `ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[...]::geometry[])), 4326)`.
   * Все координаты биндятся через `Prisma.sql` — инъекция невозможна. Кольцо
   * замыкается автоматически: если первая и последняя вершины не совпадают —
   * первая добавляется в конец (`ST_MakeLine`/`ST_MakePolygon` требуют замкнутого
   * кольца, ≥ 4 точек после замыкания).
   *
   * `ST_MakePoint(lng, lat)` — долгота первой (как в {@link pointSql} и в
   * sync-триггере `location`, DB_SCHEMA §14); перепутанный порядок дал бы
   * неверную геометрию.
   */
  private polygonSql(vertices: PolygonVertex[]): Prisma.Sql {
    // Замкнуть кольцо: первая вершина ≠ последней → добавить первую в конец.
    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    const ring =
      first.lat === last.lat && first.lng === last.lng
        ? vertices
        : [...vertices, first];

    const points = Prisma.join(
      ring.map((v) => Prisma.sql`ST_MakePoint(${v.lng}, ${v.lat})`),
      ', ',
    );
    return Prisma.sql`ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[${points}]::geometry[])), 4326)`;
  }

  /**
   * Сборка keyset-envelope из ранжированных строк (+1 строка — индикатор
   * следующей страницы): срез до `limit`, гидратация карточек, tier-aware
   * `next_cursor` по последнему показанному элементу. `cfg` определяет, как
   * читать вторичный ключ из raw-строки для кодирования курсора.
   */
  private async buildKeysetEnvelope(
    ranked: RankedRow[],
    total: number,
    limit: number,
    cfg: SortConfig,
    langParam?: string,
    acceptLanguage?: string,
  ): Promise<CursorPaginatedResponse<SearchListItem>> {
    const hasMore = ranked.length > limit;
    const pageRows = hasMore ? ranked.slice(0, limit) : ranked;
    const last = pageRows[pageRows.length - 1];

    return {
      data: await this.hydrateCards(pageRows, langParam, acceptLanguage),
      meta: {
        limit,
        total,
        next_cursor:
          hasMore && last
            ? this.encodeCursor({
                rank: Number(last.tier_rank),
                val: cfg.encodeVal(last),
                id: last.id,
              })
            : null,
      },
    };
  }

  /**
   * Гидратация relation-карточек по id из ранжированных строк с восстановлением
   * порядка ранжирования (`findMany` не гарантирует порядок `IN (...)`).
   * `distance_m` из raw-строки (гео) пробрасывается в карточку (метры, округление).
   */
  private async hydrateCards(
    pageRows: RankedRow[],
    langParam?: string,
    acceptLanguage?: string,
  ): Promise<SearchListItem[]> {
    if (pageRows.length === 0) {
      return [];
    }
    const hydrated = await this.prisma.listing.findMany({
      where: { id: { in: pageRows.map((row) => row.id) } },
      select: SEARCH_SELECT,
    });
    const byId = new Map<string, SearchRow>(
      hydrated.map((row) => [row.id, row]),
    );
    // Batch-разрешение имён районов по district_id страницы (TASK-209).
    const districtNames = await this.districts.namesByIds(
      hydrated
        .map((row) => row.districtId)
        .filter((id): id is string => id !== null),
    );

    const cards = await Promise.all(
      pageRows.map(async (row) => {
        const dbRow = byId.get(row.id);
        if (dbRow === undefined) {
          return undefined;
        }
        const card = await this.toSearchItem(
          dbRow,
          districtNames,
          langParam,
          acceptLanguage,
        );
        if (row.distance_m !== undefined && row.distance_m !== null) {
          card.distance_m = Math.round(Number(row.distance_m));
        }
        return card;
      }),
    );
    return cards.filter((card): card is SearchListItem => card !== undefined);
  }

  /**
   * Гидратация карточек §9 по списку id с сохранением порядка входных id
   * (`findMany` не гарантирует порядок `IN (...)`). Публичный reuse-хук для
   * модулей, которые сами решают порядок/набор листингов и хотят ту же карточку,
   * что и `/search` (TASK-090 «карточки как в /search», API.md §11). `distance_m`
   * не проставляется (точки запроса нет); отсутствующий id молча отбрасывается.
   */
  async cardsByIds(
    ids: string[],
    langParam?: string,
    acceptLanguage?: string,
  ): Promise<SearchListItem[]> {
    if (ids.length === 0) {
      return [];
    }
    const hydrated = await this.prisma.listing.findMany({
      where: { id: { in: ids } },
      select: SEARCH_SELECT,
    });
    const byId = new Map<string, SearchRow>(
      hydrated.map((row) => [row.id, row]),
    );
    // Batch-разрешение имён районов по district_id (TASK-209).
    const districtNames = await this.districts.namesByIds(
      hydrated
        .map((row) => row.districtId)
        .filter((id): id is string => id !== null),
    );

    return Promise.all(
      ids
        .map((id) => byId.get(id))
        .filter((row): row is SearchRow => row !== undefined)
        .map((row) =>
          this.toSearchItem(row, districtNames, langParam, acceptLanguage),
        ),
    );
  }

  /**
   * Совпадения сохранённого поиска для polling-матчера (TASK-102, ARCHITECTURE
   * §16). Возвращает ACTIVE-листинги, удовлетворяющие `filters`, ставшие видимыми
   * в полуоткрытом окне `(publishedAfter, publishedUntil]` по `published_at`
   * (момент первой публикации, проставляется модерацией при APPROVE → ACTIVE и не
   * сбрасывается).
   *
   * Переиспользует {@link buildWhereSql} — тот же набор скалярных фильтров, что и
   * `/search` (`status = ACTIVE` уже включён, acceptance «only ACTIVE listings
   * trigger alerts»). Радиус/bounds/near-me НЕ применяются (привязаны к подвижной
   * точке пользователя), но сохранённая территория-полигон (`filters.points`)
   * применяется через `ST_Within` (зеркало `/search/polygon`): валидное кольцо
   * фильтрует по контуру, битое кольцо пропускает прогон (см. ниже). `filters`
   * приходят из версионированного `filters_json` — параметры биндятся через
   * `Prisma.sql` (защита от инъекций), как в `/search`.
   *
   * Полуоткрытое окно гарантирует отсутствие дублей и пропусков между
   * последовательными прогонами. Результат упорядочен по `published_at ASC` и
   * ограничен `limit` (потолок алертов на один поиск за прогон); вызывающий при
   * усечении двигает watermark по `published_at` последнего совпадения.
   */
  async matchNewlyActiveListings(
    filters: Record<string, unknown>,
    publishedAfter: Date,
    publishedUntil: Date,
    limit: number,
  ): Promise<SavedSearchMatch[]> {
    const filterSql = this.buildWhereSql(
      filters as unknown as SearchListingsQueryDto,
    );

    // Территория (saved-search-polygon): валидное кольцо → ST_Within; битое кольцо
    // → пропуск прогона (НЕ алерты по всему городу); нет territory → без гео.
    const ring = polygonVerticesFromFilters(filters);
    if (ring === null) {
      this.logger.warn(
        'matchNewlyActiveListings: stored polygon invalid; skipping run',
      );
      return [];
    }
    let polygonSql = Prisma.empty;
    if (ring) {
      const poly = this.polygonSql(ring);
      polygonSql = Prisma.sql`AND location IS NOT NULL AND location && ${poly}::geography AND ST_Within(location::geometry, ${poly})`;
    }

    const rows = await this.prisma.$queryRaw<
      { id: string; published_at: Date }[]
    >(Prisma.sql`
      SELECT id, published_at
      FROM listings
      WHERE ${filterSql}
        AND published_at > ${publishedAfter}
        AND published_at <= ${publishedUntil}
        ${polygonSql}
      ORDER BY published_at ASC, id ASC
      LIMIT ${limit}
    `);
    return rows.map((row) => ({ id: row.id, publishedAt: row.published_at }));
  }

  /**
   * `WHERE`-фрагмент: обязательный `status = ACTIVE` + базовые фильтры (TASK-080)
   * + `rooms` (TASK-207) + свободный текст `q` (TASK-208, ADR-0067). Параметры
   * биндятся через `Prisma.sql` (защита от инъекций). Enum-колонки сравниваются
   * через `::text` (не зависит от имени PG-типа); диапазон цены — в пределах одной
   * валюты (`currency`), FX-конвертации нет (API.md §9).
   *
   * `rooms` (TASK-207): 0..3 — точное совпадение; 4 = «4+» (rooms >= 4).
   * Применяется во всех эндпоинтах поиска (включая гео-варианты).
   *
   * `q` (TASK-208, ADR-0067): ILIKE-подстрока (pg_trgm GIN, case-insensitive) по
   * `listings.address` + EXISTS (listing_translations.title/description, любой язык).
   * Пользовательский ввод LIKE-экранируется (`\`, `%`, `_`), чтобы литеральный `%`
   * не работал как wildcard. GIN-индексы (migration 20260613120000_*) ускоряют
   * запросы с term ≥ 3 символов; более короткие термы работают через seq scan.
   */
  private buildWhereSql(query: SearchListingsQueryDto): Prisma.Sql {
    const conds: Prisma.Sql[] = [Prisma.sql`status = 'ACTIVE'`];

    if (query.transaction_type !== undefined)
      conds.push(
        Prisma.sql`transaction_type::text = ${query.transaction_type}`,
      );
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
    if (query.rooms !== undefined)
      conds.push(
        query.rooms >= 4
          ? Prisma.sql`rooms >= 4`
          : Prisma.sql`rooms = ${query.rooms}`,
      );

    // TASK-208, ADR-0067: свободный текст q — ILIKE-подстрока (pg_trgm GIN).
    // Экранируем \, %, _ чтобы литеральные символы не работали как wildcards.
    if (query.q !== undefined && query.q.trim() !== '') {
      const term = query.q.trim().replace(/[\\%_]/g, '\\$&');
      const pattern = `%${term}%`;
      conds.push(Prisma.sql`(
        listings.address ILIKE ${pattern}
        OR EXISTS (
          SELECT 1 FROM listing_translations lt
          WHERE lt.listing_id = listings.id
            AND (lt.title ILIKE ${pattern} OR lt.description ILIKE ${pattern})
        )
      )`);
    }

    return Prisma.join(conds, ' AND ');
  }

  /**
   * Keyset-условие «строго после позиции» по `(tier_rank, secondary, id)` (TASK-207).
   * Обобщённый вариант поддерживает любой `SortConfig`; направление сравнения
   * вторичного ключа зависит от `cfg.dir` (`<` для DESC, `>` для ASC).
   *
   * `rank < c.rank
   *  OR (rank = c.rank AND secondary <after> bindVal(c.val))
   *  OR (rank = c.rank AND secondary = bindVal(c.val) AND id < c.id::uuid)`
   */
  private cursorConditionSql(cursor: SearchCursor, cfg: SortConfig): Prisma.Sql {
    const afterOp =
      cfg.dir === 'DESC' ? Prisma.sql`<` : Prisma.sql`>`;
    const boundVal = cfg.bindVal(cursor.val);
    return Prisma.sql`(
      ${TIER_RANK_SQL} < ${cursor.rank}
      OR (${TIER_RANK_SQL} = ${cursor.rank} AND (${cfg.secondary}) ${afterOp} ${boundVal})
      OR (${TIER_RANK_SQL} = ${cursor.rank} AND (${cfg.secondary}) = ${boundVal} AND id < ${cursor.id}::uuid)
    )`;
  }

  /**
   * Карточка листинга в snake_case для результатов поиска (API.md §9).
   * `districtNames` — batch-разрешённые имена районов по `district_id`
   * (TASK-209); `district_name` берётся на языке карточки, `null` если район
   * не найден (несовпадающий `district_id`, ADR-0068).
   */
  private async toSearchItem(
    listing: SearchRow,
    districtNames: Map<string, DistrictNames>,
    langParam?: string,
    acceptLanguage?: string,
  ): Promise<SearchListItem> {
    const language = this.translations.resolveLanguage(
      listing.translations,
      listing.originalLanguage,
      langParam,
      acceptLanguage,
    );
    const translation =
      listing.translations.find((t) => t.language === language) ??
      listing.translations[0];
    // Свежие presigned URL для до 3 фото (ADR-0086, TASK-thumbnails).
    // thumbnail → resolveMediaUrl(null, thumbnailUrl), иначе storageKey/url.
    const thumbnails = await Promise.all(
      listing.media.map((m) =>
        m.thumbnailUrl
          ? this.uploads.resolveMediaUrl(null, m.thumbnailUrl)
          : this.uploads.resolveMediaUrl(m.storageKey, m.url),
      ),
    );
    const thumbnailUrl = thumbnails[0] ?? null;

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
      thumbnail_url: thumbnailUrl,
      thumbnails,
      district_name: this.districts.pickName(
        listing.districtId
          ? districtNames.get(listing.districtId)
          : undefined,
        language,
      ),
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
   * Разбор keyset-токена (TASK-207). Ожидаемая форма: `{ rank: number, val: string, id: string }`.
   * Невалидный/повреждённый `cursor` → `400` (не молчаливый сброс к первой странице,
   * чтобы клиент заметил ошибку пагинации).
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
        typeof parsed.val !== 'string' ||
        typeof parsed.id !== 'string'
      ) {
        throw new Error('malformed cursor');
      }
      return { rank: parsed.rank, val: parsed.val, id: parsed.id };
    } catch {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Invalid pagination cursor',
      });
    }
  }
}
