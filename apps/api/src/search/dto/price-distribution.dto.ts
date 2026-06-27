import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Currency, TransactionType } from '@prisma/client';

/**
 * Query для `GET /api/v1/search/price-distribution` (гистограмма цены).
 * Оба параметра обязательны: распределение считается в пределах одной валюты
 * и одного типа сделки (цена сравнивается без FX, API.md §9).
 */
export class PriceDistributionQueryDto {
  /** Валюта распределения (бакеты строятся по объявлениям в этой валюте). */
  @ApiProperty({ enum: Currency })
  @IsEnum(Currency)
  currency!: Currency;

  /** Тип сделки (продажа/аренда — у них принципиально разный масштаб цен). */
  @ApiProperty({ enum: TransactionType })
  @IsEnum(TransactionType)
  transaction_type!: TransactionType;
}

/** Один столбик гистограммы: полуинтервал [from, to) и число объявлений. */
export class PriceBucketDto {
  @ApiProperty({ description: 'Нижняя граница бакета (включительно)' })
  from!: number;

  @ApiProperty({ description: 'Верхняя граница бакета (исключительно)' })
  to!: number;

  @ApiProperty({ description: 'Число объявлений в бакете' })
  count!: number;
}

/**
 * Распределение цен для слайдера: домен [min, max], бакеты равной ширины и
 * «хвост» overflow_count (объявления дороже max — аналог Zillow «$10M+»).
 */
export class PriceDistributionResponseDto {
  @ApiProperty({ enum: Currency })
  currency!: Currency;

  @ApiProperty({ enum: TransactionType })
  transaction_type!: TransactionType;

  @ApiProperty({ description: 'Нижняя граница домена (всегда 0)' })
  min!: number;

  @ApiProperty({ description: 'Верхняя граница домена (округлённый p99-потолок)' })
  max!: number;

  @ApiProperty({ type: [PriceBucketDto] })
  buckets!: PriceBucketDto[];

  @ApiProperty({ description: 'Число объявлений строго дороже max' })
  overflow_count!: number;
}
