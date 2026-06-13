# Geo-suggest в поиске — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** При наборе в строке поиска `/search` показывать подсказки (районы локально + адреса из Yandex Suggest); выбор подсказки сужает выдачу через circle-поиск (PostGIS).

**Architecture:** Презентационный `SearchAutocomplete` (инпут + попап + клавиатура/ARIA) получает готовые `items` от хука `useGeoSuggest` (мёрж локальных районов и `ymaps.suggest`, дебаунс, ленивая загрузка SDK). При выборе `resolveSuggestion` геокодит значение → bbox → `circleFromBounds` → circle, который `FilterBar` пишет в URL (`?clat&clng&radius`). `/search` уже читает эти параметры и зовёт `searchRadiusListings`. Бэкенд и серверная страница не меняются.

**Tech Stack:** Next 15 / React 19, next-intl 4, RTK, Yandex Maps JS API 2.1 (`ymaps.suggest`/`ymaps.geocode`). Тесты — Vitest + @testing-library/react + jsdom (ставим с нуля).

**Scope:** только `apps/client`. Вне скоупа: `/map`-suggest, таблица District, серверный полнотекст `q` (TASK-081/082).

---

## Структура файлов

| Файл | Ответственность | Действие |
|------|-----------------|----------|
| `apps/client/vitest.config.ts` | конфиг тест-раннера | Create |
| `apps/client/vitest.setup.ts` | jest-dom матчеры | Create |
| `apps/client/package.json` | dev-deps + `test` скрипт | Modify |
| `apps/client/src/lib/geo.ts` | `circleFromBounds` (bbox→circle) | Modify |
| `apps/client/src/lib/geo.test.ts` | тест `circleFromBounds` | Create |
| `apps/client/src/features/map/useYmaps.ts` | экспорт `loadYmaps` | Modify |
| `apps/client/src/features/search/useGeoSuggest.ts` | мёрж районов + Yandex, дебаунс | Create |
| `apps/client/src/features/search/useGeoSuggest.test.ts` | тест хука | Create |
| `apps/client/src/features/search/resolveSuggestion.ts` | geocode→circle | Create |
| `apps/client/src/features/search/resolveSuggestion.test.ts` | тест резолва | Create |
| `apps/client/src/features/search/SearchAutocomplete.tsx` | инпут + попап + клавиатура | Create |
| `apps/client/src/features/search/SearchAutocomplete.test.tsx` | тест компонента | Create |
| `apps/client/src/features/search/FilterBar.tsx` | проводка автокомплита | Modify |
| `apps/client/messages/{ru,uz,en}.json` | i18n-ключи | Modify |

---

## Task 0: Тест-харнесс Vitest + RTL

**Files:**
- Create: `apps/client/vitest.config.ts`, `apps/client/vitest.setup.ts`
- Modify: `apps/client/package.json`

- [ ] **Step 1: Установить dev-зависимости**

Run (из корня репо):
```bash
pnpm --filter @avino/client add -D vitest@^2 @vitejs/plugin-react@^4 vite-tsconfig-paths@^5 jsdom@^25 @testing-library/react@^16 @testing-library/user-event@^14 @testing-library/jest-dom@^6
```
Expected: пакеты добавлены в `apps/client/package.json` → `devDependencies`.

- [ ] **Step 2: Создать `apps/client/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

- [ ] **Step 3: Создать `apps/client/vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Обновить `test`-скрипт в `apps/client/package.json`**

Заменить строку `"test": "echo \"no tests yet\" && exit 0"` на:
```json
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
```

- [ ] **Step 5: Проверить, что раннер стартует**

