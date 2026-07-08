# Saved-Search Polygon Alerts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сохранять нарисованную территорию (полигон) в сохранённом поиске и слать алерты только по новым ACTIVE-объявлениям внутри этого контура.

**Architecture:** Полигон хранится в `filters_json.filters.points` в том же сериализованном виде (`lat,lng;lat,lng;…`), который уже используют живой поиск `/search/polygon` (`serializePolygonRing` на клиенте ↔ `parsePolygonRing` на бэке). Бэкенд-матчер `matchNewlyActiveListings` дописывает `ST_Within`-условие, **не трогая общий `buildWhereSql`** (значит ни один живой эндпоинт поиска не задет). Клиент шарит нарисованный полигон между `SearchResults` (рисование) и `FilterBar` (кнопка «Сохранить») через крошечный Redux-слайс `territory`. Клик по сохранённому поиску перезапускает выдачу по скалярам и **территорию заново не рисует** (MVP — `filtersToSearchHref` намеренно игнорирует `points`).

**Tech Stack:** NestJS + Prisma + PostgreSQL/PostGIS (api, Jest); Next.js 15 + RTK Query + Redux Toolkit (client, Vitest).

## Global Constraints

- **Две независимые ветки, бэкенд первым.** Бэкенд можно мёржить отдельно: пока клиент не сохраняет `points`, матчер ведёт себя как раньше (нет ключа → нет условия). Клиент мёржится после/вместе с бэком.
- **Одна app-папка на PR** (CLAUDE.md): PR #1 — только `apps/api`, PR #2 — только `apps/client`.
- **Контроллер владеет git.** При subagent-driven исполнении субагенты НЕ запускают git; коммиты делает контроллер (memory: subagents-shared-workdir-git-hazard).
- **main защищён** — PR открываем, мёржит пользователь; никаких `--admin` (memory: main-branch-protection).
- **Формат полигона неизменен:** строка `lat,lng;lat,lng;…`, ≥3 вершины, lat∈[-90,90], lng∈[-180,180] — единый источник истины `parsePolygonRing` (`apps/api/src/search/dto/polygon-ring.util.ts`).
- **schemaVersion НЕ меняем** (остаётся `1`): `points` — просто новый опциональный ключ внутри `filters`; старые сохранённые поиски остаются валидны.
- **Битый сохранённый полигон → пропуск прогона, НЕ алерты по всему городу.** Невалидный `points` ⇒ матчер возвращает `[]`.
- **i18n:** новые строки добавляются в ru/uz/en parity (no hardcoded user-facing strings).
- **Финализация в фиче-PR:** ADR + подготовка DONE.md кладутся в PR #1 (memory: finalize-in-feature-pr).

## File Structure

**PR #1 — apps/api (бэкенд-матч):**
- Modify: `apps/api/src/search/dto/polygon-ring.util.ts` — добавить чистый хелпер `polygonVerticesFromFilters`.
- Modify: `apps/api/src/search/dto/polygon-ring.spec.ts` — юнит-тесты хелпера.
- Modify: `apps/api/src/search/search.service.ts:666-687` — `matchNewlyActiveListings` дописывает полигон-условие.
- Create: `apps/api/src/search/search.service.match.spec.ts` — поведенческий тест матчера (мок prisma).
- Create: `docs/adr/ADR-00XX-saved-search-polygon-alerts.md` + запись в `docs/DONE.md`.

**PR #2 — apps/client (сохранение + UI):**
- Create: `apps/client/src/store/territorySlice.ts` — слайс `{ points: string | null }`.
- Create: `apps/client/src/store/territorySlice.test.ts` — тест редьюсера.
- Modify: `apps/client/src/store/store.ts:1-17` — зарегистрировать `territory`-редьюсер.
- Modify: `apps/client/src/features/search/SearchResults.tsx:82-92` — зеркалить `points` в Redux.
- Modify: `apps/client/src/features/search/FilterBar.tsx:162-171` — `buildFilters` добавляет `points` из Redux.
- Modify: `apps/client/src/lib/savedSearch.ts:43-97` — бейдж «территория» в `describeFilters`; комментарий «`points` не мапится» в `filtersToSearchHref`.
- Modify: `apps/client/src/lib/savedSearch.test.ts` (или существующий тест) — кейс бейджа.
- Modify: `apps/client/messages/{ru,uz,en}.json` — ключ `savedSearch.territory`.

