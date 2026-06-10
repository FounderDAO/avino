/**
 * Адаптеры: API DTO тарифов промо (`AdminPromotionPlan[]`) → UI-модель страницы.
 * Цикл 3: вёрстка остаётся на той же сигнатуре цены (`PromoPricing`), источник
 * данных — RTK Query (`GET /admin/promotion-plans`).
 *
 * `price` приходит decimal-строкой (ADR-002) — для UI приводим к `number`.
 * Редактирование цены/активности идёт через `PATCH /admin/promotion-plans/:id`,
 * поэтому помимо плоской таблицы цен возвращаем индекс с самими планами (нужен
 * `plan.id` по паре `(type, days)`).
 */
import type { AdminPromotionPlan } from '@/store/api/adminTypes';
import type { PromoPricing } from '@/lib/mock';

/** Тип-тариф (платные тиры; `NORMAL` — не тариф). */
export type PromoPlanType = 'TOP' | 'VIP';
/** Допустимые сроки промо (дни). */
export const PROMO_DAYS = [7, 14, 30] as const;

/**
 * Индекс планов по `type → days → plan`. Нужен для PATCH цены/активности
 * конкретного тарифа: ячейка таблицы знает `(type, days)`, отсюда достаёт `id`.
 */
export type PromoPlanIndex = Record<PromoPlanType, Record<number, AdminPromotionPlan>>;

/**
 * Плоская таблица цен для вёрстки (`PromoPricing`): группировка планов по
 * `type → { days: priceNumber }`. Срок без плана отсутствует в карте (UI рисует
 * пустое поле).
 */
export function plansToPricing(plans: AdminPromotionPlan[]): PromoPricing {
  const out: PromoPricing = { TOP: {}, VIP: {} };
  for (const p of plans) {
    out[p.type][p.period_days] = Number(p.price);
  }
  return out;
}

/** Индекс планов по `(type, days)` — для адресации PATCH по `plan.id`. */
export function plansToIndex(plans: AdminPromotionPlan[]): PromoPlanIndex {
  const out: PromoPlanIndex = { TOP: {}, VIP: {} };
  for (const p of plans) {
    out[p.type][p.period_days] = p;
  }
  return out;
}

/** Достаёт план по паре `(type, days)` из индекса, либо `undefined`. */
export function findPlan(
  index: PromoPlanIndex,
  type: PromoPlanType,
  days: number,
): AdminPromotionPlan | undefined {
  return index[type][days];
}