Run: `pnpm --filter @avino/client test`
Expected: PASS — `No test files found` не считается ошибкой (флаг `--passWithNoTests`), exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/client/vitest.config.ts apps/client/vitest.setup.ts apps/client/package.json apps/client/../../pnpm-lock.yaml
git commit -m "test(client): поднять Vitest + RTL харнесс"
```
(Если lock-файл в корне — добавить `pnpm-lock.yaml` его реальным путём.)

---

## Task 1: `circleFromBounds` (bbox → circle)

**Files:**
- Modify: `apps/client/src/lib/geo.ts`
- Test: `apps/client/src/lib/geo.test.ts`

- [ ] **Step 1: Написать падающий тест** — `apps/client/src/lib/geo.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { circleFromBounds, MIN_RADIUS_M, MAX_RADIUS_M } from './geo';
import type { LatLngBounds } from './geo';

describe('circleFromBounds', () => {
  it('возвращает центр bbox и радиус ≈ половина диагонали', () => {
    const b: LatLngBounds = { swLat: 41.30, swLng: 69.24, neLat: 41.31, neLng: 69.25 };
    const c = circleFromBounds(b);
    expect(c).not.toBeNull();
    expect(c!.lat).toBeCloseTo(41.305, 5);
    expect(c!.lng).toBeCloseTo(69.245, 5);
    // ~1.1км по широте + ~0.84км по долготе → диагональ ~1.4км → радиус ~700м.
    expect(c!.radiusM).toBeGreaterThan(600);
    expect(c!.radiusM).toBeLessThan(800);
  });

  it('крошечный bbox (точный адрес) зажимается к MIN_RADIUS_M', () => {
    const b: LatLngBounds = { swLat: 41.3000, swLng: 69.2400, neLat: 41.3001, neLng: 69.2401 };
    expect(circleFromBounds(b)!.radiusM).toBe(MIN_RADIUS_M);
  });

  it('огромный bbox зажимается к MAX_RADIUS_M', () => {
    const b: LatLngBounds = { swLat: 40, swLng: 68, neLat: 42, neLng: 70 };
    expect(circleFromBounds(b)!.radiusM).toBe(MAX_RADIUS_M);
  });

  it('невалидный/вырожденный bbox → null', () => {
    expect(circleFromBounds(null)).toBeNull();
    expect(circleFromBounds({ swLat: 41.3, swLng: 69.2, neLat: 41.3, neLng: 69.2 })).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @avino/client exec vitest run src/lib/geo.test.ts`
Expected: FAIL — `circleFromBounds is not a function`.

- [ ] **Step 3: Реализовать в `apps/client/src/lib/geo.ts`**

Добавить в конец файла (импорт `RadiusCircle` уже есть; `clampRadius`, `isValidBounds`, `LatLngBounds` объявлены выше в файле):

```ts
/** Дистанция между двумя точками в метрах (haversine). */
function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Прямоугольная область → круг: центр = середина bbox, радиус = половина
 * диагонали (clamp 250..50000). Невалидный/вырожденный bbox → null (тогда
 * вызывающий падает на текстовый поиск без гео).
 */
export function circleFromBounds(bounds: LatLngBounds | null): RadiusCircle | null {
  if (!isValidBounds(bounds)) return null;
  const lat = (bounds.swLat + bounds.neLat) / 2;
  const lng = (bounds.swLng + bounds.neLng) / 2;
  const diagM = haversineM(bounds.swLat, bounds.swLng, bounds.neLat, bounds.neLng);
  return { lat, lng, radiusM: clampRadius(diagM / 2) };
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `pnpm --filter @avino/client exec vitest run src/lib/geo.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/lib/geo.ts apps/client/src/lib/geo.test.ts
git commit -m "feat(client): circleFromBounds — bbox области в circle-поиск"
```

---

## Task 2: Экспорт `loadYmaps` + хук `useGeoSuggest`

**Files:**
- Modify: `apps/client/src/features/map/useYmaps.ts:36` (сделать `loadYmaps` экспортируемой)
- Create: `apps/client/src/features/search/useGeoSuggest.ts`
- Test: `apps/client/src/features/search/useGeoSuggest.test.ts`

- [ ] **Step 1: Экспортировать `loadYmaps`**

В `apps/client/src/features/map/useYmaps.ts` заменить `function loadYmaps(locale?: string): Promise<Ymaps> {` на:
```ts
export function loadYmaps(locale?: string): Promise<Ymaps> {
```
(Только добавлено `export`; тело без изменений.)

- [ ] **Step 2: Написать падающий тест** — `apps/client/src/features/search/useGeoSuggest.test.ts`

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { District } from '@/lib/mock/types';

const suggest = vi.fn();
vi.mock('@/features/map/useYmaps', () => ({
  loadYmaps: () => Promise.resolve({ suggest }),
}));

import { useGeoSuggest } from './useGeoSuggest';

const districts: District[] = [
  { id: 'yunusabad', name: 'Юнусабадский', count: 0 },
  { id: 'chilanzar', name: 'Чиланзарский', count: 0 },
];

beforeEach(() => {
  vi.useFakeTimers();
  suggest.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('useGeoSuggest', () => {
  it('ниже порога (1 символ) — пусто, suggest не зовётся', async () => {
    const { result } = renderHook(() =>
      useGeoSuggest('Ю', { enabled: true, districts, locale: 'ru' }),
    );
    await vi.advanceTimersByTimeAsync(400);
    expect(result.current.items).toEqual([]);
    expect(suggest).not.toHaveBeenCalled();
  });

  it('мёржит локальные районы (сверху) и адреса Yandex', async () => {
    suggest.mockResolvedValue([
      { displayName: 'Юнусабад, ул. Амира Темура', value: 'Узбекистан, Ташкент, Амира Темура' },
    ]);
    const { result } = renderHook(() =>
      useGeoSuggest('Юну', { enabled: true, districts, locale: 'ru' }),
    );
    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => expect(result.current.items.length).toBe(2));
    expect(result.current.items[0]).toMatchObject({ kind: 'district', title: 'Юнусабадский' });
    expect(result.current.items[1]).toMatchObject({ kind: 'geo' });
  });

  it('деградация: если suggest упал — остаются только районы', async () => {
    suggest.mockRejectedValue(new Error('no key'));
    const { result } = renderHook(() =>
      useGeoSuggest('Чил', { enabled: true, districts, locale: 'ru' }),
    );
    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => expect(result.current.items.length).toBe(1));
    expect(result.current.items[0]).toMatchObject({ kind: 'district', title: 'Чиланзарский' });
  });

  it('enabled=false — пусто', async () => {
    const { result } = renderHook(() =>
      useGeoSuggest('Юну', { enabled: false, districts, locale: 'ru' }),
    );
    await vi.advanceTimersByTimeAsync(400);
    expect(result.current.items).toEqual([]);
    expect(suggest).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `pnpm --filter @avino/client exec vitest run src/features/search/useGeoSuggest.test.ts`
Expected: FAIL — модуль `./useGeoSuggest` не найден.

- [ ] **Step 4: Реализовать `apps/client/src/features/search/useGeoSuggest.ts`**

```ts
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
  return districts
    .filter((d) => norm(d.name).includes(q))
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
```

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `pnpm --filter @avino/client exec vitest run src/features/search/useGeoSuggest.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/features/map/useYmaps.ts apps/client/src/features/search/useGeoSuggest.ts apps/client/src/features/search/useGeoSuggest.test.ts
git commit -m "feat(client): useGeoSuggest — мёрж районов и Yandex Suggest"
```

---

## Task 3: `resolveSuggestion` (geocode → circle)

**Files:**
- Create: `apps/client/src/features/search/resolveSuggestion.ts`
- Test: `apps/client/src/features/search/resolveSuggestion.test.ts`

- [ ] **Step 1: Написать падающий тест** — `apps/client/src/features/search/resolveSuggestion.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';

const geocode = vi.fn();
vi.mock('@/features/map/useYmaps', () => ({
  loadYmaps: () => Promise.resolve({ geocode }),
}));

import { resolveSuggestion } from './resolveSuggestion';

function fakeGeoObject(boundedBy: unknown, addressLine: string) {
  return {
    geoObjects: {
      get: (i: number) =>
        i === 0
          ? {
              properties: { get: (k: string) => (k === 'boundedBy' ? boundedBy : undefined) },
              getAddressLine: () => addressLine,
            }
          : null,
    },
  };
}

describe('resolveSuggestion', () => {
  it('геокодит значение → circle из boundedBy', async () => {
    geocode.mockResolvedValue(
      fakeGeoObject([[41.30, 69.24], [41.31, 69.25]], 'Ташкент, Юнусабадский район'),
    );
    const r = await resolveSuggestion('Ташкент, Юнусабадский');
    expect(r).not.toBeNull();
    expect(r!.label).toBe('Ташкент, Юнусабадский район');
    expect(r!.circle.lat).toBeCloseTo(41.305, 5);
    expect(r!.circle.radiusM).toBeGreaterThan(0);
  });

  it('нет geoObject → null', async () => {
    geocode.mockResolvedValue({ geoObjects: { get: () => null } });
    expect(await resolveSuggestion('???')).toBeNull();
  });

  it('нет boundedBy → null', async () => {
    geocode.mockResolvedValue(fakeGeoObject(undefined, 'X'));
    expect(await resolveSuggestion('X')).toBeNull();
  });

  it('geocode бросил → null (деградация)', async () => {
    geocode.mockRejectedValue(new Error('network'));
    expect(await resolveSuggestion('X')).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @avino/client exec vitest run src/features/search/resolveSuggestion.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `apps/client/src/features/search/resolveSuggestion.ts`**

```ts
'use client';

/**
 * resolveSuggestion — выбранная подсказка → circle для URL-поиска.
 * Геокодит значение через ymaps.geocode, берёт boundedBy первого результата и
 * переводит его в circle (circleFromBounds). Любая осечка (нет результата, нет
 * bbox, сетевой сбой) → null: вызывающий падает на текстовый поиск без гео.
 */
import { loadYmaps } from '@/features/map/useYmaps';
import { circleFromBounds } from '@/lib/geo';
import type { LatLngBounds } from '@/lib/geo';
import type { RadiusCircle } from '@/lib/mock/types';

export interface ResolvedGeo {
  label: string;
  circle: RadiusCircle;
}

export async function resolveSuggestion(value: string): Promise<ResolvedGeo | null> {
  try {
    const ymaps = await loadYmaps();
    const res = await ymaps.geocode(value, { results: 1 });
    const obj = res.geoObjects.get(0);
    if (!obj) return null;

    const bounded = obj.properties.get('boundedBy') as
      | [[number, number], [number, number]]
      | undefined;
    // Yandex 2.1 latlong: boundedBy = [[swLat, swLng], [neLat, neLng]].
    const bounds: LatLngBounds | null = bounded
      ? { swLat: bounded[0][0], swLng: bounded[0][1], neLat: bounded[1][0], neLng: bounded[1][1] }
      : null;

    const circle = circleFromBounds(bounds);
    if (!circle) return null;

    const label = (obj.getAddressLine?.() as string | undefined) || value;
    return { label, circle };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `pnpm --filter @avino/client exec vitest run src/features/search/resolveSuggestion.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/search/resolveSuggestion.ts apps/client/src/features/search/resolveSuggestion.test.ts
git commit -m "feat(client): resolveSuggestion — geocode подсказки в circle"
```

---

## Task 4: Компонент `SearchAutocomplete`

**Files:**
- Create: `apps/client/src/features/search/SearchAutocomplete.tsx`
- Test: `apps/client/src/features/search/SearchAutocomplete.test.tsx`

- [ ] **Step 1: Написать падающий тест** — `apps/client/src/features/search/SearchAutocomplete.test.tsx`

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchAutocomplete } from './SearchAutocomplete';
import type { Suggestion } from './useGeoSuggest';

const items: Suggestion[] = [
  { kind: 'district', title: 'Юнусабадский', value: 'Ташкент, Юнусабадский' },
  { kind: 'geo', title: 'Юнусабад, ул. Амира Темура', value: 'Узбекистан, Ташкент, Амира Темура' },
];

const baseProps = {
  value: 'Юну',
  items,
  loading: false,
  placeholder: 'Район, адрес…',
  ariaLabel: 'Поиск',
  labels: { districts: 'Районы', addresses: 'Адреса', empty: 'Ничего не найдено' },
};

it('показывает группы и опции при фокусе', async () => {
  const user = userEvent.setup();
  render(
    <SearchAutocomplete {...baseProps} onChange={() => {}} onSelect={() => {}} onSubmitRaw={() => {}} onActiveChange={() => {}} />,
  );
  await user.click(screen.getByRole('combobox'));
  expect(screen.getByText('Районы')).toBeInTheDocument();
  expect(screen.getByText('Адреса')).toBeInTheDocument();
  expect(screen.getAllByRole('option')).toHaveLength(2);
});

it('ArrowDown + Enter выбирает первую опцию', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(
    <SearchAutocomplete {...baseProps} onChange={() => {}} onSelect={onSelect} onSubmitRaw={() => {}} onActiveChange={() => {}} />,
  );
  await user.click(screen.getByRole('combobox'));
  await user.keyboard('{ArrowDown}{Enter}');
  expect(onSelect).toHaveBeenCalledWith(items[0]);
});

it('Enter без подсветки коммитит сырой текст', async () => {
  const user = userEvent.setup();
  const onSubmitRaw = vi.fn();
  render(
    <SearchAutocomplete {...baseProps} onChange={() => {}} onSelect={() => {}} onSubmitRaw={onSubmitRaw} onActiveChange={() => {}} />,
  );
  await user.click(screen.getByRole('combobox'));
  await user.keyboard('{Enter}');
  expect(onSubmitRaw).toHaveBeenCalledWith('Юну');
});

it('клик по опции вызывает onSelect', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(
    <SearchAutocomplete {...baseProps} onChange={() => {}} onSelect={onSelect} onSubmitRaw={() => {}} onActiveChange={() => {}} />,
  );
  await user.click(screen.getByRole('combobox'));
  await user.click(screen.getByText('Юнусабад, ул. Амира Темура'));
  expect(onSelect).toHaveBeenCalledWith(items[1]);
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @avino/client exec vitest run src/features/search/SearchAutocomplete.test.tsx`
Expected: FAIL — модуль `./SearchAutocomplete` не найден.

- [ ] **Step 3: Реализовать `apps/client/src/features/search/SearchAutocomplete.tsx`**

```tsx
'use client';

/**
 * SearchAutocomplete — инпут поиска /search с выпадающими подсказками.
 * Презентационный: items/loading и колбэки приходят из FilterBar (хук
 * useGeoSuggest живёт там). Здесь — разметка попапа, группы, ARIA combobox и
 * навигация с клавиатуры. Выбор опции — по mousedown (preventDefault), чтобы не
 * ловить blur раньше клика.
 */
import * as React from 'react';
import { Search } from 'lucide-react';
import { Field } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import type { Suggestion } from './useGeoSuggest';

const MIN_CHARS = 2;

export interface SearchAutocompleteProps {
  value: string;
  onChange: (v: string) => void;
  onSelect: (s: Suggestion) => void;
  onSubmitRaw: (text: string) => void;
  /** Сообщает родителю фокус (включает useGeoSuggest). */
  onActiveChange: (active: boolean) => void;
  items: Suggestion[];
  loading: boolean;
  placeholder: string;
  ariaLabel: string;
  labels: { districts: string; addresses: string; empty: string };
}

export function SearchAutocomplete({
  value,
  onChange,
  onSelect,
  onSubmitRaw,
  onActiveChange,
  items,
  loading,
  placeholder,
  ariaLabel,
  labels,
}: SearchAutocompleteProps) {
  const [focused, setFocused] = React.useState(false);
  const [active, setActive] = React.useState(-1);

  const open = focused && value.trim().length >= MIN_CHARS;

  // Сброс подсветки при смене набора подсказок.
  React.useEffect(() => setActive(-1), [items]);

  const firstDistrict = items.findIndex((i) => i.kind === 'district');
  const firstGeo = items.findIndex((i) => i.kind === 'geo');

  const choose = (s: Suggestion) => {
    onSelect(s);
    setFocused(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter') onSubmitRaw(value);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && active < items.length) choose(items[active]);
      else onSubmitRaw(value);
    } else if (e.key === 'Escape') {
      setFocused(false);
    }
  };

  return (
    <div className="relative min-w-[230px] flex-shrink-0">
      <Search
        size={17}
        strokeWidth={1.9}
        className="pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <Field
        role="combobox"
        aria-expanded={open}
        aria-controls="search-suggest-list"
        aria-activedescendant={active >= 0 ? `search-suggest-opt-${active}` : undefined}
        aria-autocomplete="list"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          setFocused(true);
          onActiveChange(true);
        }}
        onBlur={() => {
          setFocused(false);
          onActiveChange(false);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="rounded-pill py-[9px] pl-[38px] pr-4"
        aria-label={ariaLabel}
      />

      {open && (
        <ul
          id="search-suggest-list"
          role="listbox"
          className="absolute left-0 top-[calc(100%+6px)] z-30 max-h-[320px] w-[320px] overflow-y-auto rounded-2xl border border-border bg-surface py-2 shadow-lg"
        >
          {items.length === 0 && !loading && (
            <li className="px-4 py-2 text-sm text-muted-foreground">{labels.empty}</li>
          )}
          {items.map((it, idx) => (
            <React.Fragment key={`${it.kind}-${it.title}`}>
              {idx === firstDistrict && (
                <li role="presentation" className="px-4 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {labels.districts}
                </li>
              )}
              {idx === firstGeo && (
                <li role="presentation" className="px-4 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {labels.addresses}
                </li>
              )}
              <li
                id={`search-suggest-opt-${idx}`}
                role="option"
                aria-selected={active === idx}
                // mousedown раньше blur — фиксируем выбор до закрытия попапа.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(it);
                }}
                className={cn(
                  'cursor-pointer px-4 py-2 text-sm',
                  active === idx ? 'bg-muted' : 'hover:bg-muted/60',
                )}
              >
                {it.title}
              </li>
            </React.Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `pnpm --filter @avino/client exec vitest run src/features/search/SearchAutocomplete.test.tsx`
Expected: PASS (4 теста).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/search/SearchAutocomplete.tsx apps/client/src/features/search/SearchAutocomplete.test.tsx
git commit -m "feat(client): SearchAutocomplete — попап подсказок + клавиатура/ARIA"
```

---

## Task 5: i18n-ключи

**Files:**
- Modify: `apps/client/messages/ru.json`, `apps/client/messages/uz.json`, `apps/client/messages/en.json`

- [ ] **Step 1: Добавить ключи в группу `search.filters`**

Рядом с существующим `searchPlaceholder` (строка ~172) добавить в каждый файл:

`ru.json`:
```json
      "suggestGroupDistricts": "Районы",
      "suggestGroupAddresses": "Адреса",
      "suggestEmpty": "Ничего не найдено",
```
`uz.json`:
```json
      "suggestGroupDistricts": "Tumanlar",
      "suggestGroupAddresses": "Manzillar",
      "suggestEmpty": "Hech narsa topilmadi",
```
`en.json`:
```json
      "suggestGroupDistricts": "Districts",
      "suggestGroupAddresses": "Addresses",
      "suggestEmpty": "Nothing found",
```
(`searchAria` для `aria-label` уже существует — переиспользуем его.)

- [ ] **Step 2: Проверить валидность JSON**

Run: `node -e "['ru','uz','en'].forEach(l=>JSON.parse(require('fs').readFileSync('apps/client/messages/'+l+'.json','utf8')));console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "i18n(client): ключи групп/empty для подсказок поиска"
```

---

## Task 6: Проводка автокомплита в `FilterBar`

**Files:**
- Modify: `apps/client/src/features/search/FilterBar.tsx`

- [ ] **Step 1: Добавить импорты**

В блок импортов `FilterBar.tsx` добавить:
```ts
import { useLocale } from 'next-intl';
import { SearchAutocomplete } from './SearchAutocomplete';
import { useGeoSuggest, type Suggestion } from './useGeoSuggest';
import { resolveSuggestion } from './resolveSuggestion';
```
И удалить теперь неиспользуемый импорт `Field` из `'@/components/ui/field'`, если он больше нигде в файле не используется (проверить: `Field` мог использоваться в фильтрах цены — если да, импорт оставить). `Search` из `lucide-react` теперь живёт внутри `SearchAutocomplete`; убрать `Search` из импорта `lucide-react`, **только** если он не используется в других местах FilterBar.

- [ ] **Step 2: Добавить состояние и хук в тело `FilterBar` (после `queryDraft`, ~строка 88)**

```ts
  const locale = useLocale();
  const [suggestActive, setSuggestActive] = React.useState(false);
  const { items, loading } = useGeoSuggest(queryDraft, {
    enabled: suggestActive,
    districts,
    locale,
  });

  /** Выбор подсказки: geocode → circle в URL; осечка → текст без гео. */
  const handleSelect = React.useCallback(
    async (s: Suggestion) => {
      const resolved = await resolveSuggestion(s.value);
      if (resolved) {
        setQueryDraft(resolved.label);
        setParams({
          query: resolved.label,
          clat: resolved.circle.lat,
          clng: resolved.circle.lng,
          radius: resolved.circle.radiusM,
        });
      } else {
        setParams({ query: s.title });
      }
    },
    [setParams],
  );

  /** Enter по свободному тексту: только query, circle сбрасываем. */
  const handleSubmitRaw = React.useCallback(
    (text: string) => {
      setParams({
        query: text || undefined,
        clat: undefined,
        clng: undefined,
        radius: undefined,
      });
    },
    [setParams],
  );
```

- [ ] **Step 3: Заменить JSX-блок инпута поиска**

Найти блок (≈строки 142–153):
```tsx
          <div className="relative min-w-[230px] flex-shrink-0">
            <Search
              size={17}
              strokeWidth={1.9}
              className="pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Field
              value={queryDraft}
              onChange={(e) => setQueryDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setParams({ query: queryDraft });
              }}
              onBlur={() => setParams({ query: queryDraft })}
              placeholder={tSearch('filters.searchPlaceholder')}
              className="rounded-pill py-[9px] pl-[38px] pr-4"
              aria-label={tSearch('filters.searchAria')}
            />
          </div>
```
и заменить на:
```tsx
          <SearchAutocomplete
            value={queryDraft}
            onChange={setQueryDraft}
            onSelect={handleSelect}
            onSubmitRaw={handleSubmitRaw}
            onActiveChange={setSuggestActive}
            items={items}
            loading={loading}
            placeholder={tSearch('filters.searchPlaceholder')}
            ariaLabel={tSearch('filters.searchAria')}
            labels={{
              districts: tSearch('filters.suggestGroupDistricts'),
              addresses: tSearch('filters.suggestGroupAddresses'),
              empty: tSearch('filters.suggestEmpty'),
            }}
          />
```

> Замечание по UX: коммит текста по `blur` убран — теперь свободный текст применяется по Enter, а выбор подсказки по клику/Enter. Это намеренно: иначе blur после выбора затёр бы только что выставленный circle.

- [ ] **Step 4: Типчек**

Run: `pnpm --filter @avino/client exec tsc --noEmit`
Expected: без ошибок. (Если `Field`/`Search` остались импортированы, но не используются — TS/eslint укажет; удалить лишние импорты.)

- [ ] **Step 5: Lint**

Run: `pnpm --filter @avino/client lint`
Expected: без ошибок.

- [ ] **Step 6: Прогнать все тесты**

Run: `pnpm --filter @avino/client test`
Expected: PASS — все наборы (geo, useGeoSuggest, resolveSuggestion, SearchAutocomplete).

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/features/search/FilterBar.tsx
git commit -m "feat(client): geo-suggest в строке поиска /search (выбор → circle)"
```

---

## Task 7: Финальная проверка (build + ручной smoke)

**Files:** —

- [ ] **Step 1: Прод-сборка клиента**

Run: `pnpm --filter @avino/client build`
Expected: успешная сборка (учитывай известную ловушку: старый dev/start на :3001 может портить prod-сборку — при сбое останови процесс на :3001, см. memory `avino-client-next-build-corruption`).

- [ ] **Step 2: Ручной smoke (нужен `NEXT_PUBLIC_YANDEX_MAPS_API_KEY`)**

1. `pnpm --filter @avino/client dev`, открыть `/ru/search`.
2. Кликнуть в строку поиска, набрать «Юну» → видно группу «Районы» (Юнусабадский) и «Адреса» (из Yandex).
3. ↑/↓ перемещают подсветку, Enter выбирает; Esc закрывает; клик мышью выбирает.
4. После выбора в URL появляются `clat/clng/radius`, выдача сужается по области (карточки в радиусе).
5. Очистить поле и нажать Enter → `clat/clng/radius` исчезают из URL.
6. Деградация: убрать `NEXT_PUBLIC_YANDEX_MAPS_API_KEY`, перезапустить → подсказок нет, инпут работает как обычный текст (страница не падает).

- [ ] **Step 3: Подготовка к PR (без отдельного follow-up PR)**

Дополнить feature-ветку: при необходимости ADR/пометка в задачнике и перенос статуса — в этом же PR (см. memory `avino-finalize-in-feature-pr`). Затем push и PR (gh-токен из `~/.gh_token`, значение не печатать).

---

## Self-Review

**Spec coverage:**
- Источник = районы + Yandex Suggest → Task 2 (`useGeoSuggest`). ✓
- Район/адрес → bbox → circle → Task 1 (`circleFromBounds`) + Task 3 (`resolveSuggestion`). ✓
- Дропдаун с группами/empty/клавиатура/ARIA → Task 4 + Task 5 (i18n). ✓
- `/search` остаёмся, circle в URL → Task 6 (`setParams` clat/clng/radius); потребление — существующий `searchRadiusListings` (не трогаем). ✓
- Деградация (no-key/geocode-пустой/очистка) → покрыто тестами Task 2/3 и ручным smoke Task 7. ✓
- Без счётчика, `/map` вне скоупа, backend не трогаем → ни одной задачи на это, как и задумано. ✓

**Placeholder scan:** код приведён полностью в каждом шаге; «удалить лишние импорты» в Task 6 — условная правка с явным критерием (TS/eslint покажет). Плейсхолдеров нет.

**Type consistency:** `Suggestion` (Task 2) используется в Task 4/6; `ResolvedGeo {label, circle}` (Task 3) — в Task 6; `RadiusCircle {lat,lng,radiusM}` и `LatLngBounds {swLat,swLng,neLat,neLng}` совпадают с `lib/geo.ts`/`lib/mock/types.ts`; `loadYmaps` экспортирована в Task 2 и импортируется в Task 2/3. Сигнатуры согласованы.
