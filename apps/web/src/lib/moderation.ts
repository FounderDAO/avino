/**
 * Хелперы модерации листингов (ADMIN-09).
 *
 * Подписи действий, цвет кнопок (TailAdmin) и правила доступности перехода —
 * зеркало бэкенда (`apps/api/src/moderation/moderation.service.ts`):
 * `ACTION_TO_STATUS` + `MODERATABLE_STATUSES`. Фронт гейтит недопустимые
 * действия заранее (UX), но `422 INVALID_STATUS_TRANSITION` всё равно
 * обрабатывается как fallback. RU-only (i18n — ADMIN-17).
 */

import type {
  ListingStatus,
  ModerationAction,
} from '@/store/api/adminTypes';
import { getApiError } from '@/store/api/apiError';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type { SerializedError } from '@reduxjs/toolkit';
import { translate } from '@/lib/i18n/t';
import type { Locale } from '@/lib/i18n/config';

/** Целевой статус для каждого действия (API.md §16). */
export const ACTION_TO_STATUS: Record<ModerationAction, ListingStatus> = {
  APPROVE: 'ACTIVE',
  SEND_TO_DRAFT: 'DRAFT',
  REJECT: 'REJECTED',
  DELETE: 'DELETED',
};

/** Статусы, над которыми модерация имеет смысл (бэкенд `MODERATABLE_STATUSES`). */
const MODERATABLE_STATUSES: readonly ListingStatus[] = [
  'NEW',
  'ACTIVE',
  'DRAFT',
  'REJECTED',
];

/** Порядок кнопок в карточке. */
export const MODERATION_ACTIONS: ModerationAction[] = [
  'APPROVE',
  'SEND_TO_DRAFT',
  'REJECT',
  'DELETE',
];

/** Tailwind-классы кнопки действия (intent-палитра TailAdmin). */
export const MODERATION_ACTION_INTENT: Record<ModerationAction, string> = {
  APPROVE:
    'bg-success-500 text-white hover:bg-success-600 disabled:bg-success-500/40',
  SEND_TO_DRAFT:
    'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600',
  REJECT:
    'bg-warning-500 text-white hover:bg-warning-600 disabled:bg-warning-500/40',
  DELETE:
    'bg-error-500 text-white hover:bg-error-600 disabled:bg-error-500/40',
};

/** Какие действия требуют причину (reason) в диалоге. */
export const ACTION_REQUIRES_REASON: Record<ModerationAction, boolean> = {
  APPROVE: false,
  SEND_TO_DRAFT: false,
  REJECT: true,
  DELETE: false,
};

/**
 * Допустимо ли действие для текущего статуса (зеркало бэкенда): статус должен
 * быть модерируемым и целевой статус не равен текущему.
 */
export function canApplyAction(
  action: ModerationAction,
  status: ListingStatus,
): boolean {
  return (
    MODERATABLE_STATUSES.includes(status) && ACTION_TO_STATUS[action] !== status
  );
}

/** Локализованное сообщение по ошибке мутации модерации (по `error.code`). */
export function moderationErrorMessage(
  error: FetchBaseQueryError | SerializedError | undefined,
  locale: Locale,
): string {
  const code = getApiError(error)?.code;
  switch (code) {
    case 'INVALID_STATUS_TRANSITION':
      return translate(locale, 'errors.moderation.INVALID_STATUS_TRANSITION');
    case 'FORBIDDEN':
      return translate(locale, 'errors.forbidden');
    case 'NOT_FOUND':
      return translate(locale, 'errors.moderation.NOT_FOUND');
    case 'VALIDATION_ERROR':
      return translate(locale, 'errors.validationAction');
    default:
      return translate(locale, 'errors.moderation.generic');
  }
}
