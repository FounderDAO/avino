# Динамический price filter от текущей выдачи — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Слайдер цены и гистограмма на `/search` считаются из цен текущей выдачи (клиент), а не из глобального `GET /search/price-distribution`.

**Architecture:** `SearchResults` зеркалит пары «цена+валюта» текущей выдачи (`displayed`) в новый Redux-слайс (по образцу `territorySlice`). `PriceFilter` читает их из стора, конвертирует в display-валюту курсом ЦБУ (`convertPrice` + `useGetExchangeRateQuery`), домен `[0, niceCeil(max)]`, 30 бакетов считаются чистой функцией. `priceDistributionApi` удаляется.

**Tech Stack:** Next.js (apps/client), Redux Toolkit, RTK Query, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-07-06-dynamic-price-filter-from-results-design.md`

## Global Constraints

- Меняется ТОЛЬКО `apps/client`. Бэкенд-эндпоинт `/search/price-distribution` не трогать.
- Домен слайдера: `min = 0` всегда; `max` = максимальная цена выдачи, округлённая вверх до 2 значащих цифр (`132000 → 140000`).
- Пустая выдача / нет цен > 0 → фолбэк `FALLBACK_MAX`: USD `1_000_000`, UZS `12_000_000_000`.
- В Redux хранятся сырые пары `{price, currency}` (НЕ конвертированные): тоггл [сум|$] пересчитывает без обновления списка.
- Все bash-команды через `rtk`. Прогон тестов: `pnpm --filter @avino/client test -- --run <файл>`.
- Комментарии в коде — на русском, в стиле соседних файлов.
- Ветка: `feat/client-dynamic-price-filter` от актуального `main`. Коммитить ТОЛЬКО файлы этой задачи (в дереве много чужих untracked). Никогда не пушить в main — PR.

---

### Task 1: Чистые хелперы в `priceRange.ts` (niceCeil, конвертация, гистограмма)

**Files:**
- Modify: `apps/client/src/features/search/controls/priceRange.ts`
- Test: `apps/client/src/features/search/controls/priceRange.test.ts`

**Interfaces:**
- Consumes: `convertPrice(value, from, to, rate)` из `@/lib/format`; `Currency` из `@/lib/mock/types`.
- Produces (используют Task 4):
  - `export interface PriceBucket { from: number; to: number; count: number }`
  - `export interface PricePair { price: number; currency: Currency }`
  - `export function niceCeil(v: number): number`
  - `export function toDisplayPrices(pairs: PricePair[], display: Currency, rate?: number): number[]`
  - `export function buildPriceHistogram(prices: number[], domain: PriceDomain, n?: number): PriceBucket[]` (default n=30)

- [ ] **Step 1: Дописать failing-тесты в `priceRange.test.ts`**

```ts
// добавить к существующим импортам:
import { niceCeil, toDisplayPrices, buildPriceHistogram } from './priceRange';

it('niceCeil округляет вверх до 2 значащих цифр', () => {
  expect(niceCeil(132000)).toBe(140000);
  expect(niceCeil(1000000)).toBe(1000000);
  expect(niceCeil(9500)).toBe(9500);
  expect(niceCeil(0)).toBe(0);
});

it('toDisplayPrices: своя валюта как есть, чужая конвертируется по курсу', () => {
  const pairs = [
    { price: 100, currency: 'USD' as const },
    { price: 1200000, currency: 'UZS' as const },
  ];
  expect(toDisplayPrices(pairs, 'USD', 12000)).toEqual([100, 100]);
});

it('toDisplayPrices: без курса чужая валюта пропускается', () => {
  const pairs = [
    { price: 100, currency: 'USD' as const },
    { price: 1200000, currency: 'UZS' as const },
  ];
  expect(toDisplayPrices(pairs, 'USD', undefined)).toEqual([100]);
});

