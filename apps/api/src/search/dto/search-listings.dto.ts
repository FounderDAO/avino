import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Currency, PropertyType, TransactionType } from '@prisma/client';

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
 * Неизвестные параметры игнорируются (forward-compatible, API.md §4). Числа из
 * query приводятся к `number` глобальным ValidationPipe (`enableImplicitConversion`).
 */
export class SearchListingsQueryDto {
  @IsOptional()
  @IsEnum(TransactionType)
  transaction_type?: TransactionType;

  @IsOptional()
  @IsEnum(PropertyType)
  property_type?: PropertyType;

  /** Нижняя граница цены (включительно), в пределах `currency`, без FX. */
  @IsOptional()
  @Matches(DECIMAL_2, { message: 'price_min must be a decimal with up to 2 fraction digits' })
  price_min?: string;

  /** Верхняя граница цены (включительно), в пределах `currency`, без FX. */
  @IsOptional()
  @Matches(DECIMAL_2, { message: 'price_max must be a decimal with up to 2 fraction digits' })
  price_max?: string;

  /** Валюта диапазона цен (price_min/price_max сравниваются в её пределах). */
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsUUID()
  city_id?: string;

  @IsOptional()
  @IsUUID()
  district_id?: string;

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
