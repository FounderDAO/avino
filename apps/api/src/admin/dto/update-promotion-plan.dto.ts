import { IsBoolean, IsOptional, Matches } from 'class-validator';

/** Тело `PATCH /admin/promotion-plans/:id`. price — Decimal-строка > 0. */
export class UpdatePromotionPlanDto {
  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'price must be a positive decimal' })
  price?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
