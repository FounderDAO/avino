import { IsInt } from 'class-validator';

/**
 * Тело `PATCH /api/v1/admin/listing-promotions/:id/extend` (TASK-122, API.md §15).
 *
 * `period_days` валидируется здесь только как целое; допустимость значения
 * (7/14/30) проверяет сервис по каталогу {@link PROMOTION_PLANS} и при промахе
 * отдаёт `422 INVALID_PERIOD` (а не `400`), как требует контракт — симметрично
 * активации ({@link ActivatePromotionDto}).
 */
export class ExtendPromotionDto {
  @IsInt()
  period_days!: number;
}
