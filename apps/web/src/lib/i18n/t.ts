/**
 * i18n админ-панели (ADMIN-17) — резолвер строк `t(key, locale, vars?)`.
 *
 * Ключи — точечные пути (`'login.title'`) по вложенному словарю локали. Если
 * ключ не найден в выбранной локали — фоллбэк на DEFAULT_LOCALE, затем сам ключ
 * (чтобы UI не падал на отсутствующем переводе). Интерполяция — `{name}`.
 */

import { DEFAULT_LOCALE, type Locale } from './config';
import { messages } from './messages';

export type TVars = Record<string, string | number>;

function lookup(dict: unknown, path: readonly string[]): string | undefined {
  let cur: unknown = dict;
  for (const segment of path) {
    if (cur && typeof cur === 'object' && segment in (cur as object)) {
      cur = (cur as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** Перевести ключ для локали с фоллбэком на DEFAULT_LOCALE и сам ключ. */
export function translate(locale: Locale, key: string, vars?: TVars): string {
  const path = key.split('.');
  const found =
    lookup(messages[locale], path) ?? lookup(messages[DEFAULT_LOCALE], path);
  if (found === undefined) return key;
  return interpolate(found, vars);
}
