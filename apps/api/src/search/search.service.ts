import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  Currency,
  Language,
  ListingStatus,
  ParkingType,
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
import {
  NEW_CONSTRUCTION_MAX_AGE_YEARS,
  SearchListingsQueryDto,
  SortMode,
} from './dto/search-listings.dto';
import {
  PriceBucketDto,
  PriceDistributionQueryDto,
  PriceDistributionResponseDto,
} from './dto/price-distribution.dto';
import {
  ClustersResponseDto,
  ClustersSearchQueryDto,
} from './dto/clusters.dto';

/**
 * Округляет «вверх» до красивого числа (1/2/2.5/5/10 × 10^k) — потолок домена
 * слайдера, чтобы подписи осей были аккуратными (487300 → 500000).
 */
function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

/**
 * Размер ячейки кластерной сетки в градусах для зума web-mercator (TASK-225,
 * ADR-0126): ~8 ячеек на тайл 256px (~32px на экране — плотность supercluster).
 * Экспортирована как чистая функция для юнит-тестов.
 */
export function clusterCellSizeDeg(zoom: number): number {
  return 360 / Math.pow(2, zoom) / 8;
}

/** Дефолт/максимум размера страницы (API.md §4: default 20, max 100). */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
/** Максимум ячеек в ответе кластеризации — защита от «bbox × высокий zoom». */
const MAX_CLUSTER_CELLS = 2000;

/**
 * Сколько промо-объявлений закрепляется в начале выдачи при ЯВНОМ выборе
 * сортировки (price/area/date), ADR-0117. Промо-приоритет НЕ доминирует над всей
 * выдачей: первые {@link PINNED_PROMO_COUNT} промо (по тиру) прибиваются к началу
 * 1-й страницы, остальное строго по выбранному ключу. Для дефолта
 * («Рекомендуемые», без `sort`) поведение прежнее — полный промо-приоритет.
 */
const PINNED_PROMO_COUNT = 3;

/**
 * Карточка листинга в результатах поиска (API.md §9). Decimal/даты —
 * строки (контрактный формат). `effective_tier` — time-guarded тир промо
 * (истёкшая промо трактуется как `NORMAL`). `title`/`language` выбираются по
 * языку запроса с фолбэком на оригинал (ADR-012).
 */
export interface SearchListItem {
  id: string;
  /** Публичный человекочитаемый номер объявления (ADR-0137). */
  reference: number;
  status: ListingStatus;
  transaction_type: TransactionType;
  property_type: PropertyType;
  price: string;
  currency: Currency;
  rooms: number | null;
  bathrooms: number | null;
  parking_type: ParkingType | null;
  is_basement: boolean;
  /** Общая площадь, м² (Decimal-строка); нужна клиенту для сортировки area_desc. */
  area: string | null;
  lot_area: string | null;
  city_id: string | null;
  district_id: string | null;
  /** Точный адрес объявления (VarChar 500); `null`, если не заполнен. */
  address: string | null;
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
  /** Счётчики детали (мобилка #8): просмотры и лайки (избранное всех юзеров). */
  views_count: number;
  likes_count: number;
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
  reference: true,
  status: true,
  transactionType: true,
  propertyType: true,
  price: true,
  currency: true,
  rooms: true,
  bathrooms: true,
  parkingType: true,
  isBasement: true,
  area: true,
  lotArea: true,
  cityId: true,
  districtId: true,
  address: true,
  addressEn: true,
  latitude: true,
  longitude: true,
  promotionType: true,
  promotionExpiresAt: true,
  originalLanguage: true,
  createdAt: true,
  viewsCount: true,
  // Живой агрегат лайков (мобилка #8): COUNT по favorites, без денормализации.
  _count: { select: { favorites: true } },
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

  /**
   * `GET /api/v1/search` — поиск ACTIVE-листингов (API.md §9).
   *
   * Дефолт («Рекомендуемые», без `sort`) — полный промо-приоритет
   * (`effective_tier DESC, created_at DESC, id DESC`, TASK-081/ADR-0004).
   * ЯВНЫЙ `sort` (price/area/date) — гибрид (ADR-0117): топ-{@link
   * PINNED_PROMO_COUNT} промо закреплены в начале, остальное строго по выбранному
   * ключу; для `price_*` ключ нормализуется в USD по текущему курсу ЦБУ
   * ({@link SearchService.searchExplicitSort}).
   *
   * `points` (TASK-249, ADR-0133): необязательная нарисованная территория —
   * если задана, пересечение с контуром ({@link pointsFilterSql}) подмешивается
   * к остальным фильтрам (`ST_Within`, зеркало `/search/polygon`).
   */
  async search(
    query: SearchListingsQueryDto,
    langParam?: string,
    acceptLanguage?: string,
  ): Promise<CursorPaginatedResponse<SearchListItem>> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = this.decodeCursor(query.cursor);
    const filterSql = Prisma.sql`${this.buildWhereSql(query, await this.fxRateForFilter(query))} ${this.pointsFilterSql(query.points)}`;

