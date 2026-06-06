/**
 * Хелперы пользователей (ADMIN-11/12).
 *
 * RU-подписи и badge-классы статусов пользователя, RU-подписи кодов ролей и
 * языков. Значения статусов/ролей/языков — часть API-контракта (DB_SCHEMA §3 /
 * API.md §6). Подписи держим в одном месте, чтобы список (ADMIN-11) и будущее
 * управление статусом/ролями (ADMIN-12) использовали общий словарь. RU-only
 * (i18n — ADMIN-17).
 */

import type { Language, UserStatus } from '@/store/api/authApi';
import type { RoleCode } from '@/store/api/adminTypes';

/** Все статусы пользователя в порядке жизненного цикла (API.md §6). */
export const USER_STATUSES: UserStatus[] = ['ACTIVE', 'BLOCKED', 'DELETED'];

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Активен',
  BLOCKED: 'Заблокирован',
  DELETED: 'Удалён',
};

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

export const ROLE_LABELS: Record<RoleCode, string> = {
  USER: 'Пользователь',
  OWNER: 'Собственник',
  AGENT: 'Агент',
  AGENCY: 'Агентство',
  LANDLORD: 'Арендодатель',
  PROPERTY_MANAGER: 'Управляющий',
  MODERATOR: 'Модератор',
  ADMIN: 'Администратор',
};

/** RU-подпись роли по коду (неизвестный код → сам код, чтобы не падать). */
export function roleLabel(code: string): string {
  return ROLE_LABELS[code as RoleCode] ?? code;
}

export const LANGUAGE_LABELS: Record<Language, string> = {
  UZ: 'Узбекский',
  RU: 'Русский',
  EN: 'Английский',
};

/** RU-подпись языка (nullable → «—»). */
export function languageLabel(lang: Language | null | undefined): string {
  if (!lang) return '—';
  return LANGUAGE_LABELS[lang] ?? lang;
}
