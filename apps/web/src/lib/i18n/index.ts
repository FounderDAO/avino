/**
 * i18n админ-панели (ADMIN-17) — публичный barrel.
 *
 * Использование в компонентах:
 *   const { t, locale, setLocale } = useT();
 *   const enums = useEnumLabels();           // локализованные enum-подписи
 *   t('login.title')                          // строка интерфейса
 *   t('login.codeHint', { email })            // с интерполяцией
 */

export { LOCALES, DEFAULT_LOCALE, LOCALE_META, isLocale } from './config';
export type { Locale } from './config';
export { LanguageProvider, useT } from './LanguageProvider';
export {
  getEnumLabels,
  useEnumLabels,
  roleLabel,
  languageLabel,
  type EnumLabels,
} from './enums';
export { translate, type TVars } from './t';
