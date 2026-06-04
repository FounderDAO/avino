import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsNumber, Max, Min } from 'class-validator';
import { SearchListingsQueryDto } from './search-listings.dto';

/** Верхняя граница радиуса (метры) — ограничивает стоимость гео-запроса. */
const MAX_RADIUS_M = 50_000;

/**
 * Общие гео-параметры точки запроса (TASK-082, API.md §10).
 *
 * `lat`/`lng` — обязательные координаты центра поиска (WGS84). Валидация
 * диапазона обязательна (CLAUDE.md §12, acceptance criteria): широта −90..90,
 * долгота −180..180; невалидные/отсутствующие → `400 VALIDATION_ERROR`. Числа из
 * query приводятся к `number` глобальным ValidationPipe (`enableImplicitConversion`).
 * Наследует базовые фильтры §9 (тип сделки/недвижимости, цена, локация, limit).
 */
export class GeoSearchQueryDto extends SearchListingsQueryDto {
  /** Широта центра поиска (WGS84), −90..90. */
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  @Min(-90)
  @Max(90)
  lat!: number;

  /** Долгота центра поиска (WGS84), −180..180. */
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  @Min(-180)
  @Max(180)
  lng!: number;
}

/**
 * Query-параметры `GET /api/v1/search/radius` (TASK-082, API.md §10).
 *
 * Поиск ACTIVE-листингов в радиусе `radius_m` метров от точки (`ST_DWithin` по
 * GIST-индексу). Порядок — promotion-приоритетный, как у `/search` (keyset),
 * каждый элемент получает `distance_m` (метры, `ST_Distance`).
 */
export class RadiusSearchQueryDto extends GeoSearchQueryDto {
  /** Радиус поиска в метрах (1..50000). */
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(MAX_RADIUS_M)
  radius_m!: number;
}

/**
 * Query-параметры `GET /api/v1/search/near-me` (TASK-082, API.md §10).
 *
 * Ближайшие к точке ACTIVE-листинги, отсортированные по дистанции (`ST_Distance`
 * ASC), промо — вторичный ключ при равенстве. Одна страница, размер — `limit`
 * (наследуется из §9, default 20 / max 100); keyset-курсор не применяется.
 */
export class NearMeSearchQueryDto extends GeoSearchQueryDto {}

/**
 * Query-параметры `GET /api/v1/search/bounds` (TASK-083, API.md §10).
 *
 * Поиск ACTIVE-листингов внутри видимой области карты (bbox `ST_MakeEnvelope` +
 * точный `ST_Within`). `sw_*` — юго-западный угол, `ne_*` — северо-восточный
 * (WGS84). Валидация диапазона обязательна (CLAUDE.md §12): широта −90..90,
 * долгота −180..180; невалидные/отсутствующие → `400 VALIDATION_ERROR`. Порядок —
 * promotion-приоритетный (keyset), как у `/search`; `distance_m` не возвращается
 * (центральной точки у bbox нет). Наследует базовые фильтры §9.
 *
 * Не поддерживает bbox через антимеридиан (`sw_lng > ne_lng`) — для рынка
 * Узбекистана не требуется; вырожденный/перевёрнутый bbox даёт пустую выдачу.
 */
export class BoundsSearchQueryDto extends SearchListingsQueryDto {
  /** Широта юго-западного угла (WGS84), −90..90. */
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  @Min(-90)
  @Max(90)
  sw_lat!: number;

  /** Долгота юго-западного угла (WGS84), −180..180. */
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  @Min(-180)
  @Max(180)
  sw_lng!: number;

  /** Широта северо-восточного угла (WGS84), −90..90. */
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  @Min(-90)
  @Max(90)
  ne_lat!: number;

  /** Долгота северо-восточного угла (WGS84), −180..180. */
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  @Min(-180)
  @Max(180)
  ne_lng!: number;
}
