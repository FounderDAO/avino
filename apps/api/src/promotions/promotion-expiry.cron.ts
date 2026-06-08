/** Ключ настройки интервала истечения промо в app_settings. */
export const PROMOTION_EXPIRY_CRON_KEY = 'promotion_expiry_cron';

/** Допустимые пресеты интервала (часы) → cron-паттерн. */
export const EXPIRY_PRESET_CRON: Record<6 | 12, string> = {
  6: '0 */6 * * *',
  12: '0 */12 * * *',
};

/** cron → часы для UI; неизвестный паттерн → 12 (ближайший дефолт). */
export function cronToHours(cron: string): 6 | 12 {
  return cron === EXPIRY_PRESET_CRON[6] ? 6 : 12;
}
