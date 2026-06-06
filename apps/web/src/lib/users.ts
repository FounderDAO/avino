/**
 * Хелперы пользователей (ADMIN-11/12).
 *
 * Порядок статусов/ролей, badge/intent-классы и правила «нужна ли причина».
 * Текстовые подписи статусов/ролей/языков вынесены в i18n (`lib/i18n/enums.ts`,
 * `roleLabel`/`languageLabel`, ADMIN-17). Значения статусов/ролей/языков — часть
 * API-контракта (DB_SCHEMA §3 / API.md §6).
 */

import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type { SerializedError } from '@reduxjs/toolkit';

import type { UserStatus } from '@/store/api/authApi';
import type { RoleCode } from '@/store/api/adminTypes';
import { getApiError } from '@/store/api/apiError';
import { translate } from '@/lib/i18n/t';
import type { Locale } from '@/lib/i18n/config';

/** Все статусы пользователя в порядке жизненного цикла (API.md §6). */
export const USER_STATUSES: UserStatus[] = ['ACTIVE', 'BLOCKED', 'DELETED'];

/**
 * Tailwind-классы badge статуса (TailAdmin-палитра): ACTIVE — success,
 * BLOCKED — warning, DELETED — error.
 */
export const USER_STATUS_BADGE: Record<UserStatus, string> = {
  ACTIVE:
    'bg-success-50 text-success-600 dark:bg-success-500/[0.15] dark:text-success-500',
  BLOCKED:
    'bg-warning-50 text-warning-600 dark:bg-warning-500/[0.15] dark:text-warning-500',
  DELETED:
    'bg-error-50 text-error-600 dark:bg-error-500/[0.15] dark:text-error-500',
};

/** Все коды ролей по возрастанию привилегий (seeded dictionary, без GUEST). */
export const ROLE_CODES: RoleCode[] = [
  'USER',
  'OWNER',
  'AGENT',
  'AGENCY',
  'LANDLORD',
  'PROPERTY_MANAGER',
  'MODERATOR',
  'ADMIN',
];

// ─── Управление статусом и ролями (ADMIN-12, API.md §6) ──────────────────────

/** Tailwind-классы кнопки перехода (intent-палитра TailAdmin, как в модерации). */
export const USER_STATUS_INTENT: Record<UserStatus, string> = {
  ACTIVE:
    'bg-success-500 text-white hover:bg-success-600 disabled:bg-success-500/40',
  BLOCKED:
    'bg-warning-500 text-white hover:bg-warning-600 disabled:bg-warning-500/40',
  DELETED:
    'bg-error-500 text-white hover:bg-error-600 disabled:bg-error-500/40',
};

/**
 * Требуется ли причина при переходе. Блокировка/удаление — деструктивные
 * действия, причину просим обязательно (попадает в аудит); активация
 * (восстановление) — без причины. Бэкенд `reason` принимает опционально для
 * всех — это UX-правило фронта.
 */
export const USER_STATUS_REQUIRES_REASON: Record<UserStatus, boolean> = {
  ACTIVE: false,
  BLOCKED: true,
  DELETED: true,
};

/** Локализованное сообщение по стабильному `error.code` мутаций пользователя (§6/§17). */
export function userActionErrorMessage(
  error: FetchBaseQueryError | SerializedError | undefined,
  locale: Locale,
): string {
  const code = getApiError(error)?.code;
  switch (code) {
    case 'ROLE_ALREADY_GRANTED':
      return translate(locale, 'errors.users.ROLE_ALREADY_GRANTED');
    case 'VALIDATION_ERROR':
      return translate(locale, 'errors.validationAction');
    case 'NOT_FOUND':
      return translate(locale, 'errors.users.NOT_FOUND');
    case 'FORBIDDEN':
      return translate(locale, 'errors.forbidden');
    default:
      return translate(locale, 'errors.users.generic');
  }
}
