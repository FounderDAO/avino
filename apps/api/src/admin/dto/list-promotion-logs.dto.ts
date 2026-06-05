import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PromotionAdminAction } from '@prisma/client';

/**
 * Query-параметры `GET /api/v1/admin/promotion-logs` (TASK-131, API.md §16).
 *
 * Глобальный журнал админских действий над промо VIP/TOP (`promotion_logs`,
 * TASK-121/122). Фильтры `listing_id` / `admin_id` / `action`
 * (`ACTIVATE_VIP | ACTIVATE_TOP | CANCEL_PROMOTION | EXTEND_PROMOTION`)
 * комбинируются через AND. Page-based пагинация (1-based) с обязательным
 * `meta.total` (API.md §4).
 */
export class ListPromotionLogsQueryDto {
  @IsOptional()
  @IsUUID()
  listing_id?: string;

  @IsOptional()
  @IsUUID()
  admin_id?: string;

  @IsOptional()
  @IsEnum(PromotionAdminAction)
  action?: PromotionAdminAction;

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
