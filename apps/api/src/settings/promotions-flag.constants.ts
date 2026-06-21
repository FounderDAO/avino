/** Ключ runtime-настройки в app_settings для тоггла доступности продвижения. */
export const PROMOTIONS_ENABLED_KEY = 'promotions_enabled';

/**
 * Резолюция флага продвижения: значение из app_settings (если 'true'/'false')
 * главнее; иначе — env-дефолт (`promotion.enabled` из configuration.ts, default
 * false). Чистая функция — шарится между PromotionsFlagService и тестами.
 * Зеркалит {@link resolveSmsEnabled}.
 */
export function resolvePromotionsEnabled(
  stored: string | null | undefined,
  envDefault: boolean,
): boolean {
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return envDefault;
}
