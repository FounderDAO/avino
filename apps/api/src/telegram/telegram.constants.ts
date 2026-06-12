/** Ключ runtime-настройки в app_settings для master-тоггла Telegram-алертов. */
export const TELEGRAM_NOTIFICATIONS_ENABLED_KEY = 'telegram_notifications_enabled';

/**
 * Резолюция master-флага: значение из app_settings (если 'true'/'false')
 * главнее; иначе — env-дефолт (dev=true / prod=false из configuration.ts).
 * Чистая функция — шарится между TelegramService и AdminTelegramSettingsService.
 */
export function resolveNotificationsEnabled(
  stored: string | null | undefined,
  envDefault: boolean,
): boolean {
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return envDefault;
}
