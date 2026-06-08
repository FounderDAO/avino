import { IsIn } from 'class-validator';

/** Тело `PATCH /admin/promotion-settings`. Только пресеты 6ч/12ч. */
export class UpdatePromotionSettingsDto {
  @IsIn([6, 12])
  expiryIntervalHours!: 6 | 12;
}
