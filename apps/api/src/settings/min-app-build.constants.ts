/** Ключи runtime-настроек в app_settings: минимальная допустимая сборка приложения. */
export const MIN_APP_BUILD_IOS_KEY = 'min_app_build_ios';
export const MIN_APP_BUILD_ANDROID_KEY = 'min_app_build_android';

/** Разумный верхний предел значения (защита от опечатки в админке). */
export const MIN_APP_BUILD_MAX = 1_000_000;

/**
 * Резолюция минимальной сборки: значение из app_settings (если это целое
 * в диапазоне 0..MIN_APP_BUILD_MAX) главнее; иначе — дефолт (`0`). Чистая
 * функция — шарится между MinAppBuildService и тестами. Зеркалит
 * {@link resolveActiveListingLimit}.
 *
 * Значение `0` означает «обновление не требуется» — это дефолт, чтобы мусор
 * в БД никогда не заблокировал пользователей.
 */
export function resolveMinAppBuild(
  stored: string | null | undefined,
  envDefault = 0,
): number {
  if (stored != null && stored.trim() !== '') {
    const n = Number(stored);
    if (Number.isInteger(n) && n >= 0 && n <= MIN_APP_BUILD_MAX) return n;
  }
  return envDefault;
}