---

## PHASE 1 — Backend matcher (PR #1, `apps/api`)

### Task 1: Pure helper `polygonVerticesFromFilters`

Извлекает и валидирует полигон из сохранённых фильтров. Три исхода: `undefined` (нет полигона), `null` (полигон есть, но битый → пропуск), `PolygonVertex[]` (валидное кольцо).

**Files:**
- Modify: `apps/api/src/search/dto/polygon-ring.util.ts`
- Test: `apps/api/src/search/dto/polygon-ring.spec.ts`

**Interfaces:**
- Consumes: `parsePolygonRing(raw: string): PolygonVertex[]`, `PolygonVertex` (уже в файле).
- Produces: `polygonVerticesFromFilters(filters: Record<string, unknown>): PolygonVertex[] | null | undefined`.

- [ ] **Step 1: Написать падающие тесты**

В конец `apps/api/src/search/dto/polygon-ring.spec.ts` (внутри файла, рядом с остальными), добавить блок:

```ts
import { polygonVerticesFromFilters } from './polygon-ring.util';

describe('polygonVerticesFromFilters', () => {
  it('returns undefined when no points key', () => {
    expect(polygonVerticesFromFilters({ city_id: 'x' })).toBeUndefined();
  });

  it('returns undefined for empty/blank points', () => {
    expect(polygonVerticesFromFilters({ points: '' })).toBeUndefined();
    expect(polygonVerticesFromFilters({ points: '   ' })).toBeUndefined();
  });

  it('returns undefined for non-string points', () => {
    expect(polygonVerticesFromFilters({ points: 42 })).toBeUndefined();
    expect(polygonVerticesFromFilters({ points: ['a'] })).toBeUndefined();
  });

  it('returns vertices for a valid ring', () => {
    const ring = polygonVerticesFromFilters({
      points: '41.30,69.27;41.31,69.28;41.29,69.29',
    });
    expect(ring).toEqual([
      { lat: 41.3, lng: 69.27 },
      { lat: 41.31, lng: 69.28 },
      { lat: 41.29, lng: 69.29 },
    ]);
  });

  it('returns null for a corrupt ring (fewer than 3 vertices)', () => {
    expect(polygonVerticesFromFilters({ points: '41.30,69.27' })).toBeNull();
  });

  it('returns null for out-of-range coordinates', () => {
    expect(
      polygonVerticesFromFilters({ points: '999,0;0,0;1,1' }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @avino/api test -- polygon-ring`
Expected: FAIL — `polygonVerticesFromFilters is not a function`.

- [ ] **Step 3: Реализовать хелпер**

В конец `apps/api/src/search/dto/polygon-ring.util.ts` добавить:

```ts
/**
 * Достаёт полигон из сохранённых фильтров (`filters_json.filters.points`).
 * Тройной исход:
 *   - `undefined` — ключа `points` нет/пустой/не строка → фильтр по территории не применяем;
 *   - `null` — `points` есть, но кольцо невалидно → вызывающий пропускает прогон
 *     (НЕ рассылаем алерты по всему городу);
 *   - `PolygonVertex[]` — валидное кольцо.
 * Тот же `parsePolygonRing`, что и у `/search/polygon` — расхождение невозможно.
 */
export function polygonVerticesFromFilters(
  filters: Record<string, unknown>,
): PolygonVertex[] | null | undefined {
  const raw = filters.points;
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  try {
    return parsePolygonRing(raw);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Запустить — убедиться, что зелено**

Run: `pnpm --filter @avino/api test -- polygon-ring`
Expected: PASS (все кейсы, включая существующие `parsePolygonRing`).

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/search/dto/polygon-ring.util.ts apps/api/src/search/dto/polygon-ring.spec.ts
git commit -m "feat(search): add polygonVerticesFromFilters helper for saved-search alerts"
```

---

### Task 2: Matcher применяет полигон

`matchNewlyActiveListings` дописывает `ST_Within`-условие, когда в фильтрах валидный полигон; пропускает прогон (возврат `[]`), когда полигон битый; без полигона — поведение как раньше.

**Files:**
- Modify: `apps/api/src/search/search.service.ts:666-687`
- Test: `apps/api/src/search/search.service.match.spec.ts` (создать)

