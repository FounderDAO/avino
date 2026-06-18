/** Ключ runtime-настройки в app_settings для master-тоггла отправки SMS. */
export const SMS_ENABLED_KEY = 'sms_enabled';

/**
 * Резолюция master-флага SMS: значение из app_settings (если 'true'/'false')
 * главнее; иначе — env-дефолт (`sms.enabled` из configuration.ts, по умолчанию
 * true). Чистая функция — шарится между SmsService и AdminSmsSettingsService.
 * Зеркалит {@link resolveNotificationsEnabled} из telegram.constants.
 */
export function resolveSmsEnabled(
  stored: string | null | undefined,
  envDefault: boolean,
): boolean {
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return envDefault;
}
