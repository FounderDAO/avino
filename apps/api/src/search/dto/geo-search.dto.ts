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
