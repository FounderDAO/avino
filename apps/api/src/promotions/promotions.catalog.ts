import { Currency, PromotionType } from '@prisma/client';

/**
 * Статический каталог промо-планов (TASK-120, API.md §15, ADR-0004).
 *
 * Планы — это матрица «тир × период × цена». Отдельной таблицы `promotion_plans`
 * в схеме нет (DB_SCHEMA.md §8): для MVP каталог фиксирован в коде и является
 * единственным источником истины. Активацию делает админ вручную
 * (`payment_status = NOT_REQUIRED`), online-оплаты в MVP нет.
 *
 * Тиры: `TOP | VIP` (без `NORMAL` — это «нет промо»). Периоды: `7 | 14 | 30`
 * дней (DB-чек `period_days IN (7,14,30)`). Цены — строки `Decimal` (UZS),
 * чтобы не терять точность на клиенте; FX в MVP нет.
 */
export interface PromotionPlan {
  /** Тир продвижения. Только `TOP` или `VIP`. */
  type: PromotionType;
  /** Длительность плана в днях: 7, 14 или 30. */
  period_days: number;
  /** Цена как строка-`Decimal` (например `"50000.00"`). */
  price: string;
  /** Валюта цены. В MVP — только `UZS`. */
  currency: Currency;
}

/**
 * Каталог планов. Цены согласованы с Team Lead: 7/30 дней зафиксированы в
 * API.md §15, 14 дней — середина между ними (TOP 90k, VIP 210k UZS).
 */
export const PROMOTION_PLANS: readonly PromotionPlan[] = [
  { type: PromotionType.TOP, period_days: 7, price: '50000.00', currency: Currency.UZS },
  { type: PromotionType.TOP, period_days: 14, price: '90000.00', currency: Currency.UZS },
  { type: PromotionType.TOP, period_days: 30, price: '150000.00', currency: Currency.UZS },
  { type: PromotionType.VIP, period_days: 7, price: '120000.00', currency: Currency.UZS },
  { type: PromotionType.VIP, period_days: 14, price: '210000.00', currency: Currency.UZS },
  { type: PromotionType.VIP, period_days: 30, price: '350000.00', currency: Currency.UZS },
] as const;

/**
 * Найти план по тиру и периоду. `undefined`, если комбинации нет в каталоге
 * (например `period_days` не из {7,14,30}) — вызывающий трактует это как
 * `422 INVALID_PERIOD`. Каталог — единственный источник цены/валюты активации
 * (TASK-121), online-оплаты в MVP нет.
 */
export function findPlan(
  type: PromotionType,
  periodDays: number,
): PromotionPlan | undefined {
  return PROMOTION_PLANS.find(
    (plan) => plan.type === type && plan.period_days === periodDays,
  );
}