    // Явная сортировка → гибрид (закреплённое промо + строгий ключ + FX).
    if (query.sort !== undefined) {
      return this.searchExplicitSort(
        query.sort,
        filterSql,
        cursor,
        limit,
        langParam,
        acceptLanguage,
      );
    }

    // «Рекомендуемые» (дефолт): полный промо-приоритет (TASK-081, ADR-0004).
    const cfg = SORTS['date_desc'];
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
   * Гибридная выдача при ЯВНОМ `sort` (ADR-0117). В отличие от дефолтного
   * промо-приоритета, промо НЕ доминирует над всей выдачей:
   *
   * 1. Закрепляются топ-{@link PINNED_PROMO_COUNT} промо (по `tier_rank DESC,
   *    created_at DESC, id DESC`) — «витрина» в начале 1-й страницы.
   * 2. Остальное — строгий поток по выбранному ключу (`<secondary> <dir>, id DESC`),
   *    БЕЗ промо-приоритета; закреплённые id исключены из потока на ВСЕХ страницах
   *    (без дублей). Keyset потока — 2-кортежный `(<secondary>, id)`.
   * 3. Для `price_*` вторичный ключ нормализуется в USD по текущему курсу ЦБУ
   *    ({@link SearchService.fxRate}), чтобы UZS/USD сравнивались по реальной
   *    стоимости; нет курса → деградация к сырой цене.
   *
   * `total` — полное число совпадений по фильтру (закреплённые показываются один
   * раз на 1-й странице, из потока исключены, поэтому без двойного счёта).
   */
  private async searchExplicitSort(
    sort: SortMode,
    filterSql: Prisma.Sql,
    cursor: SearchCursor | null,
    limit: number,
    langParam?: string,
    acceptLanguage?: string,
  ): Promise<CursorPaginatedResponse<SearchListItem>> {
    const rate =
      sort === 'price_asc' || sort === 'price_desc'
        ? await this.fxRate()
        : null;
    const cfg = this.explicitSortConfig(sort, rate);
    const orderDir = cfg.dir === 'DESC' ? Prisma.sql`DESC` : Prisma.sql`ASC`;

    // 1. Закреплённые промо: топ-N по тиру под текущим фильтром (только page 1
    //    показывается, но считается всегда — нужен для исключения из потока).
    const pinnedRows = await this.prisma.$queryRaw<RankedRow[]>(Prisma.sql`
      SELECT id, created_at, ${TIER_RANK_SQL} AS tier_rank, NULL AS sort_val
      FROM listings
      WHERE ${filterSql} AND (${TIER_RANK_SQL}) > 0
      ORDER BY ${TIER_RANK_SQL} DESC, created_at DESC, id DESC
      LIMIT ${PINNED_PROMO_COUNT}
    `);
    const pinnedIds = pinnedRows.map((r) => r.id);
    const excludePinned = pinnedIds.length
      ? Prisma.sql`AND id <> ALL(ARRAY[${Prisma.join(pinnedIds)}]::uuid[])`
      : Prisma.empty;

    // 2. Строгий поток (исключая закреплённые), keyset 2-кортежный.
    const strictWhere = cursor
      ? Prisma.sql`${filterSql} ${excludePinned} AND ${this.strictCursorConditionSql(cursor, cfg)}`
      : Prisma.sql`${filterSql} ${excludePinned}`;

    const [strictRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<RankedRow[]>(Prisma.sql`
        SELECT id, created_at, 0::int AS tier_rank, (${cfg.secondary}) AS sort_val
        FROM listings
        WHERE ${strictWhere}
        ORDER BY (${cfg.secondary}) ${orderDir}, id DESC
        LIMIT ${limit + 1}
      `),
      this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT count(*)::int AS count FROM listings WHERE ${filterSql}
      `),
    ]);

    const hasMore = strictRows.length > limit;
    const strictPage = hasMore ? strictRows.slice(0, limit) : strictRows;
    const last = strictPage[strictPage.length - 1];

    // Page 1 (без курсора) — впереди закреплённый промо-блок; далее только поток.
    const rows = cursor ? strictPage : [...pinnedRows, ...strictPage];

    return {
      data: await this.hydrateCards(rows, langParam, acceptLanguage),
      meta: {
        limit,
        total: countRows[0]?.count ?? 0,
        next_cursor:
          hasMore && last
            ? this.encodeCursor({ rank: 0, val: cfg.encodeVal(last), id: last.id })
            : null,
      },
    };
  }

  /**
   * SortConfig для явной сортировки. Для `price_*` вторичный ключ нормализуется в
   * USD: UZS-цены делятся на курс (`1 USD = rate UZS`), USD остаются как есть — так
   * выдача сортируется по РЕАЛЬНОЙ стоимости. Нет курса (`rate=null`) → сырая цена
   * (деградация без падения). Прочие ключи (area/date) — без изменений.
   */
  private explicitSortConfig(sort: SortMode, rate: string | null): SortConfig {
    const base = SORTS[sort];
    if (sort !== 'price_asc' && sort !== 'price_desc') {
      return base;
    }
    const secondary = rate
      ? Prisma.sql`(CASE WHEN currency = 'UZS' THEN price / ${rate}::numeric ELSE price END)`
      : Prisma.sql`price`;
    return { ...base, secondary };
  }

  /**
   * Keyset-условие «строго после позиции» для строгого потока явной сортировки
   * (ADR-0117): тира в порядке нет, поэтому сравниваются только `(<secondary>, id)`.
   * Направление вторичного ключа — `<` для DESC, `>` для ASC.
   */
  private strictCursorConditionSql(
    cursor: SearchCursor,
    cfg: SortConfig,
  ): Prisma.Sql {
    const afterOp = cfg.dir === 'DESC' ? Prisma.sql`<` : Prisma.sql`>`;
    const boundVal = cfg.bindVal(cursor.val);
    return Prisma.sql`(
      (${cfg.secondary}) ${afterOp} ${boundVal}
      OR ((${cfg.secondary}) = ${boundVal} AND id < ${cursor.id}::uuid)
    )`;
  }

  /**
   * Текущий курс `1 USD = rate UZS` (последний по `fetched_at`) строкой для
   * биндинга `::numeric`, либо `null` если строки курса нет (тогда FX-нормализация
   * пропускается). Совпадает с источником {@link ExchangeRateService.getCurrent}.
   */
  private async fxRate(): Promise<string | null> {
    const row = await this.prisma.exchangeRate.findFirst({
      where: { base: 'USD', quote: 'UZS' },
      orderBy: { fetchedAt: 'desc' },
      select: { rate: true },
    });
    return row ? row.rate.toString() : null;
  }

  /**
   * Курс для FX-нормализации ценового фильтра ({@link buildWhereSql}): нужен
   * только когда задан ценовой рубеж И валюта диапазона. Иначе не ходим в БД —
   * `null` (buildWhereSql деградирует к сравнению в пределах одной валюты).
   */
  private async fxRateForFilter(
    query: SearchListingsQueryDto,
  ): Promise<string | null> {
    const needsFx =
      (query.price_min !== undefined || query.price_max !== undefined) &&
      query.currency !== undefined;
    return needsFx ? this.fxRate() : null;
  }

  /**
   * SQL-выражение цены листинга, приведённой к валюте `currency` по курсу ЦБУ
   * (`1 USD = rate UZS`). Единый источник FX-нормализации для ценового фильтра
   * ({@link buildWhereSql}) и гистограммы ({@link priceDistribution}) — цена
   * листинга иной валюты сравнивается/бакетируется так же, как её видит
   * пользователь (конвертированной). Возвращает целочисленно-безопасный `numeric`.
   */
  private priceInCurrencySql(currency: Currency, rate: string): Prisma.Sql {
    return currency === Currency.USD
      ? Prisma.sql`(CASE WHEN currency = 'UZS' THEN price / ${rate}::numeric ELSE price END)`
      : Prisma.sql`(CASE WHEN currency = 'USD' THEN price * ${rate}::numeric ELSE price END)`;
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
    const fxRate = await this.fxRateForFilter(query);
    // ST_DWithin по GIST-индексу; NULL-location отсекается (NULL не проходит WHERE).
    const filterSql = Prisma.sql`${this.buildWhereSql(query, fxRate)} AND location IS NOT NULL AND ST_DWithin(location, ${point}, ${query.radius_m})`;
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
   *
   * `points` (TASK-249, ADR-0133): необязательная нарисованная территория —
   * если задана, результат — пересечение bbox И контура ({@link pointsFilterSql}).
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
    const fxRate = await this.fxRateForFilter(query);
    // GIST-префильтр `&&` по geography + точный ST_Within (geometry); NULL-location отсекается.
    const filterSql = Prisma.sql`${this.buildWhereSql(query, fxRate)} AND location IS NOT NULL AND ${this.boundsPrefilterSql(query)} AND ST_Within(location::geometry, ${envelope}) ${this.pointsFilterSql(query.points)}`;
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
   * `GET /api/v1/search/clusters` — агрегаты кластерной сетки для широких зумов
   * карты (TASK-225, ADR-0126, схема Zillow/Airbnb): вместо страницы листингов —
   * ячейки `ST_SnapToGrid` с числом объявлений и ценовыми агрегатами. Клиент
   * рисует кластерные кружки; при < ~200 объектов в боксе переключается на
   * обычные пины `/search/bounds`.
   *
   * bbox-фильтр — как у {@link searchBounds}: GIST-префильтр
   * ({@link boundsPrefilterSql}, широкие bbox чанкуются — TASK-226) + точный
   * `ST_Within`. Применяются ВСЕ фильтры §9 ({@link buildWhereSql}).
   *
   * Координата кластера — центроид точек ячейки (avg по listing-координатам,
   * кружок стоит на реальных данных, не в углу пустой ячейки). `min_price`/
   * `avg_price` FX-нормализуются к `currency` (default USD) по курсу ЦБУ
   * ({@link priceInCurrencySql}); нет курса → сырые цены (деградация ADR-0117).
   * Ответ не пагинируется; guard `LIMIT {@link MAX_CLUSTER_CELLS}` по count DESC
   * (крупнейшие кластеры выживают при патологическом bbox×zoom).
   */
  async searchClusters(
    query: ClustersSearchQueryDto,
  ): Promise<ClustersResponseDto> {
    const cell = clusterCellSizeDeg(query.zoom);
    const envelope = this.envelopeSql(query);
    const currency = query.currency ?? Currency.USD;
    const rate = await this.fxRate();
    const priceExpr = rate
      ? this.priceInCurrencySql(currency, rate)
      : Prisma.sql`price`;
    // Курс для ценового ФИЛЬТРА — тот же rate, но только если фильтр задан
    // (семантика fxRateForFilter, без второго похода в БД).
    const filterRate =
      (query.price_min !== undefined || query.price_max !== undefined) &&
      query.currency !== undefined
        ? rate
        : null;
    const filterSql = Prisma.sql`${this.buildWhereSql(query, filterRate)} AND location IS NOT NULL AND ${this.boundsPrefilterSql(query)} AND ST_Within(location::geometry, ${envelope})`;

    const rows = await this.prisma.$queryRaw<
      {
        latitude: number;
        longitude: number;
        count: number;
        min_price: number;
        avg_price: number;
      }[]
    >(Prisma.sql`
      SELECT
        avg(ST_Y(location::geometry))::float8 AS latitude,
        avg(ST_X(location::geometry))::float8 AS longitude,
        count(*)::int AS count,
        min(${priceExpr})::float8 AS min_price,
        avg(${priceExpr})::float8 AS avg_price
      FROM listings
      WHERE ${filterSql}
      GROUP BY ST_SnapToGrid(location::geometry, ${cell}, ${cell})
      ORDER BY count DESC
      LIMIT ${MAX_CLUSTER_CELLS}
    `);

    return {
      data: rows.map((r) => ({
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
        count: Number(r.count),
        min_price: Number(r.min_price),
        avg_price: Number(r.avg_price),
      })),
      currency,
    };
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
    const fxRate = await this.fxRateForFilter(query);
    // GIST-префильтр `&&` по geography + точный ST_Within (geometry); NULL-location отсекается.
    const filterSql = Prisma.sql`${this.buildWhereSql(query, fxRate)} AND location IS NOT NULL AND location && ${polygon}::geography AND ST_Within(location::geometry, ${polygon})`;
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
   * `GET /api/v1/search/price-distribution` — гистограмма цены для слайдера.
   * Глобально по transaction_type, только видимые ACTIVE-объявления.
   * Домен [0, max], где max = niceCeil(p99); всё дороже — overflow.
   *
   * FX (зеркало ценового фильтра, {@link buildWhereSql}): при наличии курса ЦБУ
   * учитываются объявления ОБЕИХ валют, цена каждого приводится к `currency` —
   * гистограмма совпадает с конвертированными ценами выдачи и не «теряет» половину
   * объявлений другой валюты. Нет курса → деградация к прежней per-currency
   * гистограмме (только листинги валюты запроса, raw-цена).
   */
  async priceDistribution(
    query: PriceDistributionQueryDto,
  ): Promise<PriceDistributionResponseDto> {
    const N = 30;
    const rate = await this.fxRate();
    // Цена, приведённая к валюте запроса; нет курса → сырая цена (см. `where`).
    const priceExpr = rate
      ? this.priceInCurrencySql(query.currency, rate)
      : Prisma.sql`price`;
    // Есть курс → все валюты (конвертируем); нет курса → только валюта запроса.
    const where = rate
      ? Prisma.sql`status = 'ACTIVE' AND transaction_type::text = ${query.transaction_type}`
      : Prisma.sql`status = 'ACTIVE' AND transaction_type::text = ${query.transaction_type} AND currency::text = ${query.currency}`;

    const statsRows = await this.prisma.$queryRaw<
      { ceiling: number | null; total: number }[]
    >(Prisma.sql`
      SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY ${priceExpr})::float8 AS ceiling,
             count(*)::int AS total
      FROM listings
      WHERE ${where}
    `);
    const total = statsRows[0]?.total ?? 0;
    const max = niceCeil(statsRows[0]?.ceiling ?? 0);

    if (total === 0 || max <= 0) {
      return {
        currency: query.currency,
        transaction_type: query.transaction_type,
        min: 0,
        max: 0,
        buckets: [],
        overflow_count: 0,
      };
    }

    const bucketRows = await this.prisma.$queryRaw<{ b: number; c: number }[]>(
      Prisma.sql`
        SELECT width_bucket((${priceExpr})::float8, 0::float8, ${max}::float8, ${N}::int) AS b, count(*)::int AS c
        FROM listings
        WHERE ${where}
        GROUP BY b
        ORDER BY b
      `,
    );

    const counts = new Map<number, number>();
    for (const r of bucketRows) counts.set(Number(r.b), Number(r.c));

    const step = max / N;
    const buckets: PriceBucketDto[] = [];
    for (let i = 1; i <= N; i++) {
      buckets.push({ from: (i - 1) * step, to: i * step, count: counts.get(i) ?? 0 });
    }
    // width_bucket → N+1 для price >= max (и 0 для price < 0, чего не бывает).
    const overflow_count = counts.get(N + 1) ?? 0;

    return {
      currency: query.currency,
      transaction_type: query.transaction_type,
      min: 0,
      max,
      buckets,
      overflow_count,
    };
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
    const fxRate = await this.fxRateForFilter(query);
    const filterSql = Prisma.sql`${this.buildWhereSql(query, fxRate)} AND location IS NOT NULL`;

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
   * Для GIST-префильтра по geography использовать {@link boundsPrefilterSql}
   * (каст к geography при ширине ≥ 180° по долготе вырождается, TASK-226).
   */
  private envelopeSql(query: BoundsSearchQueryDto): Prisma.Sql {
    return Prisma.sql`ST_MakeEnvelope(${query.sw_lng}, ${query.sw_lat}, ${query.ne_lng}, ${query.ne_lat}, 4326)`;
  }

  /**
   * GIST-префильтр bbox по geography-колонке `location`. При касте planar-envelope
   * к geography рёбра становятся дугами больших кругов «коротким путём»: при ширине
   * bbox ≥ 180° по долготе полигон вырождается/инвертируется (при 360° горизонтальные
   * рёбра — нулевой длины), и `&&` отбрасывает всё (баг мобилки 2026-07-04, TASK-226).
   * Поэтому широкий bbox режется на куски ≤ 90° по долготе (запас от граничных 180°),
   * префильтр — OR по кускам (GIST bitmap-OR, индекс работает). Для кусков < 180°
   * geography-полигон — надмножество planar-прямоугольника (дуги выгибаются к полюсам),
   * т.е. префильтр остаётся корректным надмножеством; точность гарантирует ST_Within.
   */
  private boundsPrefilterSql(query: {
    sw_lat: number;
    sw_lng: number;
    ne_lat: number;
    ne_lng: number;
  }): Prisma.Sql {
    const span = query.ne_lng - query.sw_lng;
    if (span < 180) {
      const envelope = Prisma.sql`ST_MakeEnvelope(${query.sw_lng}, ${query.sw_lat}, ${query.ne_lng}, ${query.ne_lat}, 4326)`;
      return Prisma.sql`location && ${envelope}::geography`;
    }
    const chunks = Math.ceil(span / 90);
    const step = span / chunks;
    const parts: Prisma.Sql[] = [];
    for (let i = 0; i < chunks; i += 1) {
      const west = query.sw_lng + i * step;
      const east = i === chunks - 1 ? query.ne_lng : query.sw_lng + (i + 1) * step;
      parts.push(
        Prisma.sql`location && ST_MakeEnvelope(${west}, ${query.sw_lat}, ${east}, ${query.ne_lat}, 4326)::geography`,
      );
    }
    return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
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
   * Условие территории по необязательному `points` (TASK-249, ADR-0133) для
   * `/search` и `/search/bounds` — та же полигональная фильтрация, что у
   * `/search/polygon` ({@link polygonSql}), но подмешиваемая ДОПОЛНИТЕЛЬНО к
   * bbox/скалярным фильтрам, а не вместо них. `undefined` (контур не задан) →
   * `Prisma.empty` (условие не добавляется). Валидность строки уже гарантирована
   * DTO-декоратором (`IsPolygonRingOptional`), поэтому `parsePolygonRing` здесь
   * не должен бросать — как и в {@link searchPolygon}/{@link
   * matchNewlyActiveListings}, парсинг — единственный источник истины
   * ({@link parsePolygonRing}), расхождение невозможно.
   */
  private pointsFilterSql(points: string | undefined): Prisma.Sql {
    if (points === undefined) return Prisma.empty;
    const polygon = this.polygonSql(parsePolygonRing(points));
    return Prisma.sql`AND location IS NOT NULL AND location && ${polygon}::geography AND ST_Within(location::geometry, ${polygon})`;
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
    const query = filters as unknown as SearchListingsQueryDto;
    const filterSql = this.buildWhereSql(
      query,
      await this.fxRateForFilter(query),
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
   * + `rooms` (TASK-207) + свободный текст `q` (TASK-208, ADR-0067)
   * + Zillow-фильтры Phase 1 (TASK-Zillow): `property_type` (IN-массив),
   *   `rooms_min`, `area_min/max`, `floor_min/max`, `not_first_floor`,
   *   `not_last_floor`, `total_floors_min/max`, `year_min/max`,
   *   `listing_source` (OWNER/AGENCY — по роли владельца), `tours_enabled`.
   *
   * Параметры биндятся через `Prisma.sql` (защита от инъекций). Enum-колонки
   * сравниваются через `::text` (не зависит от имени PG-типа); ценовой диапазон
   * FX-нормализуется в валюту `currency` по переданному `rate` (курс ЦБУ), чтобы
   * фильтр совпадал с конвертированными ценами, которые видит пользователь;
   * `rate=null` → деградация к сравнению в пределах одной валюты.
   *
   * `rooms` (TASK-207/TASK-247, ADR-0133, BREAKING): массив ИЛИ одиночное число —
   * `matchNewlyActiveListings` передаёт сырой `filters_json` в обход DTO, поэтому
   * этот метод принимает `query.rooms` нативно как `number | number[]`. Каждое
   * значение 0..4 — ТОЧНОЕ совпадение (`IN (...)`), 5 — «5 и более» (`>= 5`);
   * ветки комбинируются через OR. Раньше одиночное `rooms=4` трактовалось как
   * «4 и более» — теперь это РОВНО 4 (BREAKING).
   * `rooms_min`: «N и более» (rooms >= N) — для кнопок 1+/2+/…/5+.
   * Применяется во всех эндпоинтах поиска (включая гео-варианты).
   *
   * `q` (TASK-208, ADR-0067): ILIKE-подстрока (pg_trgm GIN, case-insensitive) по
   * `listings.address` + EXISTS (listing_translations.title/description, любой язык).
   * Пользовательский ввод LIKE-экранируется (`\`, `%`, `_`), чтобы литеральный `%`
   * не работал как wildcard. GIN-индексы (migration 20260613120000_*) ускоряют
   * запросы с term ≥ 3 символов; более короткие термы работают через seq scan.
   */
  private buildWhereSql(
    query: SearchListingsQueryDto,
    rate: string | null = null,
  ): Prisma.Sql {
    const conds: Prisma.Sql[] = [Prisma.sql`status = 'ACTIVE'`];

    if (query.transaction_type !== undefined)
      conds.push(
        Prisma.sql`transaction_type::text = ${query.transaction_type}`,
      );
    if (query.property_type !== undefined && query.property_type.length > 0)
      conds.push(
        Prisma.sql`property_type::text IN (${Prisma.join(query.property_type)})`,
      );
    if (query.city_id !== undefined)
      conds.push(Prisma.sql`city_id = ${query.city_id}::uuid`);
    if (query.district_id !== undefined)
      conds.push(Prisma.sql`district_id = ${query.district_id}::uuid`);
    if (query.region_id !== undefined)
      conds.push(
        Prisma.sql`district_id IN (SELECT id FROM districts WHERE region_id = ${query.region_id}::uuid)`,
      );
    // Страница агента (ADR-0140): только объявления этого владельца.
    if (query.agent_id !== undefined)
      conds.push(Prisma.sql`owner_id = ${query.agent_id}::uuid`);

    // Ценовой диапазон + валюта. Цену пользователь видит КОНВЕРТИРОВАННОЙ в
    // выбранную валюту (usePriceFormatter «≈ $X»), поэтому и фильтр обязан
    // сравнивать в той же валюте: цену каждого листинга приводим к `currency` по
    // текущему курсу ЦБУ (FX), а не отсекаем другую валюту равенством — иначе
    // объявления в иной валюте, визуально попадающие в диапазон, молча выпадают.
    // Нет курса (`rate=null`) → безопасная деградация к сравнению в пределах одной
    // валюты (кросс-валютное сравнение сырых чисел бессмысленно).
    const hasPriceBound =
      query.price_min !== undefined || query.price_max !== undefined;
    if (hasPriceBound && query.currency !== undefined && rate) {
      const priceInCurrency = this.priceInCurrencySql(query.currency, rate);
      if (query.price_min !== undefined)
        conds.push(Prisma.sql`${priceInCurrency} >= ${query.price_min}::numeric`);
      if (query.price_max !== undefined)
        conds.push(Prisma.sql`${priceInCurrency} <= ${query.price_max}::numeric`);
    } else {
      if (query.currency !== undefined)
        conds.push(Prisma.sql`currency::text = ${query.currency}`);
      if (query.price_min !== undefined)
        conds.push(Prisma.sql`price >= ${query.price_min}::numeric`);
      if (query.price_max !== undefined)
        conds.push(Prisma.sql`price <= ${query.price_max}::numeric`);
    }
    // TASK-247 (ADR-0133): `query.rooms` — массив (DTO) ИЛИ одиночное число
    // (сырые `filters_json` в matchNewlyActiveListings, в обход DTO-трансформа).
    // Каждое значение 0..4 — точное совпадение (IN), 5 — «5 и более» (>= 5).
    if (query.rooms !== undefined) {
      const roomsValues = Array.isArray(query.rooms)
        ? query.rooms
        : [query.rooms];
      if (roomsValues.length > 0) {
        const exact = roomsValues.filter((v) => v < 5);
        const hasFivePlus = roomsValues.some((v) => v >= 5);
        const parts: Prisma.Sql[] = [];
        if (exact.length > 0)
          parts.push(Prisma.sql`rooms IN (${Prisma.join(exact)})`);
        if (hasFivePlus) parts.push(Prisma.sql`rooms >= 5`);
        if (parts.length > 0)
          conds.push(Prisma.sql`(${Prisma.join(parts, ' OR ')})`);
      }
    }

    // Zillow Phase 1: «N+ комнат»
    if (query.rooms_min !== undefined)
      conds.push(Prisma.sql`rooms >= ${query.rooms_min}`);

    // Zillow Phase 2 + мобилка #3: «N+ санузлов», дробный шаг 0.5
    if (query.bathrooms_min !== undefined)
      conds.push(Prisma.sql`bathrooms >= ${query.bathrooms_min}::numeric`);

    // Zillow Phase 2: тип парковки (IN-мультивыбор; NULL исключается)
    if (query.parking_type !== undefined && query.parking_type.length > 0)
      conds.push(
        Prisma.sql`parking_type::text IN (${Prisma.join(query.parking_type)})`,
      );

    // Zillow Phase 2: удобства (AND — есть ВСЕ выбранные; пустой/NULL-массив не матчит).
    // Колонка теперь text[] (справочник amenities), containment @> ARRAY[...]::text[]
    // сохраняет GIN-индекс listings_amenities_idx (типы совпадают, каста колонки нет).
    if (query.amenities !== undefined && query.amenities.length > 0)
      conds.push(
        Prisma.sql`amenities @> ARRAY[${Prisma.join(query.amenities)}]::text[]`,
      );

    // Zillow Phase 1: диапазон площади (м²)
    if (query.area_min !== undefined)
      conds.push(Prisma.sql`area >= ${query.area_min}::numeric`);
    if (query.area_max !== undefined)
      conds.push(Prisma.sql`area <= ${query.area_max}::numeric`);

    // Zillow Phase 2: диапазон площади участка (соток)
    if (query.lot_area_min !== undefined)
      conds.push(Prisma.sql`lot_area >= ${query.lot_area_min}::numeric`);
    if (query.lot_area_max !== undefined)
      conds.push(Prisma.sql`lot_area <= ${query.lot_area_max}::numeric`);

    // Zillow Phase 1: этаж
    if (query.floor_min !== undefined)
      conds.push(Prisma.sql`floor >= ${query.floor_min}`);
    if (query.floor_max !== undefined)
      conds.push(Prisma.sql`floor <= ${query.floor_max}`);
    if (query.not_first_floor === true)
      conds.push(Prisma.sql`floor > 1`);
    if (query.not_last_floor === true)
      conds.push(Prisma.sql`floor < total_floors`);

    // Мобилка #4: только цокольный этаж
    if (query.is_basement === true)
      conds.push(Prisma.sql`is_basement = true`);

    // Zillow Phase 1: этажность здания
    if (query.total_floors_min !== undefined)
      conds.push(Prisma.sql`total_floors >= ${query.total_floors_min}`);
    if (query.total_floors_max !== undefined)
      conds.push(Prisma.sql`total_floors <= ${query.total_floors_max}`);

    // Zillow Phase 1: год постройки
    if (query.year_min !== undefined)
      conds.push(Prisma.sql`year_built >= ${query.year_min}`);
    if (query.year_max !== undefined)
      conds.push(Prisma.sql`year_built <= ${query.year_max}`);

    // Новостройка — вычисляемая категория: зданию меньше 3 лет ЛИБО год
    // постройки в будущем (недострой — «сдача в 2028»). NULL year_built не
    // проходит. Порог считаем на сервере, чтобы URL был стабильным
    // (?new_construction=true, без «протухающего» года на клиенте).
    if (query.new_construction === true)
      conds.push(
        Prisma.sql`year_built >= ${new Date().getFullYear() - NEW_CONSTRUCTION_MAX_AGE_YEARS + 1}`,
      );

    // Zillow Phase 1: источник (собственник / агентство).
    // Тип продавца определяем по РОЛИ владельца — так же, как contact-блок в
    // ListingsService (AGENT/AGENCY → «агентство», иначе «собственник»). Раньше
    // фильтр смотрел на `agency_id`, но это колонка-заглушка (агентства как
    // сущность ещё не заведены) — она всегда NULL, из-за чего AGENCY не находил
    // ничего, а OWNER возвращал всё. owner_id ссылается на внешнюю `listings`.
    if (query.listing_source !== undefined && query.listing_source.length === 1) {
      const ownerIsAgency = Prisma.sql`EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = listings.owner_id AND r.code IN ('AGENT', 'AGENCY')
      )`;
      conds.push(
        query.listing_source[0] === 'OWNER'
          ? Prisma.sql`NOT ${ownerIsAgency}`
          : ownerIsAgency,
      );
    }

    // Zillow Phase 1: только с туром
    if (query.tours_enabled === true)
      conds.push(Prisma.sql`tours_enabled = true`);

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
      reference: listing.reference,
      status: listing.status,
      transaction_type: listing.transactionType,
      property_type: listing.propertyType,
      // Контракт §9 — price строкой с 2 дробными (Decimal.toString() срезал бы нули).
      price: listing.price.toFixed(2),
      currency: listing.currency,
      rooms: listing.rooms,
      // Контракт: number с шагом 0.5 (не строка, как другие Decimal) — спека 2026-07-02.
      bathrooms: listing.bathrooms?.toNumber() ?? null,
      parking_type: listing.parkingType,
      is_basement: listing.isBasement,
      area: listing.area?.toFixed(2) ?? null,
      lot_area: listing.lotArea?.toFixed(2) ?? null,
      city_id: listing.cityId,
      district_id: listing.districtId,
      // Локализованный адрес (ADR-0147): EN — перевод с фолбэком на канон;
      // остальные языки (включая UZ, у которого своего перевода адреса нет) — канон RU.
      address:
        language === Language.EN
          ? (listing.addressEn ?? listing.address)
          : listing.address,
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
      views_count: listing.viewsCount,
      likes_count: listing._count.favorites,
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
