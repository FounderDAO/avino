import { IsIn, IsInt } from 'class-validator';
import { PromotionType } from '@prisma/client';

/** Тиры, которые можно активировать вручную (`NORMAL` = «нет промо», не тариф). */
const ACTIVATABLE_TYPES: readonly PromotionType[] = [
  PromotionType.TOP,
  PromotionType.VIP,
];

/**
 * Тело `POST /api/v1/admin/listings/:id/promotions` (TASK-121, API.md §15).
 *
 * `type` — платный тариф `TOP | VIP` (`NORMAL` отклоняется валидацией: это не
 * тариф). `period_days` валидируется только как целое — допустимость значения
 * (7/14/30) проверяет сервис по каталогу {@link PROMOTION_PLANS} и при промахе
 * отдаёт `422 INVALID_PERIOD` (а не `400`), как требует контракт.
 *
 * Идемпотентность активации идёт через заголовок `Idempotency-Key`, а не через
 * тело (см. контроллер), поэтому здесь его нет.
 */
export class ActivatePromotionDto {
  @IsIn(ACTIVATABLE_TYPES)
  type!: PromotionType;

  @IsInt()
  period_days!: number;
}
