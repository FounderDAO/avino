import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { Currency } from '@prisma/client';
import { BoundsSearchQueryDto } from './geo-search.dto';

/**
 * Query для `GET /api/v1/search/clusters` (кластеризация карты, TASK-225,
 * ADR-0126). Наследует bbox (`sw_*`/`ne_*`) и все фильтры §9 от
 * {@link BoundsSearchQueryDto}; `zoom` задаёт шаг кластерной сетки
 * (~8 ячеек на тайл 256px web-mercator). Унаследованные `limit`/`cursor`/`sort`
 * игнорируются — ответ не пагинируется (агрегат, не список).
 */
export class ClustersSearchQueryDto extends BoundsSearchQueryDto {
  /** Зум карты (web-mercator), 0..22 — определяет размер ячейки сетки. */
  @ApiProperty({ minimum: 0, maximum: 22, description: 'Зум карты (web-mercator); задаёт шаг кластерной сетки' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(22)
  zoom!: number;
}

/** Одна ячейка кластерной сетки: центроид точек, счётчик и ценовые агрегаты. */
export class ClusterCellDto {
  @ApiProperty({ description: 'Широта центроида листингов ячейки (WGS84)' })
  latitude!: number;

  @ApiProperty({ description: 'Долгота центроида листингов ячейки (WGS84)' })
  longitude!: number;

  @ApiProperty({ description: 'Число объявлений в ячейке' })
  count!: number;

  @ApiProperty({ description: 'Минимальная цена в ячейке (в валюте ответа)' })
  min_price!: number;

  @ApiProperty({ description: 'Средняя цена в ячейке (в валюте ответа)' })
  avg_price!: number;
}

/**
 * Ответ кластеризации. `currency` — валюта, к которой FX-нормализованы
 * min_price/avg_price (курс ЦБУ); при отсутствии строки курса цены сырые
 * (без конвертации, деградация как в ADR-0117).
 */
export class ClustersResponseDto {
  @ApiProperty({ type: [ClusterCellDto] })
  data!: ClusterCellDto[];

  @ApiProperty({ enum: Currency, description: 'Валюта ценовых агрегатов' })
  currency!: Currency;
}
