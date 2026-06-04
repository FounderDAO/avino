import { Injectable } from '@nestjs/common';
import { PROMOTION_PLANS, PromotionPlan } from './promotions.catalog';

/** Ответ `GET /api/v1/promotions/plans` — публичный каталог планов. */
export interface PromotionPlansResponse {
  plans: PromotionPlan[];
}

/**
 * PromotionsService — публичный каталог промо-планов (TASK-120, API.md §15).
 *
 * Планы статичны (см. {@link PROMOTION_PLANS}), поэтому БД здесь не нужна. Админ-
 * активация VIP/TOP и работа с `listing_promotions` — отдельные задачи
 * (TASK-121/122/123).
 */
@Injectable()
export class PromotionsService {
  /** Вернуть весь каталог планов (тир × период × цена). */
  getPlans(): PromotionPlansResponse {
    return { plans: PROMOTION_PLANS.map((plan) => ({ ...plan })) };
  }
}
