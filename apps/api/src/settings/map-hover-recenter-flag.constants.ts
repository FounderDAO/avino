/** Ключ runtime-настройки в app_settings для тоггла центрирования карты при наведении. */
export const MAP_HOVER_RECENTER_KEY = 'map_hover_recenter';

/**
 * Резолюция флага центрирования карты: значение из app_settings (если
 * 'true'/'false') главнее; иначе — env-дефолт (`mapHoverRecenter.enabled` из
 * configuration.ts, default false). Чистая функция — шарится между
 * MapHoverRecenterFlagService и тестами. Зеркалит {@link resolvePromotionsEnabled}.
 */
export function resolveMapHoverRecenter(
  stored: string | null | undefined,
  envDefault: boolean,
): boolean {
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return envDefault;
}
