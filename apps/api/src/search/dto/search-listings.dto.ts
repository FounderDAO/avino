import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  Amenity,
  Currency,
  ParkingType,
  PromotionType,
  PropertyType,
  TransactionType,
} from '@prisma/client';
import { IsPolygonRingOptional } from './polygon-ring.util';
/**
 * Допустимые значения параметра `sort` (TASK-207, API.md §9).
 * `date_desc` — умолчание (promotion-приоритетный ORDER BY тир→created_at DESC→id DESC).
 * Promotion-тир всегда остаётся ПЕРВИЧНЫМ ключом сортировки независимо от выбранного режима.
 */
export const SORT_MODES = [
  'date_desc',
  'price_asc',
  'price_desc',
  'area_desc',
] as const;
export type SortMode = (typeof SORT_MODES)[number];

/** Допустимые значения `bathrooms_min` — кнопки фильтра «1+ / 1.5+ / 2+ / 2.5+ / 3+ / 4+». */
export const BATHROOMS_MIN_VALUES = [1, 1.5, 2, 2.5, 3, 4];

/** Источник объявления для фильтра «от собственника / агентства». */
export const LISTING_SOURCES = ['OWNER', 'AGENCY'] as const;
export type ListingSource = (typeof LISTING_SOURCES)[number];

/** query-строка → массив (single или повторяющийся параметр). */
const toArray = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

/**
 * query-строка → массив ЧИСЕЛ (single или повторяющийся параметр, TASK-247).
 * Зеркалит {@link toArray}, но дополнительно приводит каждый элемент к `Number`
 * — `@IsInt({ each: true })` затем валидирует результат (нечисловой элемент →
 * `NaN`, не является `int`, 400 VALIDATION_ERROR).
 */
const toNumberArray = ({ value }: { value: unknown }) => {
  if (value === undefined) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((v) => Number(v));
};

/**
 * query-строка 'true' → true, 'false' → false; иначе value as-is (→ @IsBoolean
 * вернёт 400 на мусор, а не молча проглотит как false).
 *
 * ВАЖНО про порядок с @Type(() => String): при enableImplicitConversion
 * class-transformer коэрсит значение по типу поля. Без @Type поле boolean →
 * Boolean('false') === true (любая непустая строка истинна). @Type(() => String)
 * фиксирует значение как строку, и @Transform(toBool) применяется уже к ней,
 * корректно отдавая false.
 */
const toBool = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

/**
 * Денежные поля — строки-Decimal, никогда float (ADR-002). До 12 цифр целой
 * части и до 2 дробных (`listings.price` — Decimal(14,2)).
 */
const DECIMAL_2 = /^\d{1,12}(\.\d{1,2})?$/;

/**
 * Query-параметры `GET /api/v1/search` (TASK-080, API.md §9).
 *
 * Публичный поиск по `ACTIVE` объявлениям. В рамках TASK-080 — базовые фильтры
 * (тип сделки/недвижимости, диапазон цены в пределах одной валюты, локация) и
 * keyset-пагинация. Promotion-приоритетная сортировка (`sort`), свободный текст
 * (`q`), area/rooms и гео-фильтры подключаются отдельными задачами (TASK-081/082).
 *
 * Forward-compatible (API.md §9): параметры этих будущих задач (`sort`, `q`,
 * `rooms`, `area_min/max`, `promotion_type`) клиент уже шлёт. Глобальный
 * ValidationPipe строгий (`forbidNonWhitelisted`), поэтому они объявлены ниже
 * как опциональные поля — иначе 400 «property … should not exist». Сейчас
 * валидируется только их форма; {@link buildWhereSql} их НЕ применяет —
 * фильтрация/сортировка включаются в TASK-081/082. Числа из query приводятся к
 * `number` глобальным ValidationPipe (`enableImplicitConversion`).
 */
export class SearchListingsQueryDto {
  @IsOptional()
  @IsEnum(TransactionType)
  transaction_type?: TransactionType;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(PropertyType, { each: true })
  property_type?: PropertyType[];

  /** Нижняя граница цены (включительно), в валюте `currency` (цены FX-нормализуются к ней). */
  @IsOptional()
  @Matches(DECIMAL_2, { message: 'price_min must be a decimal with up to 2 fraction digits' })
  price_min?: string;

  /** Верхняя граница цены (включительно), в валюте `currency` (цены FX-нормализуются к ней). */
  @IsOptional()
  @Matches(DECIMAL_2, { message: 'price_max must be a decimal with up to 2 fraction digits' })
  price_max?: string;

  /**
   * Валюта ценового диапазона. price_min/price_max трактуются в ней, а цены
   * листингов в другой валюте приводятся к ней по текущему курсу ЦБУ (FX), чтобы
   * фильтр совпадал с конвертированными ценами в выдаче. Нет курса → сравнение
   * только с листингами этой же валюты.
   */
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsUUID()
  city_id?: string;

  @IsOptional()
  @IsUUID()
  region_id?: string;

  @IsOptional()
  @IsUUID()
  district_id?: string;