**Interfaces:**
- Consumes: `polygonVerticesFromFilters` (Task 1); приватный `this.polygonSql(vertices)` (`search.service.ts:508`); `Prisma.sql` / `Prisma.empty`.
- Produces: без новых публичных сигнатур — поведение `matchNewlyActiveListings` расширено.

- [ ] **Step 1: Написать падающий тест**

Создать `apps/api/src/search/search.service.match.spec.ts`. Конструктор `SearchService(prisma, translations)` — мок prisma c `$queryRaw`, translations не нужен для матчера.

```ts
import { SearchService } from './search.service';

describe('SearchService.matchNewlyActiveListings (polygon)', () => {
  const since = new Date('2026-06-01T00:00:00.000Z');
  const until = new Date('2026-06-19T00:00:00.000Z');
  let queryRaw: jest.Mock;
  let service: SearchService;

  beforeEach(() => {
    queryRaw = jest.fn().mockResolvedValue([]);
    const prisma = { $queryRaw: queryRaw } as any;
    service = new SearchService(prisma, {} as any);
  });

  it('queries (scalar-only) when no polygon present', async () => {
    await service.matchNewlyActiveListings({ city_id: 'x' }, since, until, 50);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('queries with an ST_Within clause when polygon is valid', async () => {
    await service.matchNewlyActiveListings(
      { points: '41.30,69.27;41.31,69.28;41.29,69.29' },
      since,
      until,
      50,
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sql = queryRaw.mock.calls[0][0] as { strings: string[] };
    expect(sql.strings.join(' ')).toContain('ST_Within');
  });

  it('skips the run (returns [] without querying) when polygon is corrupt', async () => {
    const result = await service.matchNewlyActiveListings(
      { points: '41.30,69.27' },
      since,
      until,
      50,
    );
    expect(result).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @avino/api test -- search.service.match`
Expected: FAIL — `ST_Within`-кейс/`skips`-кейс не проходят (полигон ещё не применяется).

- [ ] **Step 3: Реализовать в `matchNewlyActiveListings`**

Заменить тело метода (`apps/api/src/search/search.service.ts:671-687`). Добавить импорт `polygonVerticesFromFilters` в существующую строку импорта из `./dto/polygon-ring.util` (рядом с `PolygonVertex`, `parsePolygonRing`).

```ts
  async matchNewlyActiveListings(
    filters: Record<string, unknown>,
    publishedAfter: Date,
    publishedUntil: Date,
    limit: number,
  ): Promise<SavedSearchMatch[]> {
    const filterSql = this.buildWhereSql(
      filters as unknown as SearchListingsQueryDto,
    );

    // Территория (TASK saved-search-polygon): валидное кольцо → ST_Within; битое
    // кольцо → пропуск прогона (НЕ алерты по всему городу); нет territory → без гео.
    const ring = polygonVerticesFromFilters(filters);
    if (ring === null) {
      this.logger.warn(
        'matchNewlyActiveListings: stored polygon invalid; skipping run',
      );
      return [];
    }
    const polygonSql = ring
      ? (() => {
          const poly = this.polygonSql(ring);
          return Prisma.sql`AND location IS NOT NULL AND location && ${poly}::geography AND ST_Within(location::geometry, ${poly})`;
        })()
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      { id: string; published_at: Date }[]
    >(Prisma.sql`
      SELECT id, published_at
      FROM listings
      WHERE ${filterSql}
        AND published_at > ${publishedAfter}
        AND published_at <= ${publishedUntil}
        ${polygonSql}
      ORDER BY published_at ASC, id ASC
      LIMIT ${limit}
    `);
    return rows.map((row) => ({ id: row.id, publishedAt: row.published_at }));
  }
```

> Примечание: `this.logger` — убедиться, что у `SearchService` есть `private readonly logger = new Logger(SearchService.name);`. Если нет — добавить (как в других сервисах) и импортировать `Logger` из `@nestjs/common`.

- [ ] **Step 4: Запустить — убедиться, что зелено**

Run: `pnpm --filter @avino/api test -- search.service.match`
Expected: PASS (3 кейса).

- [ ] **Step 5: Прогнать матчер-зависимый сьют (регрессия)**

