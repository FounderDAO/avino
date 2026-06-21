import { IsBoolean } from 'class-validator';

/** Тело `PATCH /api/v1/admin/promotions-flag`. */
export class UpdatePromotionsFlagDto {
  @IsBoolean()
  enabled!: boolean;
}