  // ── Forward-compatible поля (API.md §9, TASK-081/082) ──────────────────────
  // Клиент уже шлёт эти параметры; пока валидируется только форма, фильтрация/
  // сортировка по ним НЕ применяется (см. SearchService.buildWhereSql). При
  // реализации 081/082 — подключить в where/orderBy и убрать этот раздел.

  /**
   * Сортировка выдачи (TASK-207). Promotion-тир всегда первичен.
   * `date_desc` — умолчание (created_at DESC); `price_asc`/`price_desc` — по цене;
   * `area_desc` — по площади (NULL-area последними). Невалидное значение → 400.
   */
  @IsOptional()
  @IsIn(SORT_MODES, {
    message: `sort must be one of: ${SORT_MODES.join(', ')}`,
  })
  sort?: SortMode;

  /**
   * Свободнотекстовый поиск (TASK-208, ADR-0067). Применяется как ILIKE-подстрока
   * (pg_trgm GIN, case-insensitive) по `listings.address` и по
   * `listing_translations.title`/`description` на любом языке (uz/ru/en). Пустая
   * строка и пробелы игнорируются. Максимум 200 символов.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  /**
   * Число комнат (TASK-207/TASK-247, ADR-0133). Повторяющийся query-параметр
   * (`rooms=2&rooms=3&rooms=5`) → массив, семантика OR/IN; одиночное значение
   * (обратная совместимость) заворачивается в массив из 1 элемента той же
   * `toNumberArray`-трансформацией, что и одиночный `property_type`/`amenities`.
   *
   * Семантика КАЖДОГО значения: 0..4 — ТОЧНОЕ совпадение (`rooms = N`), 5 —
   * «5 и более» (`rooms >= 5`). BREAKING (ADR-0133): раньше `rooms=4`
   * трактовался как «4 и более» (схлопывал 4/5/6 в одну выдачу) — теперь `rooms=4`
   * это РОВНО 4; для «4+» см. `rooms_min=4` либо явный список `rooms=4&rooms=5`.
   * Применяется во всех эндпоинтах поиска (включая гео-варианты).
   */
  @IsOptional()
  @Transform(toNumberArray)
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  rooms?: number[];

  /** «N+ комнат» (rooms >= N) — кнопки 1+/2+/…/5+. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rooms_min?: number;

  /** «N+ санузлов» (bathrooms >= N) — только 1 / 1.5 / 2 / 2.5 / 3 / 4 (кнопки фильтра). */
  @IsOptional()
  @Type(() => Number)
  @IsIn(BATHROOMS_MIN_VALUES)
  bathrooms_min?: number;

  /** Тип парковки — мультивыбор (IN), Zillow Phase 2. NULL-листинги исключаются. */
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(ParkingType, { each: true })
  parking_type?: ParkingType[];

  /** Удобства — мультивыбор (AND-containment), Zillow Phase 2. */
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(Amenity, { each: true })
  amenities?: Amenity[];

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) floor_min?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) floor_max?: number;
  @IsOptional() @Type(() => String) @Transform(toBool) @IsBoolean() not_first_floor?: boolean;
  @IsOptional() @Type(() => String) @Transform(toBool) @IsBoolean() not_last_floor?: boolean;

  /** Только цокольный этаж (мобилка #4): true → is_basement = true; false/нет — без фильтра. */
  @IsOptional() @Type(() => String) @Transform(toBool) @IsBoolean() is_basement?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) total_floors_min?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) total_floors_max?: number;
  @IsOptional() @Type(() => Number) @IsInt() year_min?: number;
  @IsOptional() @Type(() => Number) @IsInt() year_max?: number;

  /**
   * Источник: ['OWNER'] → agency_id IS NULL; ['AGENCY'] → IS NOT NULL; оба/пусто → без фильтра.
   */
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(LISTING_SOURCES, { each: true })
  listing_source?: ListingSource[];

  @IsOptional() @Type(() => String) @Transform(toBool) @IsBoolean() tours_enabled?: boolean;

  /** Нижняя граница площади (м²). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  area_min?: number;

  /** Верхняя граница площади (м²). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  area_max?: number;

  /** Площадь участка, соток (Zillow Phase 2). */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lot_area_min?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lot_area_max?: number;

  /**
   * Полигон нарисованной территории (freehand-лассо, TASK-249) — та же строка
   * `lat,lng;...`, что у `/search/polygon` (`PolygonSearchQueryDto.points`), но
   * НЕОБЯЗАТЕЛЬНАЯ: если задана, пересечение с контуром (`ST_Within`)
   * подмешивается к остальным фильтрам в `/search` и `/search/bounds`
   * (SearchService.search/searchBounds), а не только к bbox/скалярам.
   * `@IsPolygonRingOptional()` (не `@IsOptional() + @IsPolygonRing()`) — см.
   * комментарий у декоратора в `polygon-ring.util.ts` про гочу наследования
   * class-validator с `PolygonSearchQueryDto` (там `points` обязателен).
   */
  @IsPolygonRingOptional()
  points?: string;

  /** Фильтр по типу промо. Пока игнорируется. */
  @IsOptional()
  @IsEnum(PromotionType)
  promotion_type?: PromotionType;

  /** Непрозрачный keyset-токен последней позиции предыдущей страницы. */
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
