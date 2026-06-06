/**
 * Журналы админ-панели (ADMIN-14) — ключи вкладок и badge-классы.
 *
 * Текстовые подписи действий/типов/каналов/статусов уведомлений вынесены в i18n
 * (`lib/i18n/enums.ts`, ADMIN-17); подписи вкладок — в namespace `logs.tabs`.
 * Здесь остаются ключи вкладок (порядок) и badge-классы (CSS, не текст).
 * Источник значений enum — `store/api/adminTypes.ts` (зеркало DB_SCHEMA §3).
 */

import type { NotificationStatus } from '@/store/api/adminTypes';

/** Вкладки журнала (ADMIN-14: 4 журнала под `/admin/logs`). */
export type LogTab = 'audit' | 'moderation' | 'promotion' | 'notification';

/** Ключи вкладок в порядке отображения; подписи — `t('logs.tabs.<key>')`. */
export const LOG_TAB_KEYS: LogTab[] = [
  'audit',
  'moderation',
  'promotion',
  'notification',
];

/**
 * Tailwind-классы badge статуса уведомления (TailAdmin-палитра): SENT/READ —
 * success/brand, PENDING — warning, FAILED — error.
 */
export const NOTIFICATION_STATUS_BADGE: Record<NotificationStatus, string> = {
  PENDING:
    'bg-warning-50 text-warning-600 dark:bg-warning-500/[0.15] dark:text-warning-500',
  SENT: 'bg-success-50 text-success-600 dark:bg-success-500/[0.15] dark:text-success-500',
  FAILED:
    'bg-error-50 text-error-600 dark:bg-error-500/[0.15] dark:text-error-500',
  READ: 'bg-brand-50 text-brand-600 dark:bg-brand-500/[0.15] dark:text-brand-400',
};
