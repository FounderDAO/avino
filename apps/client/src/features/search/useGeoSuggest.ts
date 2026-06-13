'use client';

/**
 * useGeoSuggest — подсказки для строки поиска /search.
 * Мёржит локальные районы (мгновенно, сверху) и адреса из Yandex Suggest
 * (ymaps.suggest, ленивая загрузка SDK по `enabled`). Дебаунс 300мс, порог 2
 * символа. Деградация: нет ключа / SDK упал → только районы, без исключений.
 */
import * as React from 'react';
import { loadYmaps, type Ymaps } from '@/features/map/useYmaps';
import type { District } from '@/lib/mock/types';

export type Suggestion =
  | { kind: 'district'; title: string; value: string }
  | { kind: 'geo'; title: string; value: string };

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;
const MAX_GEO = 7;

const norm = (s: string): string => s.trim().toLowerCase();

function matchDistricts(query: string, districts: District[]): Suggestion[] {
  const q = norm(query);
  // Матчим по имени (RU) и по узбекским/латинским алиасам — чтобы «yunusobod»
  // находил «Юнусабадский». Подпись всегда каноничная RU (d.name).
  return districts
    .filter(
      (d) =>
        norm(d.name).includes(q) ||
        (d.aliases ?? []).some((a) => norm(a).includes(q)),
    )
    .map((d) => ({ kind: 'district' as const, title: d.name, value: `Ташкент, ${d.name}` }));
}

/** Дедуп по title (район мог прийти и из Yandex). */
function dedupe(items: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    const k = norm(it.title);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export interface UseGeoSuggestOptions {
  enabled: boolean;
  districts: District[];
  locale: string;
}

export function useGeoSuggest(
  query: string,
  { enabled, districts, locale }: UseGeoSuggestOptions,
): { items: Suggestion[]; loading: boolean } {
  const [items, setItems] = React.useState<Suggestion[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!enabled || query.trim().length < MIN_CHARS) {
      setItems([]);
      setLoading(false);
      return;
    }

    const local = matchDistricts(query, districts);
    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(() => {
      loadYmaps(locale)
        .then((ymaps: Ymaps) => ymaps.suggest(`Ташкент, ${query}`, { results: MAX_GEO }))
        .then((res: Array<{ displayName: string; value: string }>) => {
          if (cancelled) return;
          const geo: Suggestion[] = res.map((r) => ({
            kind: 'geo',
            title: r.displayName,
            value: r.value,
          }));
          setItems(dedupe([...local, ...geo]));
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setItems(local); // деградация — только районы
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, query, districts, locale]);

  return { items, loading };
}
