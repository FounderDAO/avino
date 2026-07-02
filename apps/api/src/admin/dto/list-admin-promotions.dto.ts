import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PromotionStatus, PromotionType } from '@prisma/client';

/**
 * Query-параметры `GET /api/v1/admin/promotions` (ADMIN-16).
 *
 * Фильтры `status`/`type` опциональны и комбинируются через AND. `type`
 * валидируется по полному enum `promotion_type`: `NORMAL`-строк в ledger'е не
 * бывает (создаются только TOP/VIP), фильтр по NORMAL просто вернёт пусто.
 * Числа приводит глобальный ValidationPipe (`enableImplicitConversion`);
 * page-based пагинация (1-based) с обязательным `meta.total` (API.md §4).
 */
export class ListAdminPromotionsQueryDto {
  @IsOptional()
  @IsEnum(PromotionStatus)
  status?: PromotionStatus;

  @IsOptional()
  @IsEnum(PromotionType)
  type?: PromotionType;

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