Run: `pnpm --filter @avino/api test -- saved-search-alert`
Expected: PASS — существующие тесты алерт-сервиса не сломаны.

- [ ] **Step 6: Коммит**

```bash
git add apps/api/src/search/search.service.ts apps/api/src/search/search.service.match.spec.ts
git commit -m "feat(search): match saved-search alerts inside saved polygon (ST_Within)"
```

---

### Task 3: ADR + DONE.md, прогон всего сьюта, PR

**Files:**
- Create: `docs/adr/ADR-00XX-saved-search-polygon-alerts.md` (номер — следующий свободный; проверить коллизии открытых PR)
- Modify: `docs/DONE.md`

- [ ] **Step 1: ADR** — кратко зафиксировать: хранение `points` в `filters_json.filters` (schemaVersion=1, без бампа); матчер дописывает `ST_Within`, `buildWhereSql` не трогаем; битый полигон → пропуск; перф ОК (узкое окно `published_at` + GIST `idx_listings_location`); клик по сохранённому поиску территорию не восстанавливает (MVP, решение пользователя 2026-06-19).

- [ ] **Step 2: DONE.md** — строка о завершении (TASK-id, ADR-номер, PR-номер проставить при открытии PR).

- [ ] **Step 3: Полный сьют api**

Run: `pnpm --filter @avino/api test`
Expected: PASS (включая прежние 442 api-теста + новые).

- [ ] **Step 4: Lint/build**

Run: `pnpm --filter @avino/api lint && pnpm --filter @avino/api build`
Expected: чисто.

- [ ] **Step 5: Коммит + PR (контроллер)**

```bash
git add docs/adr docs/DONE.md
git commit -m "docs(adr): saved-search polygon alerts (ADR-00XX) + DONE"
```
Открыть PR #1 (база `main`), дождаться зелёного CI, отдать пользователю на мёрж.

---

## PHASE 2 — Client save + UI (PR #2, `apps/client`)

### Task 4: Redux-слайс `territory`

Шарит сериализованный полигон между `SearchResults` (пишет) и `FilterBar` (читает).

**Files:**
- Create: `apps/client/src/store/territorySlice.ts`
- Test: `apps/client/src/store/territorySlice.test.ts`
- Modify: `apps/client/src/store/store.ts:1-17`

**Interfaces:**
- Produces: `setTerritory(points: string | null)`, `clearTerritory()`, `selectTerritoryPoints(state): string | null`, default reducer.

- [ ] **Step 1: Падающий тест редьюсера**

`apps/client/src/store/territorySlice.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import reducer, { setTerritory, clearTerritory } from './territorySlice';

describe('territorySlice', () => {
  it('defaults to null points', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({ points: null });
  });

  it('sets points', () => {
    const next = reducer({ points: null }, setTerritory('41.3,69.2;41.4,69.3;41.2,69.4'));
    expect(next.points).toBe('41.3,69.2;41.4,69.3;41.2,69.4');
  });

  it('clears points', () => {
    const next = reducer({ points: 'x' }, clearTerritory());
    expect(next.points).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @avino/client test -- territorySlice`
Expected: FAIL — модуля нет.

- [ ] **Step 3: Реализовать слайс**

`apps/client/src/store/territorySlice.ts`:

```ts
/**
 * territorySlice — нарисованная территория (полигон) для сохранённого поиска.
 *
 * `SearchResults` рисует полигон в локальном стейте и зеркалит сюда сериализованное
 * кольцо (`lat,lng;…`); `FilterBar` читает его при «Сохранить поиск», чтобы положить
 * `points` в `filters_json.filters`. Только для сохранения — сам поиск по карте
 * по-прежнему ведётся из локального стейта `SearchResults`.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface TerritoryState {
  points: string | null;
}

const initialState: TerritoryState = { points: null };

const territorySlice = createSlice({
  name: 'territory',
  initialState,
  reducers: {
    setTerritory(state, action: PayloadAction<string | null>) {
      state.points = action.payload;
    },
    clearTerritory(state) {
      state.points = null;
    },
  },
});

export const { setTerritory, clearTerritory } = territorySlice.actions;

export const selectTerritoryPoints = (state: {
  territory: TerritoryState;
}): string | null => state.territory.points;

export default territorySlice.reducer;
```

- [ ] **Step 4: Зарегистрировать в сторе**

