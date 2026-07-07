/** Ключ runtime-настройки в app_settings для лимита активных объявлений клиента. */
export const ACTIVE_LISTING_LIMIT_KEY = 'active_listing_limit';

/** Разумный верхний предел значения (защита от опечатки в админке). */
export const ACTIVE_LISTING_LIMIT_MAX = 1000;

/**
 * Резолюция лимита активных объявлений: значение из app_settings (если это
 * целое ≥ 0) главнее; иначе — env-дефолт (`activeListingLimit.default` из
 * configuration.ts, default 2). Чистая функция — шарится между
 * ActiveListingLimitService и тестами. Зеркалит {@link resolvePromotionsEnabled}.
 *
 * Значение `0` означает «без лимита» (админ снял ограничение) — это валидное
 * сохранённое значение, поэтому проверяем именно на конечное целое ≥ 0.
 */
export function resolveActiveListingLimit(
  stored: string | null | undefined,
  envDefault: number,
): number {
  if (stored != null && stored.trim() !== '') {
    const n = Number(stored);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return envDefault;
}