it('buildPriceHistogram: раскладывает цены по бакетам, max попадает в последний', () => {
  const buckets = buildPriceHistogram([10, 10, 95, 100], { min: 0, max: 100 }, 10);
  expect(buckets).toHaveLength(10);
  expect(buckets[1].count).toBe(2); // 10..20
  expect(buckets[9].count).toBe(2); // 90..100 (95 и ровно 100)
  expect(buckets[0]).toEqual({ from: 0, to: 10, count: 0 });
});

it('buildPriceHistogram: пустые цены или вырожденный домен → []', () => {
  expect(buildPriceHistogram([], { min: 0, max: 100 })).toEqual([]);
  expect(buildPriceHistogram([5], { min: 0, max: 0 })).toEqual([]);
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `pnpm --filter @avino/client test -- --run src/features/search/controls/priceRange.test.ts`
Expected: FAIL — `niceCeil` и др. не экспортированы.

- [ ] **Step 3: Реализация в `priceRange.ts`**

Дописать в конец файла (импорты — в шапку):

```ts
import { convertPrice } from '@/lib/format';
import type { Currency } from '@/lib/mock/types';

/** Бакет клиентской гистограммы цены (бывший DTO price-distribution). */
export interface PriceBucket {
  from: number;
  to: number;
  count: number;
}

/** Сырая пара «цена + валюта» объявления из текущей выдачи. */
export interface PricePair {
  price: number;
  currency: Currency;
}

/** Округление вверх до 2 значащих цифр для «красивого» потолка домена (132000 → 140000). */
export function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const step = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.ceil(v / step) * step;
}

/**
 * Цены выдачи в display-валюте. Чужая валюта конвертируется по курсу ЦБУ;
 * без курса — пропускается (деградация как у бывшей серверной гистограммы).
 */
export function toDisplayPrices(pairs: PricePair[], display: Currency, rate?: number): number[] {
  const out: number[] = [];
  for (const p of pairs) {
    if (p.currency === display) out.push(p.price);
    else if (rate) out.push(convertPrice(p.price, p.currency, display, rate));
  }
  return out;
}

/** Гистограмма: n равных бакетов по домену; значение ровно max — в последний бакет. */
export function buildPriceHistogram(prices: number[], domain: PriceDomain, n = 30): PriceBucket[] {
  if (prices.length === 0 || domain.max <= domain.min) return [];
  const step = (domain.max - domain.min) / n;
  const counts = new Array<number>(n).fill(0);
  for (const p of prices) {
    if (p < domain.min || p > domain.max) continue;
    counts[Math.min(n - 1, Math.floor((p - domain.min) / step))] += 1;
  }
  return counts.map((count, i) => ({
    from: domain.min + i * step,
    to: domain.min + (i + 1) * step,
    count,
  }));
}
```

Примечание: `Currency` в `@/lib/mock/types` — это `'USD' | 'UZS'`; сверить имя экспорта перед использованием (уже используется в `priceDistributionApi.ts`).

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @avino/client test -- --run src/features/search/controls/priceRange.test.ts`
Expected: PASS (все, включая старые clamp/niceStep/toAppliedRange).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/search/controls/priceRange.ts apps/client/src/features/search/controls/priceRange.test.ts
git commit -m "feat(client): price-range helpers — niceCeil, toDisplayPrices, buildPriceHistogram"
```

---

### Task 2: Redux-слайс `resultPricesSlice`

**Files:**
- Create: `apps/client/src/store/resultPricesSlice.ts`
- Modify: `apps/client/src/store/store.ts`
- Test: `apps/client/src/store/resultPricesSlice.test.ts`

**Interfaces:**
- Consumes: `PricePair` из Task 1 НЕ импортируется (слайс самодостаточен, свой тип `ResultPrice` с той же формой `{ price: number; currency: Currency }`) — store-слой не зависит от features.
- Produces (используют Task 3 и Task 4):
  - `setResultPrices(prices: ResultPrice[])`, `clearResultPrices()`
  - `selectResultPrices(state): ResultPrice[]`
  - reducer ключ в сторе: `resultPrices`

- [ ] **Step 1: Failing-тест `resultPricesSlice.test.ts`** (по образцу `territorySlice.test.ts`)

```ts
import { it, expect } from 'vitest';
import reducer, { setResultPrices, clearResultPrices } from './resultPricesSlice';

it('setResultPrices сохраняет пары цена+валюта', () => {
  const next = reducer({ prices: [] }, setResultPrices([{ price: 88800, currency: 'USD' }]));
  expect(next.prices).toEqual([{ price: 88800, currency: 'USD' }]);
});

it('clearResultPrices очищает список', () => {
  const next = reducer({ prices: [{ price: 1, currency: 'USD' }] }, clearResultPrices());
  expect(next.prices).toEqual([]);
});
```

- [ ] **Step 2: Убедиться, что падает** — `pnpm --filter @avino/client test -- --run src/store/resultPricesSlice.test.ts` → FAIL (модуля нет).

- [ ] **Step 3: Реализация `resultPricesSlice.ts`**

```ts
/**
 * resultPricesSlice — цены объявлений текущей выдачи /search.
 *
 * `SearchResults` зеркалит сюда пары «цена + валюта» показанного списка
 * (viewport / полигон / страницы), `PriceFilter` строит по ним домен слайдера
 * и гистограмму. Хранятся сырые пары, НЕ конвертированные: тоггл валюты
 * пересчитывает фильтр без обновления списка (образец — territorySlice).
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Currency } from '@/lib/mock/types';

export interface ResultPrice {
  price: number;
  currency: Currency;
}

export interface ResultPricesState {
  prices: ResultPrice[];
}

const initialState: ResultPricesState = { prices: [] };

const resultPricesSlice = createSlice({
  name: 'resultPrices',
  initialState,
  reducers: {
    setResultPrices(state, action: PayloadAction<ResultPrice[]>) {
      state.prices = action.payload;
    },
    clearResultPrices(state) {
      state.prices = [];
    },
  },
});

export const { setResultPrices, clearResultPrices } = resultPricesSlice.actions;

export const selectResultPrices = (state: {
  resultPrices: ResultPricesState;
}): ResultPrice[] => state.resultPrices.prices;

export default resultPricesSlice.reducer;
```

- [ ] **Step 4: Регистрация в `store.ts`**

```ts
import resultPricesReducer from './resultPricesSlice';
// ...в reducer:
      resultPrices: resultPricesReducer,
```

- [ ] **Step 5: Тесты зелёные** — `pnpm --filter @avino/client test -- --run src/store/resultPricesSlice.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/store/resultPricesSlice.ts apps/client/src/store/resultPricesSlice.test.ts apps/client/src/store/store.ts
git commit -m "feat(client): resultPrices slice — зеркало цен текущей выдачи"
```

---

### Task 3: Зеркало цен из `SearchResults`

**Files:**
- Modify: `apps/client/src/features/search/SearchResults.tsx` (~строки 164–172 и блок зеркала territory ~121–128)

**Interfaces:**
- Consumes: `setResultPrices`, `clearResultPrices` из Task 2; `displayed: Listing[]` (уже есть в компоненте, `Listing.price: string`).
- Produces: наполненный `state.resultPrices` для Task 4.

- [ ] **Step 1: Мемоизировать `displayed`**

Сейчас (строки 168–172) `displayed` пересоздаётся каждый рендер (`polygonData ?? []` — новый литерал), эффект-зеркало зациклился бы. Заменить на:

```tsx
const displayed = React.useMemo(
  () =>
    points
      ? polygonData ?? []
      : vp.active
        ? vp.listings ?? paged
        : paged,
  [points, polygonData, vp.active, vp.listings, paged],
);
```

(`polygonData` здесь — уже массив `Listing[]`? Проверить: в текущем коде используется `polygonData ?? []` — сохранить точное текущее выражение, поменяв только обёртку в useMemo.)

- [ ] **Step 2: Добавить зеркало цен рядом с зеркалом territory**

После блока territory (за `React.useEffect(() => () => void dispatch(clearTerritoryRedux()), [dispatch]);`) добавить — но физически ПОСЛЕ объявления `displayed` (эффекты можно объявить ниже по файлу, рядом с displayed):

```tsx
// Зеркалим цены текущей выдачи в Redux: PriceFilter (соседний компонент)
// строит по ним домен слайдера и гистограмму (спека 2026-07-06).
React.useEffect(() => {
  dispatch(
    setResultPrices(
      displayed.map((l) => ({ price: Number(l.price), currency: l.currency })),
    ),
  );
}, [displayed, dispatch]);
React.useEffect(() => () => void dispatch(clearResultPrices()), [dispatch]);
```

Импорты: `import { setResultPrices, clearResultPrices } from '@/store/resultPricesSlice';` (путь-алиас сверить с соседним импортом territorySlice в этом файле).

- [ ] **Step 3: Прогнать тесты SearchResults, если есть** — `rtk grep -l "SearchResults" apps/client/src --include="*.test.tsx"`; если тестов нет — прогнать общий прогон каталога features/search.

Run: `pnpm --filter @avino/client test -- --run src/features/search`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/features/search/SearchResults.tsx
git commit -m "feat(client): зеркало цен выдачи в resultPrices из SearchResults"
```

---

### Task 4: `PriceFilter` считает домен/гистограмму из стора; удаление `priceDistributionApi`

**Files:**
- Modify: `apps/client/src/features/search/PriceFilter.tsx`
- Modify: `apps/client/src/features/search/controls/PriceRangeControl.tsx`
- Modify: `apps/client/src/features/search/controls/PriceRangeControl.test.tsx`
- Delete: `apps/client/src/store/api/priceDistributionApi.ts`

**Interfaces:**
- Consumes: `selectResultPrices` (Task 2); `niceCeil`, `toDisplayPrices`, `buildPriceHistogram`, `PriceBucket` (Task 1); `useGetExchangeRateQuery` из `@/store/api/exchangeRateApi`; `useAppSelector` из `@/store/hooks`.
- Produces: конечное UI-поведение; PriceFilter public props НЕ меняются (FilterBar не трогаем).

- [ ] **Step 1: `PriceRangeControl.tsx` — импорт PriceBucket и подпись без «+»**

```tsx
// было:
import type { PriceBucket } from '@/store/api/priceDistributionApi';
// стало:
import type { PriceBucket } from './priceRange';
```

Подпись правого края (строка ~94): домен теперь накрывает максимальную цену выдачи, «+» не нужен:

```tsx
// было:
<span>{formatLabel(domain.max)}+</span>
// стало:
<span>{formatLabel(domain.max)}</span>
```

- [ ] **Step 2: Обновить тест `PriceRangeControl.test.tsx`**

```tsx
// было:
expect(screen.getByText('$1000+')).toBeInTheDocument();
// стало:
expect(screen.getByText('$1000')).toBeInTheDocument();
```

- [ ] **Step 3: `PriceFilter.tsx` — данные из стора вместо RTK-запроса**

Импорты: удалить `useGetPriceDistributionQuery`; добавить:

```tsx
import { useAppSelector } from '@/store/hooks';
import { selectResultPrices } from '@/store/resultPricesSlice';
import { useGetExchangeRateQuery } from '@/store/api/exchangeRateApi';
import {
  clamp,
  toAppliedRange,
  niceCeil,
  toDisplayPrices,
  buildPriceHistogram,
  type PriceDomain,
  type PriceDraft,
} from './controls/priceRange';
```

В `PriceFilterBody` заменить блок `const { data } = useGetPriceDistributionQuery(...)` + `domain` на:

```tsx
// Цены текущей выдачи (зеркало из SearchResults) → display-валюта по курсу ЦБУ.
const resultPrices = useAppSelector(selectResultPrices);
const { data: rateData } = useGetExchangeRateQuery();
const rate = rateData ? Number(rateData.rate) : undefined;

const converted = React.useMemo(
  () => toDisplayPrices(resultPrices, displayCurrency, rate),
  [resultPrices, displayCurrency, rate],
);
// Домен: [0, niceCeil(max выдачи)]; пусто/нули → фолбэк $1M / 12 млрд сум.
const maxPrice = converted.length > 0 ? Math.max(...converted) : 0;
const domain: PriceDomain = React.useMemo(
  () => ({ min: 0, max: maxPrice > 0 ? niceCeil(maxPrice) : FALLBACK_MAX[displayCurrency] }),
  [maxPrice, displayCurrency],
);
const buckets = React.useMemo(
  () => buildPriceHistogram(converted, domain),
  [converted, domain],
);
```

В JSX: `buckets={data?.buckets ?? []}` → `buckets={buckets}`.

Обновить комментарий у `FALLBACK_MAX` («когда выдача пуста или цены недоступны») и docstring-шапку файла (данные из стора, не RTK Query). Комментарий у эффекта ре-инициализации драфта остаётся верным (deps `[displayCurrency, tx]` не меняем — обновление выдачи при открытом попапе не должно сбрасывать drag).

- [ ] **Step 4: Удалить `priceDistributionApi.ts`**

```bash
rtk grep -rn "priceDistributionApi\|useGetPriceDistributionQuery" apps/client/src
```
Expected: упоминаний, кроме самого файла, нет. Затем:

```bash
git rm apps/client/src/store/api/priceDistributionApi.ts
```

- [ ] **Step 5: Тесты + tsc**

Run: `pnpm --filter @avino/client test -- --run src/features/search`
Expected: PASS.
Run: `rtk tsc --noEmit -p apps/client` (если проект так не собирается — `pnpm --filter @avino/client exec tsc --noEmit`)
Expected: 0 ошибок.

- [ ] **Step 6: Commit**

```bash
git add -A apps/client/src/features/search apps/client/src/store
git commit -m "feat(client): динамический price filter из цен текущей выдачи"
```

---

### Task 5: Полная верификация + PR

**Files:**
- Commit: `docs/superpowers/specs/2026-07-06-dynamic-price-filter-from-results-design.md`, `docs/superpowers/plans/2026-07-06-dynamic-price-filter-from-results.md`

- [ ] **Step 1: Полный тест-прогон клиента** — `pnpm --filter @avino/client test -- --run` → PASS.

- [ ] **Step 2: Lint** — `rtk lint apps/client` (помнить: eslint клиента не ловит unused imports — проверить руками, что из `PriceFilter.tsx`/`PriceRangeControl.tsx` убраны импорты `priceDistributionApi`).

- [ ] **Step 3: Прод-сборка** — `pnpm --filter @avino/client exec next build` (НЕ верить `rtk next build` — известный false «Errors: 1»). Expected: успешная сборка.

- [ ] **Step 4: Live-проверка (если стек поднят)** — открыть `/search?tx=SALE` с гео-фильтром, открыть «Цена»: домен = `[0, niceCeil(max выдачи)]`, столбцы соответствуют ценам карточек; сдвинуть карту → переоткрыть попап → домен обновился; пустая выдача → `$0 – $1M`.

- [ ] **Step 5: Спека+план в коммит**

```bash
git add docs/superpowers/specs/2026-07-06-dynamic-price-filter-from-results-design.md docs/superpowers/plans/2026-07-06-dynamic-price-filter-from-results.md
git commit -m "docs: спека и план динамического price filter"
```

- [ ] **Step 6: Push + PR** (main protected — мёржит пользователь):

```bash
git push -u origin feat/client-dynamic-price-filter
gh pr create --title "feat(client): динамический price filter из цен текущей выдачи" --body "..."
```

PR body: проблема (статичный $0–$2M+), решение (клиентский расчёт из выдачи, Redux-зеркало по образцу territory), ограничение (первая страница 60), тест-план.