В `apps/client/src/store/store.ts` добавить импорт и редьюсер:

```ts
import territoryReducer from './territorySlice';
```
…и в объект `reducer`:
```ts
      territory: territoryReducer,
```

- [ ] **Step 5: Запустить — зелено**

Run: `pnpm --filter @avino/client test -- territorySlice`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add apps/client/src/store/territorySlice.ts apps/client/src/store/territorySlice.test.ts apps/client/src/store/store.ts
git commit -m "feat(search): add territory redux slice for saved-search polygon"
```

---

### Task 5: `SearchResults` зеркалит полигон в Redux

**Files:**
- Modify: `apps/client/src/features/search/SearchResults.tsx:82-92` (рядом с `points`-мемо)

**Interfaces:**
- Consumes: `setTerritory`, `clearTerritory` (Task 4); `useAppDispatch` (`@/store/hooks`); существующий `points` (`SearchResults.tsx:89`).

- [ ] **Step 1: Импорты**

В `SearchResults.tsx` добавить:
```ts
import { useAppDispatch } from '@/store/hooks';
import { setTerritory, clearTerritory } from '@/store/territorySlice';
```

- [ ] **Step 2: Эффекты синка**

Сразу после мемо `points` (после `SearchResults.tsx:92`) добавить:

```ts
  // Зеркалим нарисованное кольцо в Redux, чтобы кнопка «Сохранить поиск» в FilterBar
  // (соседний компонент) могла положить territory в сохранённый поиск.
  const dispatch = useAppDispatch();
  React.useEffect(() => {
    dispatch(setTerritory(points));
  }, [points, dispatch]);
  // Уходим со страницы поиска — сбрасываем, чтобы не утащить чужую территорию.
  React.useEffect(() => () => void dispatch(clearTerritory()), [dispatch]);
```

- [ ] **Step 3: Сборка/typecheck**

Run: `pnpm --filter @avino/client build`
Expected: компилируется без ошибок (проверь raw next build при сомнении — memory: rtk-next-build-false-error).

- [ ] **Step 4: Коммит**

```bash
git add apps/client/src/features/search/SearchResults.tsx
git commit -m "feat(search): mirror drawn territory into redux for saving"
```

---

### Task 6: `FilterBar.buildFilters` кладёт `points`

**Files:**
- Modify: `apps/client/src/features/search/FilterBar.tsx:162-171`

**Interfaces:**
- Consumes: `selectTerritoryPoints` (Task 4); существующий `useAppSelector` (`FilterBar.tsx:23`).

- [ ] **Step 1: Импорт селектора**

В `FilterBar.tsx` добавить:
```ts
import { selectTerritoryPoints } from '@/store/territorySlice';
```

- [ ] **Step 2: Прочитать points и положить в фильтры**

Рядом с `isAuthenticated` (`FilterBar.tsx:161`) добавить:
```ts
  const territoryPoints = useAppSelector(selectTerritoryPoints);
```
И в `buildFilters` (`FilterBar.tsx:162-171`) — перед `return filters;` добавить строку и расширить зависимости:
```ts
    if (territoryPoints) filters.points = territoryPoints;
    return filters;
  }, [values, territoryPoints]);
```

- [ ] **Step 3: Сборка/typecheck**

Run: `pnpm --filter @avino/client build`
Expected: чисто.

- [ ] **Step 4: Коммит**

```bash
git add apps/client/src/features/search/FilterBar.tsx
git commit -m "feat(search): include drawn territory in saved search filters"
```

---

### Task 7: Бейдж «территория» + i18n + «no-redraw» комментарий

**Files:**
- Modify: `apps/client/src/lib/savedSearch.ts:43-97`
- Test: `apps/client/src/lib/savedSearch.test.ts` (если файла нет — создать рядом)
- Modify: `apps/client/messages/ru.json`, `apps/client/messages/uz.json`, `apps/client/messages/en.json`

**Interfaces:**
- Consumes: i18n-ключ `savedSearch.territory`.

- [ ] **Step 1: i18n-ключи** — в объект `savedSearch` каждого файла добавить:
  - ru: `"territory": "территория"`
  - uz: `"territory": "hudud"`
  - en: `"territory": "territory"`

- [ ] **Step 2: Падающий тест бейджа**

В `apps/client/src/lib/savedSearch.test.ts` добавить (мини-`t`, возвращающий ключ):

```ts
import { describe, it, expect } from 'vitest';
import { describeFilters, filtersToSearchHref } from './savedSearch';

