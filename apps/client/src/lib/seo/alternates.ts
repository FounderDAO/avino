/**
 * SEO-хелпер: генерирует alternates (canonical + hreflang) для любого пути.
 *
 * Используется во всех generateMetadata для поддержки hreflang uz/ru/en + x-default.
 * Путь НЕ должен содержать locale-префикс — он добавляется автоматически.
 *
 * @example
 *   alternatesFor('/listing/abc-123')
 *   // → { canonical: 'https://avino.uz/ru/listing/abc-123', languages: { uz: '...', ru: '...', en: '...', 'x-default': '...' } }
 */
import { routing } from '@/i18n/routing';
import { BASE } from './base';

export function alternatesFor(path: string) {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    languages[locale] = `${BASE}/${locale}${path}`;
  }
  // x-default → язык по умолчанию (ru)
  languages['x-default'] = `${BASE}/${routing.defaultLocale}${path}`;

  return {
    canonical: `${BASE}/${routing.defaultLocale}${path}`,
    languages,
  };
}
