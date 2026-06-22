/** Ключ runtime-настройки в app_settings для master-тоггла email-уведомлений. */
export const NOTIFICATION_EMAIL_ENABLED_KEY = 'email_notifications_enabled';

/** Ключ runtime-настройки в app_settings для master-тоггла push-уведомлений. */
export const NOTIFICATION_PUSH_ENABLED_KEY = 'push_notifications_enabled';

/**
 * Резолюция master-флага канала уведомлений: значение из app_settings
 * (если 'true'/'false') главнее; иначе — env-дефолт (`notifications.emailEnabled`
 * / `notifications.pushEnabled` из configuration.ts, по умолчанию true). Чистая
 * функция — шарится между NotificationDispatcherService и
 * AdminNotificationSettingsService. Зеркалит {@link resolveSmsEnabled} из
 * sms.constants.
 */
export function resolveNotificationChannelEnabled(
  stored: string | null | undefined,
  envDefault: boolean,
): boolean {
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return envDefault;
}
