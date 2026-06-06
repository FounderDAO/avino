/**
 * Badge-классы для enum-значений листингов (TailAdmin-палитра).
 *
 * Источник значений — `store/api/adminTypes.ts` (зеркало DB_SCHEMA §3). Текстовые
 * подписи статусов/типов вынесены в i18n (`lib/i18n/enums.ts`, ADMIN-17) — здесь
 * остаются только CSS-классы badge, не зависящие от языка.
 */

import type { ListingStatus } from '@/store/api/adminTypes';

/**
 * Tailwind-классы badge статуса. Дефолт — серый, чтобы новый статус не ломал
 * рендер до добавления своего цвета.
 */
export const LISTING_STATUS_BADGE: Record<ListingStatus, string> = {
  NEW: 'bg-warning-50 text-warning-600 dark:bg-warning-500/[0.15] dark:text-warning-500',
  ACTIVE: 'bg-success-50 text-success-600 dark:bg-success-500/[0.15] dark:text-success-500',
  DRAFT: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300',
  REJECTED: 'bg-error-50 text-error-600 dark:bg-error-500/[0.15] dark:text-error-500',
  DELETED: 'bg-error-50 text-error-600 dark:bg-error-500/[0.15] dark:text-error-500',
  ARCHIVED: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300',
  SOLD: 'bg-brand-50 text-brand-600 dark:bg-brand-500/[0.15] dark:text-brand-400',
  RENTED: 'bg-brand-50 text-brand-600 dark:bg-brand-500/[0.15] dark:text-brand-400',
};
