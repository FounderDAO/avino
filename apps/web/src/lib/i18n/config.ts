/**
 * i18n админ-панели (ADMIN-17) — конфигурация локалей.
 *
 * Лёгкий кастомный i18n (CLAUDE.md §3: `t("key", lang)`): без `[locale]`-роутинга
 * и внешних зависимостей. Язык хранится в localStorage, по умолчанию RU (админка
 * была RU-only до этой задачи). Язык объявлений (`Language` в API) — отдельная
 * сущность; здесь речь только про язык интерфейса админки.
 */

export const LOCALES = ['ru', 'uz', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

/** Язык интерфейса по умолчанию (сохраняем прежнее RU-поведение админки). */
export const DEFAULT_LOCALE: Locale = 'ru';

/** Ключ localStorage для выбранного языка интерфейса админки. */
export const LOCALE_STORAGE_KEY = 'avino_admin_lang';

/** Метаданные локали для свитчера и форматирования. */
export const LOCALE_META: Record<
  Locale,
  { flag: string; native: string; bcp47: string }
> = {
  ru: { flag: '🇷🇺', native: 'Русский', bcp47: 'ru-RU' },
  uz: { flag: '🇺🇿', native: "O'zbek", bcp47: 'uz-UZ' },
  en: { flag: '🇬🇧', native: 'English', bcp47: 'en-US' },
};

/** Type guard: значение — поддерживаемая локаль. */
export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
  );
}
