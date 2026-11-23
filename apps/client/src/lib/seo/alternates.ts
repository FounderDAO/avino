/**
 * SEO-хелпер: генерирует alternates (canonical + hreflang) для любого пути.
 *
 * Canonical указывает на версию страницы в её СОБСТВЕННОЙ локали: у /uz/… и /en/…
 * свои тексты (интерфейс + машинный перевод описаний), поэтому каждая языковая
 * версия индексируется отдельно. Раньше canonical всегда вёл на /ru/…, и Google
 * считал uz/en копиями русской версии — hreflang при этом не работал.
 *
 * Путь НЕ должен содержать locale-префикс — он добавляется автоматически.
 * Главная ('/' или '') даёт адрес без завершающего слэша: /ru, а не /ru/
 * (сервер перенаправляет /ru/ → /ru, canonical должен указывать на конечный адрес).
 *
 * @example
 *   alternatesFor('/listing/abc-123', 'uz')
 *   // → { canonical: 'https://avino.uz/uz/listing/abc-123',
 *   //     languages: { uz: '…/uz/listing/abc-123', ru: '…', en: '…', 'x-default': '…/ru/listing/abc-123' } }
 */
import { routing } from '@/i18n/routing';
import { BASE } from './base';

/** '/' и '' → ''; остальные пути — как есть, без завершающего слэша. */
export function normalizePath(path: string): string {
  if (path === '/' || path === '') return '';
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

/** Абсолютный адрес страницы в локали: localeUrl('uz', '/') → https://avino.uz/uz */
export function localeUrl(locale: string, path: string): string {
  return `${BASE}/${locale}${normalizePath(path)}`;
}

export function hreflangLanguages(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = localeUrl(l, path);
  }
  // x-default → язык по умолчанию (ru)
  languages['x-default'] = localeUrl(routing.defaultLocale, path);
  return languages;
}

export function alternatesFor(path: string, locale: string) {
  return {
    canonical: localeUrl(locale, path),
    languages: hreflangLanguages(path),
  };
}
