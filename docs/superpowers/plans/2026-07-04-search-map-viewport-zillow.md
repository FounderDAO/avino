# Zillow-поведение карты на /search + унификация с /map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На /search пан/зум карты обновляет список по видимой области (`/search/bounds`), клик по пину показывает мини-PropertyCard поверх карты, клик по ней открывает существующую модалку; общая логика вынесена и переиспользована на /map.

**Architecture:** Общий хук `useViewportSearch` (features/map) владеет viewport-режимом (гео-приоритет: полигон > район/регион > viewport), общий `MapPreviewCard` — превью пина. `MapView` учится отличать жест пользователя от программных `setBounds` и принимать `initialBounds`. bbox зеркалится в URL shallow-обновлением `history.replaceState`; SSR /search понимает bbox. Backend не меняется.

**Tech Stack:** Next.js 15 App Router (apps/client), RTK Query, Yandex Maps JS API 2.1, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-07-04-search-map-viewport-zillow-design.md`

## Global Constraints

- Только `apps/client/` (CLAUDE.md §0: одна app-папка = один PR). Backend/`apps/web` НЕ трогать.
- Ветка: `feature/client-search-map-viewport`. В main не пушить; git ведёт контроллер, субагенты git НЕ трогают.
- RTK Query для всех запросов (CLAUDE.md §4); никаких fetch/axios в компонентах.
- API только `/api/v1/...` через существующий baseApi/apiFetch.
- Комментарии в коде — русские, в стиле соседних файлов; prose ответы — русские.
- Тесты: `pnpm --filter @avino/client test` (Vitest). Известный предсуществующий фейл: `LoginModal.test.tsx` (2 шт., НЕ регресс — не чинить).
- Линт/типы: `pnpm --filter @avino/client lint` и `pnpm exec tsc --noEmit -p apps/client` (eslint клиента не ловит unused imports — проверять руками).
- Сборку проверять `pnpm exec next build` из apps/client только на финальной задаче (`rtk next build` даёт ложный «Errors: 1»).
- i18n: новые user-facing строки — только через `t('key')`; для этой фичи новые ключи НЕ нужны (все уже есть: `search.map.preview.close`, `search.map.emptyArea`, `search.results.count`, `search.results.showMore`, `search.results.shownOfTotal`).

---

### Task 1: Гео-хелперы bbox для URL (lib/geo)

**Files:**
- Modify: `apps/client/src/lib/geo.ts` (добавить в конец файла)
- Test: `apps/client/src/lib/geo-bounds.test.ts` (создать)

**Interfaces:**
- Consumes: существующие `LatLngBounds`, `isValidBounds` из этого же файла.
- Produces (используют Tasks 5–7):
  - `BBOX_PARAM_KEYS: readonly ['sw_lat','sw_lng','ne_lat','ne_lng']`
  - `parseBoundsParams(swLat?, swLng?, neLat?, neLng?: string | undefined): LatLngBounds | null`
  - `setBoundsParams(params: URLSearchParams, b: LatLngBounds): void`

- [ ] **Step 1: Написать падающий тест**

Создать `apps/client/src/lib/geo-bounds.test.ts`:

```ts
/**
 * Тесты bbox-хелперов URL (?sw_lat=&sw_lng=&ne_lat=&ne_lng=) — viewport-режим
 * /search (Zillow): парсинг из searchParams и запись в URLSearchParams.
 */
import { describe, it, expect } from 'vitest';
import { parseBoundsParams, setBoundsParams, BBOX_PARAM_KEYS } from './geo';

describe('parseBoundsParams', () => {
  it('валидные строки → LatLngBounds', () => {
    expect(parseBoundsParams('41.2', '69.1', '41.4', '69.4')).toEqual({
      swLat: 41.2, swLng: 69.1, neLat: 41.4, neLng: 69.4,
    });
  });

  it('неполный набор → null', () => {
    expect(parseBoundsParams('41.2', '69.1', '41.4', undefined)).toBe(null);
    expect(parseBoundsParams(undefined, undefined, undefined, undefined)).toBe(null);
  });

  it('NaN / вне WGS84 / вырожденный (sw ≥ ne) → null', () => {
    expect(parseBoundsParams('x', '69.1', '41.4', '69.4')).toBe(null);
    expect(parseBoundsParams('-91', '69.1', '41.4', '69.4')).toBe(null);
    expect(parseBoundsParams('41.4', '69.1', '41.2', '69.4')).toBe(null);
    expect(parseBoundsParams('41.2', '69.4', '41.4', '69.1')).toBe(null);
  });
});

