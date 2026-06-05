import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ModerationAction } from '@prisma/client';

/**
 * Query-параметры `GET /api/v1/admin/moderation-logs` (TASK-131, API.md §16).
 *
 * Глобальный журнал модерации (все объявления) — в отличие от per-listing
 * `GET /admin/listings/:id/moderation-logs` (TASK-053). Фильтры `listing_id` /
 * `moderator_id` / `action` комбинируются через AND. Числа из query приводятся
 * к `number` глобальным ValidationPipe (`enableImplicitConversion`). Page-based
 * пагинация (1-based) с обязательным `meta.total` (API.md §4).
 */
export class ListModerationLogsQueryDto {
  @IsOptional()
  @IsUUID()
  listing_id?: string;

  @IsOptional()
  @IsUUID()
  moderator_id?: string;

  @IsOptional()
  @IsEnum(ModerationAction)
  action?: ModerationAction;

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
