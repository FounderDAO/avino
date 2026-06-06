import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ComplaintStatus } from '@prisma/client';

/**
 * Query-параметры `GET /api/v1/admin/complaints` (TASK-132, API.md §16).
 *
 * Фильтры `status` / `listing_id` опциональны и комбинируются через AND. Числа
 * из query приводятся к `number` глобальным ValidationPipe
 * (`enableImplicitConversion`). Page-based пагинация (1-based) с обязательным
 * `meta.total` (API.md §4).
 */
export class ListComplaintsQueryDto {
  @IsOptional()
  @IsEnum(ComplaintStatus)
  status?: ComplaintStatus;

  @IsOptional()
  @IsUUID()
  listing_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
