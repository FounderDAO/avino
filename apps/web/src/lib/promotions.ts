/**
 * Хелперы промо VIP/TOP (ADMIN-13).
 *
 * RU-подписи и badge-классы тиров/статусов промо, допустимые периоды, зеркало
 * каталога цен (для отображения стоимости тарифа на клиенте) и маппинг ошибок
 * мутаций по стабильному `error.code`. Значения enum — часть API-контракта
 * (DB_SCHEMA §3 / API.md §15). Цены — зеркало `promotions.catalog.ts` на
 * бэкенде (source of truth там; здесь только для UX-превью). RU-only (i18n —
 * ADMIN-17).
 */

import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type { SerializedError } from '@reduxjs/toolkit';

import type {
  ActivatablePromotionType,
  Currency,
  ListingPromotion,
  PromotionPeriodDays,
  PromotionStatus,
  PromotionType,
} from '@/store/api/adminTypes';
import { getApiError } from '@/store/api/apiError';
import { formatPrice } from './format';

/** Тиры, которые админ может активировать вручную (без `NORMAL` = «нет промо»). */
export const ACTIVATABLE_TYPES: ActivatablePromotionType[] = ['TOP', 'VIP'];

/** Допустимые периоды промо (§15, DB-чек `period_days IN (7,14,30)`). */
export const PROMOTION_PERIODS: PromotionPeriodDays[] = [7, 14, 30];

export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  NORMAL: 'Без промо',
  TOP: 'TOP',
  VIP: 'VIP',
};

export const PROMOTION_STATUS_LABELS: Record<PromotionStatus, string> = {
  PENDING_PAYMENT: 'Ожидает оплаты',
  ACTIVE: 'Активна',
  EXPIRED: 'Истекла',
  CANCELLED: 'Отменена',
  REFUNDED: 'Возврат',
};

/** Tailwind-классы badge статуса промо (TailAdmin-палитра). */
export const PROMOTION_STATUS_BADGE: Record<PromotionStatus, string> = {
  PENDING_PAYMENT:
    'bg-warning-50 text-warning-600 dark:bg-warning-500/[0.15] dark:text-warning-500',
  ACTIVE:
    'bg-success-50 text-success-600 dark:bg-success-500/[0.15] dark:text-success-500',
  EXPIRED: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300',
  CANCELLED:
    'bg-error-50 text-error-600 dark:bg-error-500/[0.15] dark:text-error-500',
  REFUNDED: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300',
};

/** Tailwind-классы badge тира промо (VIP — бренд, TOP — «золотой» warning, NORMAL — серый). */
export const PROMOTION_TYPE_BADGE: Record<PromotionType, string> = {
  NORMAL: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300',
  TOP: 'bg-warning-50 text-warning-600 dark:bg-warning-500/[0.15] dark:text-warning-500',
  VIP: 'bg-brand-50 text-brand-600 dark:bg-brand-500/[0.15] dark:text-brand-400',
};

/**
 * Зеркало каталога планов (`apps/api/src/promotions/promotions.catalog.ts`).
 * Source of truth — на бэкенде; здесь только для превью цены в UI активации.
 * Цены — строки-Decimal (UZS), чтобы не терять точность (ADR-002).
 */
interface PromotionPlanPreview {
  type: ActivatablePromotionType;
  period_days: PromotionPeriodDays;
  price: string;
  currency: Currency;
}

const PROMOTION_PLANS: readonly PromotionPlanPreview[] = [
  { type: 'TOP', period_days: 7, price: '50000.00', currency: 'UZS' },
  { type: 'TOP', period_days: 14, price: '90000.00', currency: 'UZS' },
  { type: 'TOP', period_days: 30, price: '150000.00', currency: 'UZS' },
  { type: 'VIP', period_days: 7, price: '120000.00', currency: 'UZS' },
  { type: 'VIP', period_days: 14, price: '210000.00', currency: 'UZS' },
  { type: 'VIP', period_days: 30, price: '350000.00', currency: 'UZS' },
];

/** Цена плана для превью (`"120 000 UZS"`), либо `null` если плана нет в каталоге. */
export function planPriceLabel(
  type: ActivatablePromotionType,
  periodDays: PromotionPeriodDays,
): string | null {
  const plan = PROMOTION_PLANS.find(
    (p) => p.type === type && p.period_days === periodDays,
  );
  return plan ? formatPrice(plan.price, plan.currency) : null;
}

/** RU-подпись периода (`«7 дней»`, с правильным числительным). */
export function periodLabel(days: number): string {
  const plural =
    days % 10 === 1 && days % 100 !== 11
      ? 'день'
      : [2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100)
        ? 'дня'
        : 'дней';
  return `${days} ${plural}`;
}

/** Активная промо листинга из истории ledger (или `null`). */
export function findActivePromotion(
  promotions: ListingPromotion[] | undefined,
): ListingPromotion | null {
  return promotions?.find((p) => p.status === 'ACTIVE') ?? null;
}

/**
 * Свежий idempotency-ключ для активации (§15/§24). UUID на попытку: повтор того
 * же запроса с тем же ключом не создаёт дубль (защита от двойного клика/ретрая).
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** RU-сообщения по стабильному `error.code` мутаций промо (§15/§17). */
const PROMOTION_ERROR_MESSAGES: Record<string, string> = {
  ACTIVE_PROMOTION_EXISTS: 'У объявления уже есть активная промо.',
  INVALID_PERIOD: 'Недопустимый период. Выберите 7, 14 или 30 дней.',
  PROMOTION_NOT_ACTIVE: 'Промо не активна — действие недоступно.',
  NOT_FOUND: 'Объявление или промо не найдены.',
  FORBIDDEN: 'Недостаточно прав для этого действия.',
  VALIDATION_ERROR: 'Проверьте корректность данных действия.',
};

/** RU-сообщение по ошибке мутации промо (по стабильному `error.code`). */
export function promotionErrorMessage(
  error: FetchBaseQueryError | SerializedError | undefined,
): string {
  const code = getApiError(error)?.code;
  return (
    (code && PROMOTION_ERROR_MESSAGES[code]) ??
    'Не удалось выполнить действие. Попробуйте ещё раз.'
  );
}