const t = ((k: string) => k) as any;

describe('describeFilters territory', () => {
  it('adds a territory chip when points present', () => {
    const out = describeFilters({ transaction_type: 'SALE', points: '41,69;41,70;42,69' }, t);
    expect(out).toContain('savedSearch.territory');
  });
  it('omits territory chip when no points', () => {
    const out = describeFilters({ transaction_type: 'SALE' }, t);
    expect(out).not.toContain('savedSearch.territory');
  });
});

describe('filtersToSearchHref ignores points (no redraw)', () => {
  it('does not put points into the URL', () => {
    const href = filtersToSearchHref({ transaction_type: 'SALE', points: '41,69;41,70;42,69' });
    expect(href).not.toContain('points');
  });
});
```

- [ ] **Step 3: Запустить — падает**

Run: `pnpm --filter @avino/client test -- savedSearch`
Expected: FAIL — бейдж не добавляется.

- [ ] **Step 4: Реализация в `describeFilters`**

В `savedSearch.ts`, перед `return parts.join(' · ');` (`savedSearch.ts:72`) добавить:

```ts
  if (asString(filters.points)) parts.push(t('savedSearch.territory'));
```

И в `filtersToSearchHref` (`savedSearch.ts:81`) — закрепить намерение комментарием перед `return`:

```ts
  // `points` (нарисованная территория) намеренно НЕ мапим в URL: по клику территорию
  // заново не рисуем (MVP) — выдача перезапускается по скалярам (решение 2026-06-19).
```

- [ ] **Step 5: Запустить — зелено**

Run: `pnpm --filter @avino/client test -- savedSearch`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add apps/client/src/lib/savedSearch.ts apps/client/src/lib/savedSearch.test.ts apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "feat(account): show territory chip on saved searches with a drawn polygon"
```

---

### Task 8: Полный сьют, lint/build, live-verify, PR

- [ ] **Step 1: Полный сьют client**

Run: `pnpm --filter @avino/client test`
Expected: PASS.

- [ ] **Step 2: Lint + build**

Run: `pnpm --filter @avino/client lint && pnpm --filter @avino/client build`
Expected: чисто (при «Errors: 1» от rtk — перепроверить raw `pnpm exec next build`).

- [ ] **Step 3: Live-verify (Docker-стек)** — поднять api+client, авторизоваться, на `/search` нарисовать территорию + задать цену/тип, «Сохранить поиск»; убедиться, что `filters_json.filters.points` сохранён (GET /saved-searches или БД); создать/заапрувить листинг внутри и вне контура; дождаться прогона матчера (или дёрнуть job) и проверить, что in-app уведомление пришло **только** по листингу внутри территории.

- [ ] **Step 4: PR #2 (контроллер)** — открыть PR (база `main`), CI зелёный, отдать пользователю на мёрж; DONE.md/ADR из PR #1 дополнить номером PR при необходимости.

---

## Self-Review

- **Spec coverage:** хранение polygon (Task 6 client + schemaVersion без бампа), матч по полигону (Task 2), битый полигон → пропуск (Task 1+2), клик без перерисовки (Task 7 `filtersToSearchHref` ignore + тест), бейдж (Task 7), общий поиск не задет (`buildWhereSql` не трогаем — Task 2). Все пункты обсуждённого MVP покрыты.
- **Out of scope (явно):** сохранение территории со страницы `/map` (там нет `FilterBar` с кнопкой «Сохранить»); восстановление/перерисовка контура по клику; push-канал (застаблен). Кандидаты в follow-up.
- **Type consistency:** `points: string` сквозь весь поток — `serializePolygonRing` (client) → `filters.points` → `filters_json.filters.points` → `extractFilters` → `polygonVerticesFromFilters` → `parsePolygonRing`. Слайс-экшены/селектор (`setTerritory`/`clearTerritory`/`selectTerritoryPoints`) совпадают между Task 4/5/6.
- **Ordering:** PR #1 (api) мёржится первым; PR #2 (client) — после. Без PR #1 клиентский `points` будет сохраняться, но не фильтроваться (= текущее поведение, не регресс).
