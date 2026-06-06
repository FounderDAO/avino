/**
 * RU-подписи для enum-значений админ-панели (MVP RU-only, i18n — ADMIN-17).
 *
 * Источник значений — `store/api/adminTypes.ts` (зеркало DB_SCHEMA §3). Подписи
 * и badge-классы переиспользуются страницами модерации/жалоб/пользователей
 * (ADMIN-08..12), поэтому держим их в одном месте, а не в каждой странице.
 */

import type {
  ListingStatus,
  PropertyType,
  TransactionType,
} from '@/store/api/adminTypes';

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  NEW: 'На модерации',
  ACTIVE: 'Активно',
  DRAFT: 'Черновик',
  REJECTED: 'Отклонено',
  DELETED: 'Удалено',
  ARCHIVED: 'В архиве',
  SOLD: 'Продано',
  RENTED: 'Сдано',
};

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  APARTMENT: 'Квартира',
  HOUSE: 'Дом',
  NEW_BUILDING: 'Новостройка',
  LAND: 'Участок',
  COMMERCIAL: 'Коммерческая',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  SALE: 'Продажа',
  RENT: 'Аренда',
};

/**
 * Tailwind-классы badge статуса (TailAdmin-палитра). Дефолт — серый, чтобы
 * новый статус не ломал рендер до добавления своего цвета.
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