describe('setBoundsParams', () => {
  it('пишет 4 параметра, округляя до 5 знаков', () => {
    const p = new URLSearchParams('tx=SALE');
    setBoundsParams(p, {
      swLat: 41.123456789, swLng: 69.1, neLat: 41.4, neLng: 69.400009,
    });
    expect(p.get('sw_lat')).toBe('41.12346');
    expect(p.get('sw_lng')).toBe('69.1');
    expect(p.get('ne_lat')).toBe('41.4');
    expect(p.get('ne_lng')).toBe('69.40001');
    expect(p.get('tx')).toBe('SALE'); // существующие параметры не трогаем
  });

  it('BBOX_PARAM_KEYS перечисляет ровно эти 4 ключа', () => {
    expect([...BBOX_PARAM_KEYS]).toEqual(['sw_lat', 'sw_lng', 'ne_lat', 'ne_lng']);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @avino/client test -- run src/lib/geo-bounds.test.ts`
Expected: FAIL — `parseBoundsParams` is not exported.

- [ ] **Step 3: Реализация в `apps/client/src/lib/geo.ts`**

Добавить в конец файла:

```ts
// ─── bbox видимой области в URL /search (viewport-режим, Zillow) ───
//
// Область карты зеркалится в query (?sw_lat=&sw_lng=&ne_lat=&ne_lng=) shallow
// history.replaceState — refresh/шеринг ссылки сохраняют вид. Имена совпадают
// с параметрами GET /api/v1/search/bounds.

/** Ключи bbox-параметров URL (для записи/очистки одним списком). */
export const BBOX_PARAM_KEYS = ['sw_lat', 'sw_lng', 'ne_lat', 'ne_lng'] as const;

/**
 * Query-параметры `?sw_lat=&sw_lng=&ne_lat=&ne_lng=` → {@link LatLngBounds} | null.
 * Невалидные/неполные/вырожденные значения → null (страница молча падает на
 * обычную выдачу по фильтрам — как parseCircleParams выше).
 */
export function parseBoundsParams(
  swLat: string | undefined,
  swLng: string | undefined,
  neLat: string | undefined,
  neLng: string | undefined,
): LatLngBounds | null {
  if (!swLat || !swLng || !neLat || !neLng) return null;
  const b: LatLngBounds = {
    swLat: Number(swLat),
    swLng: Number(swLng),
    neLat: Number(neLat),
    neLng: Number(neLng),
  };
  return isValidBounds(b) ? b : null;
}

/** Координата bbox для URL: 5 знаков (~1 м) без хвостовых нулей. */
function roundBboxCoord(v: number): string {
  return String(Math.round(v * 1e5) / 1e5);
}

/** Пишет bbox в query-параметры (мутирует переданный URLSearchParams). */
export function setBoundsParams(params: URLSearchParams, b: LatLngBounds): void {
  params.set('sw_lat', roundBboxCoord(b.swLat));
  params.set('sw_lng', roundBboxCoord(b.swLng));
  params.set('ne_lat', roundBboxCoord(b.neLat));
  params.set('ne_lng', roundBboxCoord(b.neLng));
}
```

- [ ] **Step 4: Запустить тест — зелёный**

Run: `pnpm --filter @avino/client test -- run src/lib/geo-bounds.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit** (контроллер)

```bash
git add apps/client/src/lib/geo.ts apps/client/src/lib/geo-bounds.test.ts
git commit -m "feat(client): add bbox URL helpers for viewport search"
```

---

### Task 2: API-слой — полный набор фильтров в гео-поиске + серверный bounds-фетч

Попутный багфикс: `searchApi.filterParams` сейчас теряет фильтры Фазы 2
(amenities/parking/types/area/floor/year/lot_area/listing_source/rooms_min…)
в `/search/bounds`, `/search/polygon` и keyset-страницах. Переезжаем на
существующий полный сериализатор `buildSearchParams`.

**Files:**
- Modify: `apps/client/src/lib/api/listings.ts` (после `searchListingsPage`, ~строка 490)
- Modify: `apps/client/src/store/api/searchApi.ts`
- Test: `apps/client/src/lib/api/search-paths.test.ts` (создать)

**Interfaces:**
- Consumes: `buildSearchParams(filter, limit): URLSearchParams`, `safeSearch(path, lang)` (уже в listings.ts); `LatLngBounds` из `@/lib/geo`.
- Produces (используют Tasks 5–6 и searchApi):
  - `boundsSearchPath(filter: ListingFilter, bounds: LatLngBounds, limit: number): string`
  - `polygonSearchPath(filter: ListingFilter, points: string, limit: number): string`
  - `searchPagePath(filter: ListingFilter, limit: number, cursor?: string): string`
  - `searchListingsByBounds(filter: ListingFilter, bounds: LatLngBounds, lang?: string, limit?: number): Promise<Listing[]>`
  - RTK-эндпоинты сохраняют СУЩЕСТВУЮЩИЕ сигнатуры (`searchByBounds: Listing[]` и т.д.) — потребители не ломаются.

- [ ] **Step 1: Написать падающий тест**

Создать `apps/client/src/lib/api/search-paths.test.ts`:

```ts
/**
 * Тесты построителей путей гео-поиска: /search/bounds и /search/polygon обязаны
 * получать ПОЛНЫЙ набор фильтров §9 (Фаза 2), а не урезанное подмножество —
 * иначе выдача карты игнорирует amenities/parking/мультитип и т.д.
 */
import { describe, it, expect } from 'vitest';
import { boundsSearchPath, polygonSearchPath, searchPagePath } from './listings';
import { AMENITIES, PARKING_TYPES } from '@/lib/mock/types';
import type { LatLngBounds } from '@/lib/geo';

const bounds: LatLngBounds = { swLat: 41.2, swLng: 69.1, neLat: 41.4, neLng: 69.4 };

describe('boundsSearchPath', () => {
  it('передаёт bbox и фильтры Фазы 2', () => {
    const path = boundsSearchPath(
      {
        tx: 'SALE',
        types: ['APARTMENT', 'HOUSE'],
        amenities: [AMENITIES[0]],
        parkingTypes: [PARKING_TYPES[0]],
        bathroomsMin: 2,
        areaMin: 50,
      },
      bounds,
      100,
    );
    expect(path.startsWith('/search/bounds?')).toBe(true);
    const qs = new URLSearchParams(path.split('?')[1]);
    expect(qs.get('sw_lat')).toBe('41.2');
    expect(qs.get('ne_lng')).toBe('69.4');
    expect(qs.get('transaction_type')).toBe('SALE');
    expect(qs.getAll('property_type')).toEqual(['APARTMENT', 'HOUSE']);
    expect(qs.getAll('amenities')).toEqual([AMENITIES[0]]);
    expect(qs.getAll('parking_type')).toEqual([PARKING_TYPES[0]]);
    expect(qs.get('bathrooms_min')).toBe('2');
    expect(qs.get('area_min')).toBe('50');
    expect(qs.get('limit')).toBe('100');
  });
});

describe('polygonSearchPath', () => {
  it('передаёт кольцо и фильтры', () => {
    const path = polygonSearchPath(
      { tx: 'RENT', amenities: [AMENITIES[0]] },
      '41.2,69.1;41.3,69.2;41.25,69.3',
      100,
    );
    expect(path.startsWith('/search/polygon?')).toBe(true);
    const qs = new URLSearchParams(path.split('?')[1]);
    expect(qs.get('points')).toBe('41.2,69.1;41.3,69.2;41.25,69.3');
    expect(qs.getAll('amenities')).toEqual([AMENITIES[0]]);
  });
});

describe('searchPagePath', () => {
  it('передаёт cursor и фильтры', () => {
    const path = searchPagePath({ tx: 'SALE', roomsMin: 2 }, 24, 'CURSOR123');
    expect(path.startsWith('/search?')).toBe(true);
    const qs = new URLSearchParams(path.split('?')[1]);
    expect(qs.get('cursor')).toBe('CURSOR123');
    expect(qs.get('rooms_min')).toBe('2');
    expect(qs.get('limit')).toBe('24');
  });
});
```

- [ ] **Step 2: Запустить тест — падает**

Run: `pnpm --filter @avino/client test -- run src/lib/api/search-paths.test.ts`
Expected: FAIL — `boundsSearchPath` is not exported.

- [ ] **Step 3: Реализация путей + серверного фетча в `lib/api/listings.ts`**

В начало файла к импортам добавить (проверить существующие):

```ts
import type { LatLngBounds } from '@/lib/geo';
```

После `searchListingsPage` (≈строка 490) добавить:

```ts
// ─── Пути гео-поиска (общие для RTK Query и серверного fetch) ───
//
// buildSearchParams даёт ПОЛНЫЙ набор фильтров §9 — /search/bounds и
// /search/polygon наследуют те же фильтры, что и /search (Фаза 2 включительно).

/** Путь GET /search/bounds: bbox видимой области + все фильтры §9. */
export function boundsSearchPath(
  filter: ListingFilter,
  bounds: LatLngBounds,
  limit: number,
): string {
  const params = buildSearchParams(filter, limit);
  params.set('sw_lat', String(bounds.swLat));
  params.set('sw_lng', String(bounds.swLng));
  params.set('ne_lat', String(bounds.neLat));
  params.set('ne_lng', String(bounds.neLng));
  return `/search/bounds?${params.toString()}`;
}

/** Путь GET /search/polygon: сериализованное кольцо + все фильтры §9. */
export function polygonSearchPath(
  filter: ListingFilter,
  points: string,
  limit: number,
): string {
  const params = buildSearchParams(filter, limit);
  params.set('points', points);
  return `/search/polygon?${params.toString()}`;
}

/** Путь GET /search: keyset-страница + все фильтры §9. */
export function searchPagePath(
  filter: ListingFilter,
  limit: number,
  cursor?: string,
): string {
  const params = buildSearchParams(filter, limit);
  if (cursor) params.set('cursor', cursor);
  return `/search?${params.toString()}`;
}

/**
 * Выдача внутри bbox для SSR /search (viewport-режим, Zillow): восстановление
 * области из URL (?sw_lat=…). GET /api/v1/search/bounds, деградация как у
 * safeSearch (ошибка → пустой список).
 */
export async function searchListingsByBounds(
  filter: ListingFilter,
  bounds: LatLngBounds,
  lang = 'ru',
  limit = 100,
): Promise<Listing[]> {
  return safeSearch(boundsSearchPath(filter, bounds, limit), lang);
}
```

Заодно `searchListingsPage` перевести на общий путь (убрать дублирование):

```ts
export async function searchListingsPage(
  filter: ListingFilter = {},
  lang = 'ru',
  limit = 24,
  cursor?: string,
): Promise<SearchListingsPage> {
  return safeSearchPage(searchPagePath(filter, limit, cursor), lang);
}
```

- [ ] **Step 4: Переключить `searchApi.ts` на общие пути**

Удалить локальные `filterParams`, `boundsParams`, `polygonParams` и их
использование; импорт из listings дополнить. Итоговые эндпоинты:

```ts
import { baseApi } from './baseApi';
import {
  mapListing,
  boundsSearchPath,
  polygonSearchPath,
  searchPagePath,
  type SearchEnvelope,
  type SearchListingsPage,
} from '@/lib/api/listings';
import type { Listing, ListingFilter } from '@/lib/mock/types';
import type { LatLngBounds } from '@/lib/geo';
```

```ts
export const searchApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Листинги внутри видимой области карты (bbox), полный набор фильтров §9. */
    searchByBounds: build.query<Listing[], BoundsSearchArgs>({
      query: ({ bounds, filter = {}, limit = 100 }) =>
        boundsSearchPath(filter, bounds, limit),
      transformResponse: (env: SearchEnvelope) => env.data.map(mapListing),
      providesTags: ['Search'],
    }),

    /** Листинги внутри нарисованной территории (ST_Within, TASK-193). */
    searchByPolygon: build.query<Listing[], PolygonSearchArgs>({
      query: ({ points, filter = {}, limit = 100 }) =>
        polygonSearchPath(filter, points, limit),
      transformResponse: (env: SearchEnvelope) => env.data.map(mapListing),
      providesTags: ['Search'],
    }),

    /** Дозагрузка следующей keyset-страницы выдачи /search (TASK-199). */
    searchPage: build.query<SearchListingsPage, SearchPageArgs>({
      query: ({ cursor, filter = {}, limit = 24 }) =>
        searchPagePath(filter, limit, cursor),
      transformResponse: (env: SearchEnvelope) => ({
        listings: env.data.map(mapListing),
        total: env.meta.total,
        nextCursor: env.meta.next_cursor,
      }),
      providesTags: ['Search'],
    }),
  }),
  overrideExisting: false,
});
```

Интерфейсы `BoundsSearchArgs`/`PolygonSearchArgs`/`SearchPageArgs` и экспорт
хуков не меняются. Проверить руками, что `toApiSort` больше не импортируется
(если не используется — убрать из импорта; eslint клиента unused imports НЕ ловит).

- [ ] **Step 5: Тесты зелёные + типы**

Run: `pnpm --filter @avino/client test -- run src/lib/api/search-paths.test.ts && pnpm exec tsc --noEmit -p apps/client`
Expected: PASS; tsc без ошибок.

- [ ] **Step 6: Commit** (контроллер)

```bash
git add apps/client/src/lib/api/listings.ts apps/client/src/store/api/searchApi.ts apps/client/src/lib/api/search-paths.test.ts
git commit -m "fix(client): pass full phase-2 filters to geo search endpoints, add SSR bounds fetch"
```

---

### Task 3: MapView — жест пользователя + initialBounds

Без юнит-тестов (обёртка над ymaps): проверяется tsc + существующие тесты +
живая верификация в Task 7.

**Files:**
- Modify: `apps/client/src/features/map/MapView.tsx`

**Interfaces:**
- Produces (используют Tasks 5–7):
  - `onBoundsChange?: (bounds: LatLngBounds, meta: { user: boolean }) => void` — `meta.user=true`, если изменению области предшествовал жест пользователя (drag/wheel/клик по контролам зума); флаг потребляется на каждом эмите.
  - Новый проп `initialBounds?: LatLngBounds | null` — вид карты по bbox после создания (SSR-восстановление); только начальное значение.

- [ ] **Step 1: Обновить пропсы и jsdoc**

В `MapViewProps`:

```ts
  /** Видимая область карты (debounce). Эмитится только без активного draw/polygon.
   *  meta.user=true — изменению предшествовал жест пользователя (drag/wheel/зум-контролы),
   *  false — программный setBounds (autoFit, initialBounds, оверлеи). */
  onBoundsChange?: (bounds: LatLngBounds, meta: { user: boolean }) => void;

  /** Начальная область (SSR-восстановление ?sw_lat=…): map.setBounds после
   *  создания вместо center/zoom. Читается один раз. */
  initialBounds?: LatLngBounds | null;
```

В сигнатуре компонента добавить `initialBounds = null` в деструктуризацию.

- [ ] **Step 2: Рефы жеста и initialBounds**

Рядом с существующими refs (после `drawModeRef`):

```ts
  // Жест пользователя: взводится DOM-событиями контейнера, потребляется на
  // каждом эмите bounds и сбрасывается перед программными setBounds.
  const userGestureRef = React.useRef(false);
  // Начальная область — только на создание карты.
  const initialBoundsRef = React.useRef(initialBounds ?? null);
```

- [ ] **Step 3: Init-эффект — setBounds по initialBounds + DOM-слушатели жеста + meta в эмите**

В init-эффекте после `clustererRef.current = clusterer;` добавить:

```ts
    // SSR-восстановление области (?sw_lat=…): вид по bbox вместо center/zoom.
    if (initialBoundsRef.current) {
      const ib = initialBoundsRef.current;
      userGestureRef.current = false;
      try {
        map.setBounds(
          [[ib.swLat, ib.swLng], [ib.neLat, ib.neLng]],
          { checkZoomRange: true },
        );
      } catch {
        /* некорректный bbox — остаёмся на center/zoom */
      }
    }
```

`emitBounds` заменить на (потребление флага):

```ts
    const emitBounds = () => {
      if (drawModeRef.current || polygonRef.current) return;
      const b = map.getBounds(); // [[swLat,swLng],[neLat,neLng]]
      if (!b) return;
      const user = userGestureRef.current;
      userGestureRef.current = false; // флаг одноразовый — потребляем на эмите
      cb.current.onBoundsChange?.(
        { swLat: b[0][0], swLng: b[0][1], neLat: b[1][0], neLng: b[1][1] },
        { user },
      );
    };
```

После блока `map.events.add('boundschange', ...)` добавить DOM-слушатели
(контейнер содержит и полотно карты, и контролы зума):

```ts
    // ── Детект жеста: drag (pointerdown+move>3px), wheel, клик по контролам
    // карты (зум/дабл-клик). Клик по ценовому пину (.av-ypin) жестом НЕ считается
    // — это onSelect, области не меняет. Capture-фаза: ymaps глушит bubbling.
    const gestureEl = elRef.current;
    let downXY: [number, number] | null = null;
    const onPointerDown = (e: PointerEvent) => {
      downXY = [e.clientX, e.clientY];
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!downXY) return;
      if (Math.abs(e.clientX - downXY[0]) + Math.abs(e.clientY - downXY[1]) > 3) {
        userGestureRef.current = true;
      }
    };
    const onPointerUp = () => {
      downXY = null;
    };
    const onWheel = () => {
      userGestureRef.current = true;
    };
    const onContainerClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.('.av-ypin')) {
        userGestureRef.current = true;
      }
    };
    gestureEl?.addEventListener('pointerdown', onPointerDown, true);
    gestureEl?.addEventListener('pointermove', onPointerMove, true);
    gestureEl?.addEventListener('pointerup', onPointerUp, true);
    gestureEl?.addEventListener('wheel', onWheel, { capture: true, passive: true });
    gestureEl?.addEventListener('click', onContainerClick, true);
```

В cleanup init-эффекта (перед `map.destroy()`):

```ts
      gestureEl?.removeEventListener('pointerdown', onPointerDown, true);
      gestureEl?.removeEventListener('pointermove', onPointerMove, true);
      gestureEl?.removeEventListener('pointerup', onPointerUp, true);
      gestureEl?.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
      gestureEl?.removeEventListener('click', onContainerClick, true);
```

- [ ] **Step 4: Сброс флага перед программными setBounds**

В эффекте маркеров (autoFit-ветка) — строкой ПЕРЕД `map.setBounds(clusterer.getBounds(), ...)`:

```ts
        userGestureRef.current = false; // программный автоподгон — не жест
```

В оверлей-эффекте — перед ОБОИМИ `map.setBounds(...)` (circle и polygon ветки):

```ts
      userGestureRef.current = false;
```

- [ ] **Step 5: Проверка типов и тестов**

Run: `pnpm exec tsc --noEmit -p apps/client && pnpm --filter @avino/client test -- run`
Expected: tsc чисто; тесты зелёные (кроме известных 2 LoginModal). Существующий
потребитель `MapSearch.handleBoundsChange(b: LatLngBounds)` совместим (второй
аргумент игнорируется).

- [ ] **Step 6: Commit** (контроллер)

```bash
git add apps/client/src/features/map/MapView.tsx
git commit -m "feat(client): MapView user-gesture flag and initialBounds restore"
```

---

### Task 4: MapPreviewCard — общий оверлей превью пина

**Files:**
- Create: `apps/client/src/features/map/MapPreviewCard.tsx`
- Test: `apps/client/src/features/map/MapPreviewCard.test.tsx`

**Interfaces:**
- Consumes: `PropertyCard` (`@/features/search/PropertyCard`), i18n-ключ `search.map.preview.close` (существует).
- Produces (используют Tasks 6–7): `MapPreviewCard({ listing: Listing; onClose: () => void })` — absolute-оверлей, позиционируется относительно ближайшего `relative`-родителя (контейнер карты).

- [ ] **Step 1: Написать падающий тест**

Создать `apps/client/src/features/map/MapPreviewCard.test.tsx`:

```tsx
/**
 * Тесты MapPreviewCard — превью объявления поверх карты (клик по пину).
 * PropertyCard мокируется: здесь проверяем только оболочку (рендер + закрытие).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapPreviewCard } from './MapPreviewCard';
import type { Listing } from '@/lib/mock/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/features/search/PropertyCard', () => ({
  PropertyCard: ({ listing }: { listing: Listing }) => (
    <div data-testid="property-card">{listing.id}</div>
  ),
}));

const listing = { id: 'l1' } as unknown as Listing;

describe('MapPreviewCard', () => {
  it('рендерит PropertyCard выбранного листинга', () => {
    render(<MapPreviewCard listing={listing} onClose={() => {}} />);
    expect(screen.getByTestId('property-card')).toHaveTextContent('l1');
  });

  it('кнопка ✕ вызывает onClose', () => {
    const onClose = vi.fn();
    render(<MapPreviewCard listing={listing} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('map.preview.close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @avino/client test -- run src/features/map/MapPreviewCard.test.tsx`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация `MapPreviewCard.tsx`**

Разметка 1:1 повторяет текущий инлайн-блок превью из MapSearch.tsx:206-221
(поведение /map не меняется):

```tsx
/**
 * MapPreviewCard — превью объявления поверх карты (клик по ценовому пину,
 * Zillow-стиль). Общий для /map (MapSearch) и /search (SearchResults).
 *
 * Сама карточка — обычный PropertyCard (= Link на /listing/[id]): клик по ней
 * перехватывается слотом @modal и открывает ListingModal поверх выдачи.
 * Позиционируется absolute у нижнего края ближайшего relative-родителя
 * (контейнер карты).
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { PropertyCard } from '@/features/search/PropertyCard';
import type { Listing } from '@/lib/mock/types';

export interface MapPreviewCardProps {
  listing: Listing;
  onClose: () => void;
}

export function MapPreviewCard({ listing, onClose }: MapPreviewCardProps) {
  const t = useTranslations('search');
  return (
    <div className="absolute bottom-4 left-3 right-3 z-[1000] mx-auto max-w-sm sm:left-4 sm:right-auto">
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('map.preview.close')}
          className="absolute -right-2 -top-2 z-[1] grid h-7 w-7 place-items-center rounded-full bg-ink text-white shadow-raised"
        >
          <X size={15} strokeWidth={2.4} />
        </button>
        <PropertyCard listing={listing} className="bg-surface shadow-raised" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Тест зелёный**

Run: `pnpm --filter @avino/client test -- run src/features/map/MapPreviewCard.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit** (контроллер)

```bash
git add apps/client/src/features/map/MapPreviewCard.tsx apps/client/src/features/map/MapPreviewCard.test.tsx
git commit -m "feat(client): shared MapPreviewCard overlay for map pin preview"
```

---

### Task 5: useViewportSearch — общий хук viewport-режима

**Files:**
- Create: `apps/client/src/features/map/useViewportSearch.ts`
- Test: `apps/client/src/features/map/useViewportSearch.test.tsx`

**Interfaces:**
- Consumes: `useLazySearchByBoundsQuery` (Task 2, сигнатура `trigger({ bounds, filter, limit }) → { unwrap(): Promise<Listing[]> }`), `isValidBounds`, `setBoundsParams`, `BBOX_PARAM_KEYS`, `LatLngBounds` (Task 1).
- Produces (используют Tasks 6–7):

```ts
export interface ViewportSearchOptions {
  mode: 'always' | 'gesture';
  filter: ListingFilter;
  geoFilterActive?: boolean;
  polygonActive?: boolean;
  syncUrl?: boolean;
  initialBounds?: LatLngBounds | null;
}
export interface ViewportSearch {
  active: boolean;
  listings: Listing[] | null;
  isFetching: boolean;
  handleBoundsChange: (b: LatLngBounds, meta?: { user: boolean }) => void;
  refetchLastBounds: () => void;
  previewId: string | null;
  openPreview: (id: string) => void;
  closePreview: () => void;
}
export function useViewportSearch(opts: ViewportSearchOptions): ViewportSearch;
```

- [ ] **Step 1: Написать падающий тест**

Создать `apps/client/src/features/map/useViewportSearch.test.tsx`:

```tsx
/**
 * Тесты useViewportSearch — гео-приоритет Zillow: полигон > район/регион >
 * viewport; активация по жесту ('gesture') либо всегда ('always'); зеркало
 * bbox в URL (history.replaceState) при syncUrl.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useViewportSearch } from './useViewportSearch';
import type { LatLngBounds } from '@/lib/geo';
import type { Listing } from '@/lib/mock/types';

const listing = { id: 'l1' } as unknown as Listing;
const trigger = vi.fn(() => ({ unwrap: () => Promise.resolve([listing]) }));

vi.mock('@/store/api/searchApi', () => ({
  useLazySearchByBoundsQuery: () => [trigger, { isFetching: false }],
}));

const B: LatLngBounds = { swLat: 41.2, swLng: 69.1, neLat: 41.4, neLng: 69.4 };

beforeEach(() => {
  trigger.mockClear();
  window.history.replaceState(null, '', '/search?tx=SALE');
});

describe('useViewportSearch (gesture, /search)', () => {
  const opts = { mode: 'gesture' as const, filter: { tx: 'SALE' as const } };

  it('программный bounds до активации — игнор', () => {
    const { result } = renderHook(() => useViewportSearch(opts));
    act(() => result.current.handleBoundsChange(B, { user: false }));
    expect(trigger).not.toHaveBeenCalled();
    expect(result.current.active).toBe(false);
  });

  it('жест пользователя активирует режим и грузит bounds-выдачу', async () => {
    const { result } = renderHook(() => useViewportSearch(opts));
    act(() => result.current.handleBoundsChange(B, { user: true }));
    expect(result.current.active).toBe(true);
    expect(trigger).toHaveBeenCalledWith({ bounds: B, filter: { tx: 'SALE' }, limit: 100 });
    await waitFor(() => expect(result.current.listings).toEqual([listing]));
  });

  it('активный гео-фильтр глушит жест (Zillow boundary)', () => {
    const { result } = renderHook(() =>
      useViewportSearch({ ...opts, geoFilterActive: true }),
    );
    act(() => result.current.handleBoundsChange(B, { user: true }));
    expect(trigger).not.toHaveBeenCalled();
    expect(result.current.active).toBe(false);
  });

  it('активный полигон глушит жест', () => {
    const { result } = renderHook(() =>
      useViewportSearch({ ...opts, polygonActive: true }),
    );
    act(() => result.current.handleBoundsChange(B, { user: true }));
    expect(trigger).not.toHaveBeenCalled();
  });

  it('initialBounds (SSR) — режим активен со старта', () => {
    const { result } = renderHook(() =>
      useViewportSearch({ ...opts, initialBounds: B }),
    );
    expect(result.current.active).toBe(true);
  });

  it('появление гео-фильтра деактивирует режим и чистит bbox из URL', async () => {
    window.history.replaceState(null, '', '/search?tx=SALE&sw_lat=41.2&sw_lng=69.1&ne_lat=41.4&ne_lng=69.4');
    const { result, rerender } = renderHook(
      (p: { geo: boolean }) =>
        useViewportSearch({ ...opts, syncUrl: true, initialBounds: B, geoFilterActive: p.geo }),
      { initialProps: { geo: false } },
    );
    expect(result.current.active).toBe(true);
    rerender({ geo: true });
    await waitFor(() => expect(result.current.active).toBe(false));
    expect(window.location.search).not.toContain('sw_lat');
  });

  it('syncUrl: успешный bounds-запрос пишет bbox в URL', async () => {
    const { result } = renderHook(() => useViewportSearch({ ...opts, syncUrl: true }));
    act(() => result.current.handleBoundsChange(B, { user: true }));
    await waitFor(() => expect(window.location.search).toContain('sw_lat=41.2'));
    expect(window.location.search).toContain('tx=SALE'); // фильтры не потеряны
  });

  it('смена фильтра при активном режиме перезапрашивает последнюю область', async () => {
    const { result, rerender } = renderHook(
      (p: { filter: { tx: 'SALE' | 'RENT' } }) =>
        useViewportSearch({ mode: 'gesture', filter: p.filter }),
      { initialProps: { filter: { tx: 'SALE' as const } } },
    );
    act(() => result.current.handleBoundsChange(B, { user: true }));
    await waitFor(() => expect(result.current.listings).toEqual([listing]));
    trigger.mockClear();
    rerender({ filter: { tx: 'RENT' as const } });
    await waitFor(() =>
      expect(trigger).toHaveBeenCalledWith({ bounds: B, filter: { tx: 'RENT' }, limit: 100 }),
    );
  });
});

describe('useViewportSearch (always, /map)', () => {
  it('программный bounds тоже грузит выдачу (стартовый эмит /map)', async () => {
    const { result } = renderHook(() =>
      useViewportSearch({ mode: 'always', filter: {} }),
    );
    act(() => result.current.handleBoundsChange(B, { user: false }));
    expect(trigger).toHaveBeenCalled();
    await waitFor(() => expect(result.current.listings).toEqual([listing]));
  });

  it('refetchLastBounds повторяет запрос по последней области (сброс территории)', async () => {
    const { result, rerender } = renderHook(
      (p: { poly: boolean }) =>
        useViewportSearch({ mode: 'always', filter: {}, polygonActive: p.poly }),
      { initialProps: { poly: false } },
    );
    act(() => result.current.handleBoundsChange(B, { user: false }));
    await waitFor(() => expect(result.current.listings).toEqual([listing]));
    rerender({ poly: true });
    act(() => result.current.handleBoundsChange({ ...B, neLat: 41.5 }, { user: true }));
    trigger.mockClear();
    rerender({ poly: false });
    act(() => result.current.refetchLastBounds());
    expect(trigger).toHaveBeenCalledWith({
      bounds: { ...B, neLat: 41.5 },
      filter: {},
      limit: 100,
    });
  });

  it('превью: openPreview/closePreview', () => {
    const { result } = renderHook(() => useViewportSearch({ mode: 'always', filter: {} }));
    act(() => result.current.openPreview('l9'));
    expect(result.current.previewId).toBe('l9');
    act(() => result.current.closePreview());
    expect(result.current.previewId).toBe(null);
  });
});
```

Примечание: `handleBoundsChange` запоминает `lastBounds` ДАЖЕ при активном
полигоне (см. тест refetchLastBounds) — только запрос глушится.

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @avino/client test -- run src/features/map/useViewportSearch.test.tsx`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация `useViewportSearch.ts`**

```ts
/**
 * useViewportSearch — «список = видимая область карты» (Zillow-режим).
 *
 * Общий контроллер для /search (mode='gesture': активация первым жестом
 * пользователя) и /map (mode='always': любой bounds грузит выдачу, включая
 * стартовый эмит MapView). Гео-приоритет как у Zillow:
 *   полигон-территория > явный гео-фильтр (район/регион) > viewport.
 * Пока полигон или гео-фильтр активны — движение карты выдачу НЕ меняет.
 *
 * При syncUrl bbox зеркалится в URL shallow-обновлением history.replaceState
 * (НЕ router.replace — тот дёргает серверный ре-рендер RSC на каждый пан);
 * SSR /search читает эти параметры и восстанавливает область (initialBounds).
 * Смена не-гео фильтров при активном режиме перезапрашивает последнюю область
 * клиентски (FilterBar пересобирает URL без bbox — режим живёт в состоянии).
 */
'use client';

import * as React from 'react';
import {
  isValidBounds,
  setBoundsParams,
  BBOX_PARAM_KEYS,
  type LatLngBounds,
} from '@/lib/geo';
import { useLazySearchByBoundsQuery } from '@/store/api/searchApi';
import type { Listing, ListingFilter } from '@/lib/mock/types';

export interface ViewportSearchOptions {
  /** 'always' — /map: любой bounds грузит выдачу; 'gesture' — /search:
   *  активация только жестом пользователя (meta.user из MapView). */
  mode: 'always' | 'gesture';
  /** Не-гео фильтры §9 — прокидываются в /search/bounds. */
  filter: ListingFilter;
  /** Явный гео-фильтр (район/регион) активен → viewport глушится (Zillow). */
  geoFilterActive?: boolean;
  /** Территория активна → bounds-запросы глушатся (полигон приоритетнее). */
  polygonActive?: boolean;
  /** Зеркалить bbox в URL (history.replaceState). Только /search. */
  syncUrl?: boolean;
  /** SSR-восстановленная область (?sw_lat=…) — режим активен со старта. */
  initialBounds?: LatLngBounds | null;
}

export interface ViewportSearch {
  /** Активен ли viewport-режим (для 'always' — всегда true). */
  active: boolean;
  /** Выдача последнего bounds-запроса; null — запросов ещё не было. */
  listings: Listing[] | null;
  isFetching: boolean;
  /** Колбэк для MapView.onBoundsChange. */
  handleBoundsChange: (b: LatLngBounds, meta?: { user: boolean }) => void;
  /** Повторить запрос по последней области (сброс территории на /map). */
  refetchLastBounds: () => void;
  /** Превью пина (клик по маркеру). */
  previewId: string | null;
  openPreview: (id: string) => void;
  closePreview: () => void;
}

/** Убирает bbox-параметры из текущего URL (shallow). */
function clearBboxFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!BBOX_PARAM_KEYS.some((k) => url.searchParams.has(k))) return;
  for (const k of BBOX_PARAM_KEYS) url.searchParams.delete(k);
  window.history.replaceState(window.history.state, '', url);
}

export function useViewportSearch({
  mode,
  filter,
  geoFilterActive = false,
  polygonActive = false,
  syncUrl = false,
  initialBounds = null,
}: ViewportSearchOptions): ViewportSearch {
  const [active, setActive] = React.useState(
    mode === 'always' || Boolean(initialBounds),
  );
  const [listings, setListings] = React.useState<Listing[] | null>(null);
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [trigger, { isFetching }] = useLazySearchByBoundsQuery();

  const lastBoundsRef = React.useRef<LatLngBounds | null>(initialBounds);
  // Свежий фильтр в ref: runBounds стабилен, эффект смены фильтра — отдельный.
  const filterRef = React.useRef(filter);
  filterRef.current = filter;
  const filterKey = JSON.stringify(filter);

  const runBounds = React.useCallback(
    (b: LatLngBounds) => {
      if (!isValidBounds(b)) return;
      trigger({ bounds: b, filter: filterRef.current, limit: 100 })
        .unwrap()
        .then((res) => {
          setListings(res);
          if (syncUrl && typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            setBoundsParams(url.searchParams, b);
            window.history.replaceState(window.history.state, '', url);
          }
        })
        .catch(() => {
          /* сеть/5xx — оставляем прежнюю выдачу (toast покажет мидлварь) */
        });
    },
    [trigger, syncUrl],
  );

  const handleBoundsChange = React.useCallback(
    (b: LatLngBounds, meta?: { user: boolean }) => {
      lastBoundsRef.current = b; // помним область даже под полигоном/фильтром
      if (polygonActive || geoFilterActive) return;
      if (mode === 'gesture' && !active && !meta?.user) return;
      if (!active) setActive(true);
      runBounds(b);
    },
    [polygonActive, geoFilterActive, mode, active, runBounds],
  );

  const refetchLastBounds = React.useCallback(() => {
    if (lastBoundsRef.current) runBounds(lastBoundsRef.current);
  }, [runBounds]);

  // Появился явный гео-фильтр → выходим из viewport-режима (Zillow: boundary
  // главнее) и чистим bbox из URL.
  React.useEffect(() => {
    if (mode !== 'gesture' || !geoFilterActive) return;
    setActive(false);
    setListings(null);
    if (syncUrl) clearBboxFromUrl();
  }, [geoFilterActive, mode, syncUrl]);

  // Смена не-гео фильтров при активном режиме → перезапрос последней области.
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (active && !polygonActive && !geoFilterActive && lastBoundsRef.current) {
      runBounds(lastBoundsRef.current);
    }
    // Только filterKey: остальное — снимок условий на момент смены фильтра.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const openPreview = React.useCallback((id: string) => setPreviewId(id), []);
  const closePreview = React.useCallback(() => setPreviewId(null), []);

  return {
    active,
    listings,
    isFetching,
    handleBoundsChange,
    refetchLastBounds,
    previewId,
    openPreview,
    closePreview,
  };
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @avino/client test -- run src/features/map/useViewportSearch.test.tsx`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit** (контроллер)

```bash
git add apps/client/src/features/map/useViewportSearch.ts apps/client/src/features/map/useViewportSearch.test.tsx
git commit -m "feat(client): useViewportSearch hook — Zillow viewport mode with geo-priority"
```

---

### Task 6: /search — viewport-режим, превью пина, SSR bbox

Интеграция; юнит-тесты покрыты Tasks 1/2/4/5, здесь — tsc + полный тестовый
прогон + живая верификация в Task 8.

**Files:**
- Modify: `apps/client/src/features/search/SearchResults.tsx`
- Modify: `apps/client/src/app/[locale]/search/page.tsx`

**Interfaces:**
- Consumes: `useViewportSearch` (Task 5), `MapPreviewCard` (Task 4), `parseBoundsParams` (Task 1), `searchListingsByBounds` (Task 2), `MapView.initialBounds`/`meta.user` (Task 3).
- Produces: новый проп `SearchResultsProps.initialBounds?: LatLngBounds | null`.

- [ ] **Step 1: `SearchResults.tsx` — подключение хука**

Импорты добавить:

```ts
import { MapPreviewCard } from '@/features/map/MapPreviewCard';
import { useViewportSearch } from '@/features/map/useViewportSearch';
import { serializePolygonRing, type LatLng, type LatLngBounds } from '@/lib/geo';
```

В `SearchResultsProps` добавить:

```ts
  /** SSR-восстановленная область карты (?sw_lat=…) — стартуем в viewport-режиме. */
  initialBounds?: LatLngBounds | null;
```

В теле компонента (после `filterWithCurrency`, рядом с polygon-состоянием):

```ts
  // ── Viewport-режим (Zillow): список = видимая область карты ──
  // Активен только без явного гео-фильтра и территории; активация — жестом
  // пользователя на карте (или сразу, если SSR восстановил bbox из URL).
  const geoFilterActive = Boolean(filter.districtId || filter.regionId);
  const vp = useViewportSearch({
    mode: 'gesture',
    filter: filterWithCurrency,
    geoFilterActive,
    polygonActive: Boolean(points),
    syncUrl: true,
    initialBounds,
  });
```

`initialBounds` добавить в деструктуризацию пропсов (`initialBounds = null`).

- [ ] **Step 2: `SearchResults.tsx` — выдача/счётчик/«Показать ещё»**

Заменить блок вычислений `displayed/shownCount/totalCount/hasMore` (строки 145-152) на:

```ts
  // Выдача по фильтрам = SSR-страница + докуданные; по территории — полигон;
  // в viewport-режиме — bounds-выдача (до первого ответа — SSR-страница:
  // при SSR-восстановлении bbox она уже посчитана по bounds).
  const paged = React.useMemo(() => [...listings, ...extra], [listings, extra]);
  const displayed = points
    ? polygonData ?? []
    : vp.active
      ? vp.listings ?? paged
      : paged;

  // Viewport-режим: один запрос (limit=100), список раскрывается локальными
  // батчами по 24 без сети (маркеры при этом видят весь набор).
  const [visibleCount, setVisibleCount] = React.useState(24);
  React.useEffect(() => {
    setVisibleCount(24);
  }, [vp.listings]);
  const listShown = vp.active && !points ? displayed.slice(0, visibleCount) : displayed;

  const shownCount = listShown.length;
  const totalCount = points || vp.active ? displayed.length : totalAll;
  const hasMore = points
    ? false
    : vp.active
      ? visibleCount < displayed.length
      : cursor != null;
  const busy = Boolean(loading) || isFetching;
  const onShowMore = vp.active
    ? () => setVisibleCount((c) => c + 24)
    : loadMore;
```

В счётчике в шапке (`{busy ? ... : polygon ? ... : ...}`) заменить финальную
ветку `t('results.count', { count: totalCount })` на:

```tsx
                : vp.active && vp.isFetching
                  ? tCommon('loading')
                  : t('results.count', { count: totalCount })
```

В кнопке «Показать ещё» (блок строк 312-326): `onClick={onShowMore}`, условие
блока — `hasMore` уже посчитан выше (заменить `!busy && shownCount > 0 && hasMore`
оставить как есть, только `onClick={loadMore}` → `onClick={onShowMore}`,
`disabled={loadingMore}` оставить — в viewport-режиме `loadingMore` не
взводится, кнопка активна).

В сетке карточек списка заменить `displayed.map((l) => (` на `listShown.map((l) => (`.

- [ ] **Step 3: `SearchResults.tsx` — MapView-пропсы и превью**

Блок `<MapView ... />` (строки 181-192) заменить на:

```tsx
        <MapView
          listings={displayed}
          activeId={activeId}
          onSelect={(id) => {
            setActiveId(id);
            vp.openPreview(id);
          }}
          onHover={setActiveId}
          locale={locale}
          polygon={polygon}
          drawMode={drawing ? 'polygon' : null}
          onPolygonComplete={handlePolygonComplete}
          onBoundsChange={vp.handleBoundsChange}
          initialBounds={initialBounds}
          autoFit={!vp.active}
          recenterOnHover={recenterOnHover}
        />
```

После закрывающего `</div>` блока «Управление территорией» (перед закрытием
контейнера карты, после строки 235) добавить превью:

```tsx
        {/* ---- Превью карточки по клику на пин (Zillow) ---- */}
        {(() => {
          const preview = vp.previewId
            ? displayed.find((l) => l.id === vp.previewId) ?? null
            : null;
          return preview ? (
            <MapPreviewCard listing={preview} onClose={vp.closePreview} />
          ) : null;
        })()}
```

В `startDraw` добавить закрытие превью:

```ts
  const startDraw = () => {
    setPolygon(null);
    vp.closePreview();
    setDrawing(true);
  };
```

Пустая viewport-выдача: в ветке `shownCount === 0` (строки 270-290) условие
`polygon ? ... : ...` расширить:

```tsx
        ) : shownCount === 0 ? (
          polygon ? (
            <EmptyState
              title={t('map.emptyArea')}
              action={
                <Button variant="outline" onClick={clearTerritory}>
                  {t('map.clear')}
                </Button>
              }
            />
          ) : vp.active ? (
            <EmptyState title={t('map.emptyArea')} />
          ) : (
            <EmptyState
              title={t('results.emptyTitle')}
              ...без изменений...
            />
          )
        ) : (
```

- [ ] **Step 4: `search/page.tsx` — SSR bbox**

Импорты:

```ts
import { searchListingsPage, searchListingsByBounds, type SearchListingsPage } from '@/lib/api/listings';
import { parseBoundsParams } from '@/lib/geo';
```

В `generateMetadata` — bbox-URL не индексируем: в условие `isLongTail` добавить
`sp.sw_lat ||` (первым в списке после `Boolean(`).

В теле `SearchPage` после сборки `filter` (строка ~250) добавить:

```ts
  // Viewport-режим (Zillow): bbox из URL восстанавливает область карты и выдачу.
  // Явный гео-фильтр главнее bbox (bbox игнорируется — как boundary у Zillow).
  const initialBounds =
    !districtId && !regionId
      ? parseBoundsParams(
          first(sp.sw_lat),
          first(sp.sw_lng),
          first(sp.ne_lat),
          first(sp.ne_lng),
        )
      : null;
```

Заменить загрузку `page`:

```ts
  const [page, districts, regions] = await Promise.all([
    initialBounds
      ? searchListingsByBounds(filter, initialBounds, locale, 100).then(
          (listings): SearchListingsPage => ({
            listings,
            total: listings.length,
            nextCursor: null,
          }),
        )
      : searchListingsPage(filter, locale),
    getDistricts(locale),
    getRegions(locale),
  ]);
```

Проверить, что `SearchListingsPage` экспортируется из listings.ts (да, строка 381).

В JSX прокинуть в SearchResults:

```tsx
      <SearchResults
        listings={page.listings}
        total={page.total}
        initialCursor={page.nextCursor}
        view={view}
        heading={heading}
        filter={filter}
        initialBounds={initialBounds}
      />
```

- [ ] **Step 5: Типы + полный тестовый прогон**

Run: `pnpm exec tsc --noEmit -p apps/client && pnpm --filter @avino/client test -- run && pnpm --filter @avino/client lint`
Expected: tsc чисто; тесты зелёные (кроме известных 2 LoginModal); lint чисто.

- [ ] **Step 6: Commit** (контроллер)

```bash
git add apps/client/src/features/search/SearchResults.tsx "apps/client/src/app/[locale]/search/page.tsx"
git commit -m "feat(client): Zillow viewport search on /search — map-driven list, pin preview, bbox in URL"
```

---

### Task 7: /map — унификация на общий хук и MapPreviewCard

Поведение /map НЕ меняется (там всё уже работало) — чистый рефакторинг на
общие куски. Проверка: tsc + тесты + живая верификация Task 8.

**Files:**
- Modify: `apps/client/src/features/map/MapSearch.tsx`

**Interfaces:**
- Consumes: `useViewportSearch` (mode='always', syncUrl=false), `MapPreviewCard`.

- [ ] **Step 1: Рефакторинг MapSearch**

Изменения (остальной файл без правок):

1. Импорты: убрать `X` из lucide (используется только в превью и кнопке отмены
   рисования — ВНИМАНИЕ: `X` нужен кнопке «Отмена» рисования, оставить!);
   убрать `useLazySearchByBoundsQuery` и `isValidBounds` (переезжают в хук),
   добавить:

```ts
import { MapPreviewCard } from '@/features/map/MapPreviewCard';
import { useViewportSearch } from '@/features/map/useViewportSearch';
```

2. Заменить состояние/запросы (строки 58-93). Было: `raw`, `previewId`,
   `triggerBounds`, `lastBoundsRef`, `runBounds`, `handleBoundsChange`. Стало:

```ts
  // raw — выдача территории (polygon); bounds-выдачей владеет useViewportSearch.
  const [raw, setRaw] = React.useState<Listing[]>(initialListings);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [drawing, setDrawing] = React.useState(false);
  const [polygon, setPolygon] = React.useState<LatLng[] | null>(null);
  const [mobView, setMobView] = React.useState<'list' | 'map'>('list');

  const [triggerPolygon, { isFetching: fetchingPolygon }] = useLazySearchByPolygonQuery();

  // Viewport-режим /map: всегда активен (стартовый эмит MapView грузит первую
  // область), территория приоритетнее bounds.
  const vp = useViewportSearch({
    mode: 'always',
    filter,
    polygonActive: Boolean(polygon),
  });
  const isFetching = fetchingPolygon || vp.isFetching;
```

3. `handlePolygonComplete`: заменить `setPreviewId(null)` на `vp.closePreview()`
   (остальное без изменений).

4. `displayed` и территория:

```ts
  // Серверная фильтрация (ST_Within / bbox): территория — raw, иначе выдача
  // видимой области из хука (до первого ответа — SSR-стартовая).
  const displayed = polygon ? raw : vp.listings ?? initialListings;

  const startDraw = () => {
    setPolygon(null);
    vp.closePreview();
    setDrawing(true);
  };
  const cancelDraw = () => setDrawing(false);
  // Сброс территории → возвращаемся к выдаче текущей видимой области.
  const clearTerritory = () => {
    setPolygon(null);
    vp.refetchLastBounds();
  };

  const handleSelect = (id: string) => {
    setActiveId(id);
    vp.openPreview(id);
  };

  const preview = vp.previewId
    ? displayed.find((l) => l.id === vp.previewId) ?? raw.find((l) => l.id === vp.previewId) ?? null
    : null;
  const total = displayed.length;
```

5. `<MapView ... onBoundsChange={handleBoundsChange} ... />` →
   `onBoundsChange={vp.handleBoundsChange}` (остальные пропсы без изменений).

6. Инлайн-блок превью (строки 206-221) заменить на:

```tsx
        {/* ---- Превью карточки по клику на пин ---- */}
        {preview && <MapPreviewCard listing={preview} onClose={vp.closePreview} />}
```

7. Убедиться, что import `PropertyCard` всё ещё нужен (список справа его
   использует — да, оставить); `X` остаётся для кнопки отмены рисования.

- [ ] **Step 2: Типы + тесты + lint**

Run: `pnpm exec tsc --noEmit -p apps/client && pnpm --filter @avino/client test -- run && pnpm --filter @avino/client lint`
Expected: чисто (кроме известных 2 LoginModal). Руками проверить отсутствие
неиспользуемых импортов в MapSearch.tsx (eslint клиента их не ловит).

- [ ] **Step 3: Commit** (контроллер)

```bash
git add apps/client/src/features/map/MapSearch.tsx
git commit -m "refactor(client): unify /map on useViewportSearch and MapPreviewCard"
```

---

### Task 8: Финальная верификация, ADR, PR

Выполняет контроллер (git, docker, браузер).

**Files:**
- Create: `docs/adr/ADR-XXXX-search-viewport-driven-map.md` (номер = максимальный в `docs/adr/` + 1)

- [ ] **Step 1: Полная проверка**

```bash
pnpm exec tsc --noEmit -p apps/client
pnpm --filter @avino/client test -- run
pnpm --filter @avino/client lint
cd apps/client && pnpm exec next build   # НЕ rtk next build (ложный «Errors: 1»)
```

Expected: всё зелёное (кроме известных 2 LoginModal-фейлов).

- [ ] **Step 2: Живая верификация (docker-стенд + Chrome)**

Поднять стек (`docker compose --profile app up -d --build client` по рецепту
[[avino-local-live-verify-recipe]]), открыть `http://localhost:3001/ru/search` и проверить:

1. Пан/зум карты (без района) → список справа и счётчик обновляются; в URL
   появились `sw_lat…`; refresh со скопированным URL восстанавливает область и выдачу.
2. Выбрать район в фильтре → движение карты список НЕ меняет; bbox исчез из URL;
   снять район → пан снова обновляет список.
3. Нарисовать территорию → пан не влияет; сброс территории → viewport вернулся.
4. Клик по пину → мини-карточка поверх карты; ✕ закрывает; клик по карточке →
   ListingModal поверх выдачи, «назад» возвращает к списку с той же областью.
5. «Показать ещё» в viewport-режиме раскрывает список без сетевых запросов
   (проверить вкладку Network).
6. Фильтр цены при активном viewport → список перезапрошен по той же области.
7. `/ru/map` — поведение прежнее: стартовая выдача, пан обновляет список,
   территория, превью пина, модалка.

- [ ] **Step 3: ADR**

Определить номер: `ls docs/adr | sort | tail -3` → взять следующий. Содержимое:

```markdown
# ADR-XXXX — Viewport-driven поиск на /search (Zillow-режим карты)

## Status

Accepted

## Date

2026-07-04

## Context

На /search карта была пассивной витриной SSR-выдачи: пан/зум не влияли на
список, клик по пину лишь подсвечивал карточку. Пользователи ожидают
Zillow-поведение: список = видимая область карты, клик по пину — превью,
клик по превью — модалка деталей. На /map это уже работало (bounds-поиск,
превью, intercepting-модалка), но логика была приватной для MapSearch.

## Decision

1. Общий хук `features/map/useViewportSearch` (mode 'gesture' для /search,
   'always' для /map) и общий `MapPreviewCard`; /search и /map используют их.
2. Гео-приоритет как у Zillow: полигон-территория > явный гео-фильтр
   (district/region) > viewport. Пока активен полигон/гео-фильтр, движение
   карты выдачу не меняет.
3. Viewport-режим на /search активируется жестом пользователя (MapView
   различает жест и программный setBounds), грузит `GET /api/v1/search/bounds`
   с полным набором фильтров §9, limit=100; список раскрывается локальными
   батчами по 24 (серверный keyset в viewport-режиме не используется).
4. bbox зеркалится в URL (`sw_lat/sw_lng/ne_lat/ne_lng`) shallow
   `history.replaceState`; SSR /search восстанавливает область и выдачу
   (`searchListingsByBounds`); bbox-URL — noindex (long-tail).
5. Попутный фикс: `/search/bounds`, `/search/polygon` и keyset-страницы теперь
   сериализуют фильтры через общий `buildSearchParams` (раньше терялись
   amenities/parking/мультитип/диапазоны Фазы 2).

## Consequences

Positive:
- Идентичное Zillow-поведение на /search и /map из одного кода.
- Шеринг/refresh сохраняют область карты; фильтры Фазы 2 работают в гео-поиске.

Negative / trade-offs:
- Эвристика «жеста» (DOM-события контейнера) — при ложном срабатывании
  возможна нежелательная активация viewport-режима.
- В viewport-режиме счётчик = размер выдачи (cap 100), а не meta.total.

## Related files

- apps/client/src/features/map/useViewportSearch.ts
- apps/client/src/features/map/MapPreviewCard.tsx
- apps/client/src/features/map/MapView.tsx
- apps/client/src/features/map/MapSearch.tsx
- apps/client/src/features/search/SearchResults.tsx
- apps/client/src/app/[locale]/search/page.tsx
- apps/client/src/lib/geo.ts
- apps/client/src/lib/api/listings.ts
- apps/client/src/store/api/searchApi.ts

## Related task

- Спека: docs/superpowers/specs/2026-07-04-search-map-viewport-zillow-design.md
```

- [ ] **Step 4: Commit докам + PR**

```bash
git add docs/adr/ADR-XXXX-search-viewport-driven-map.md docs/superpowers/specs/2026-07-04-search-map-viewport-zillow-design.md docs/superpowers/plans/2026-07-04-search-map-viewport-zillow.md
git commit -m "docs(adr): viewport-driven search on /search (Zillow map mode)"
git push -u origin feature/client-search-map-viewport
```

PR title: `feat(client): Zillow map mode — viewport-driven /search, pin preview card, unified /map`

PR description:
- Что: пан/зум карты на /search обновляет список по видимой области
  (`/search/bounds`, гео-приоритет: территория > район/регион > viewport);
  клик по пину — мини-PropertyCard поверх карты; клик по ней — существующая
  ListingModal; bbox в URL (shallow) + SSR-восстановление; /map переведён на
  общий хук/компонент без изменения поведения.
- Попутный фикс: гео-эндпоинты теперь получают полный набор фильтров Фазы 2.
- Как проверить: см. чек-лист живой верификации в плане (Task 8 Step 2).
- ADR: docs/adr/ADR-XXXX-search-viewport-driven-map.md

Merge — юзер (main protected, [[avino-main-branch-protection]]). DONE.md — батчем в конце дня.
