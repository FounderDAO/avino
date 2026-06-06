/**
 * RU-подписи и badge-классы для журналов админ-панели (ADMIN-14, MVP RU-only,
 * i18n — ADMIN-17). Источник значений enum — `store/api/adminTypes.ts` (зеркало
 * DB_SCHEMA §3). Подписи действий модерации (`MODERATION_ACTION_LABELS`) и тиров
 * промо (`PROMOTION_TYPE_LABELS`/`PROMOTION_TYPE_BADGE`) переиспользуются из
 * существующих хелперов, чтобы один справочник не разъезжался между страницами.
 */

import type {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  PromotionAdminAction,
} from '@/store/api/adminTypes';

/** Вкладки журнала (ADMIN-14: 4 журнала под `/admin/logs`). */
export type LogTab = 'audit' | 'moderation' | 'promotion' | 'notification';

export const LOG_TABS: { key: LogTab; label: string }[] = [
  { key: 'audit', label: 'Аудит' },
  { key: 'moderation', label: 'Модерация' },
  { key: 'promotion', label: 'Промо' },
  { key: 'notification', label: 'Уведомления' },
];

/** Действия администратора над промо (`promotion_logs`, §16). */
export const PROMOTION_ADMIN_ACTION_LABELS: Record<
  PromotionAdminAction,
  string
> = {
  ACTIVATE_VIP: 'Активация VIP',
  ACTIVATE_TOP: 'Активация TOP',
  CANCEL_PROMOTION: 'Отмена промо',
  EXTEND_PROMOTION: 'Продление промо',
};

/** Тип уведомления (`notifications.type`, §11/§16). */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  SAVED_SEARCH_NEW_LISTING: 'Новое по сохранённому поиску',
  FAVORITE_PRICE_DROP: 'Снижение цены в избранном',
  NEW_CHAT_MESSAGE: 'Новое сообщение в чате',
  LISTING_MODERATION_STATUS_CHANGED: 'Смена статуса модерации',
  NEW_LEAD: 'Новый лид',
  PROMOTION_ACTIVATED: 'Промо активировано',
  PROMOTION_EXPIRED: 'Промо истекло',
};

/** Канал доставки уведомления (`notifications.channel`, §11). */
export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  EMAIL: 'Email',
  PUSH: 'Push',
  IN_APP: 'В приложении',
};

/** Статус доставки уведомления (`notifications.status`, §11). */
export const NOTIFICATION_STATUS_LABELS: Record<NotificationStatus, string> = {
  PENDING: 'В очереди',
  SENT: 'Отправлено',
  FAILED: 'Ошибка',
  READ: 'Прочитано',
};

/**
 * Tailwind-классы badge статуса уведомления (TailAdmin-палитра): SENT/READ —
 * success, PENDING — warning, FAILED — error.
 */
export const NOTIFICATION_STATUS_BADGE: Record<NotificationStatus, string> = {
  PENDING:
    'bg-warning-50 text-warning-600 dark:bg-warning-500/[0.15] dark:text-warning-500',
  SENT: 'bg-success-50 text-success-600 dark:bg-success-500/[0.15] dark:text-success-500',
  FAILED:
    'bg-error-50 text-error-600 dark:bg-error-500/[0.15] dark:text-error-500',
  READ: 'bg-brand-50 text-brand-600 dark:bg-brand-500/[0.15] dark:text-brand-400',
};
