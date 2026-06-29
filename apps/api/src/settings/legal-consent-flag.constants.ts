/** Ключи runtime-настроек согласия с юр-документами в app_settings. */
export const LEGAL_CONSENT_REQUIRED_KEY = 'legal_consent_required';
export const LEGAL_CONSENT_VERSION_KEY = 'legal_consent_version';

/**
 * Резолюция флага «требовать согласие»: app_settings ('true'/'false') главнее,
 * иначе env-дефолт (`legalConsent.required`, default false). Чистая функция —
 * шарится между сервисом и тестами. Зеркалит resolvePromotionsEnabled.
 */
export function resolveLegalConsentRequired(
  stored: string | null | undefined,
  envDefault: boolean,
): boolean {
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return envDefault;
}

/**
 * Резолюция текущей версии документов: app_settings (целое >= 1) главнее, иначе
 * env-дефолт (`legalConsent.version`, default 1). Нечисловые/нелегальные строки
 * → env-дефолт.
 */
export function resolveLegalConsentVersion(
  stored: string | null | undefined,
  envDefault: number,
): number {
  if (stored != null) {
    const n = Number(stored);
    if (Number.isInteger(n) && n >= 1) return n;
  }
  return envDefault;
}
