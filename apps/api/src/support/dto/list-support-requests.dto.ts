import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SupportRequestStatus } from '@prisma/client';

/**
 * Query `GET /api/v1/admin/support/requests`. Фильтр `status` опционален;
 * page-based пагинация (1-based) с обязательным `meta.total` (API.md §4).
 */
export class ListSupportRequestsQueryDto {
  @IsOptional()
  @IsEnum(SupportRequestStatus)
  status?: SupportRequestStatus;

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
