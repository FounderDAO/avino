/**
 * Хелперы жалоб (ADMIN-10).
 *
 * Подписи статусов, badge-классы (TailAdmin), порядок статусов и RU-сообщения
 * ошибок смены статуса. Значения статусов — часть API-контракта (DB_SCHEMA §3 /
 * API.md §16). В отличие от модерации листингов (`lib/moderation.ts`), у жалоб
 * нет ограничений переходов в контракте — допустим любой статус, кроме текущего
 * (no-op гейтится в UI). RU-only (i18n — ADMIN-17).
 */

import type { ComplaintStatus } from '@/store/api/adminTypes';
import { getApiError } from '@/store/api/apiError';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type { SerializedError } from '@reduxjs/toolkit';

/** Все статусы жалобы в порядке жизненного цикла (API.md §16). */
export const COMPLAINT_STATUSES: ComplaintStatus[] = [
  'NEW',
  'IN_REVIEW',
  'RESOLVED',
  'REJECTED',
];

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  NEW: 'Новая',
  IN_REVIEW: 'В работе',
  RESOLVED: 'Решена',
  REJECTED: 'Отклонена',
};

/**
 * Tailwind-классы badge статуса (TailAdmin-палитра): NEW — warning (требует
 * внимания), IN_REVIEW — brand (в работе), RESOLVED — success, REJECTED — gray
 * (отклонена/дисмис, не ошибка).
 */
export const COMPLAINT_STATUS_BADGE: Record<ComplaintStatus, string> = {
  NEW: 'bg-warning-50 text-warning-600 dark:bg-warning-500/[0.15] dark:text-warning-500',
  IN_REVIEW:
    'bg-brand-50 text-brand-600 dark:bg-brand-500/[0.15] dark:text-brand-400',
  RESOLVED:
    'bg-success-50 text-success-600 dark:bg-success-500/[0.15] dark:text-success-500',
  REJECTED: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300',
};

const COMPLAINT_ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: 'Недостаточно прав для этого действия.',
  NOT_FOUND: 'Жалоба не найдена.',
  VALIDATION_ERROR: 'Проверьте корректность статуса.',
};

/** RU-сообщение по ошибке смены статуса жалобы (по стабильному `error.code`). */
export function complaintErrorMessage(
  error: FetchBaseQueryError | SerializedError | undefined,
): string {
  const code = getApiError(error)?.code;
  return (
    (code && COMPLAINT_ERROR_MESSAGES[code]) ??
    'Не удалось обновить статус. Попробуйте ещё раз.'
  );
}
