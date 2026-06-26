# Zillow-style filters — Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переделать фильтры поиска (`/search`, `/map`) под раскладку и поведение Zillow и подключить все фильтры, по которым колонки в БД уже есть (без миграций).

**Architecture:** Источник истины фильтров — URL-query (паттерн `router.replace` + SSR-перечитывание `searchParams`). API получает новые optional-параметры в `SearchListingsQueryDto` (наследуется всеми гео-DTO) и применяет их в общем `buildWhereSql`. Клиент: реструктуризация `FilterBar` под Zillow + мега-панель + новые контролы; маппинг `ListingFilter → query` централизован в `buildSearchParams`.

**Tech Stack:** NestJS + Prisma (`Prisma.sql`) + PostgreSQL (api, Jest); Next.js 15 + RTK Query + next-intl + Tailwind (client, Vitest + RTL).

## Global Constraints

- Все новые query-параметры `GET /search` — **optional** (non-breaking, CLAUDE.md §14). **Миграций БД нет** — колонки `area/floor/total_floors/year_built/agency_id/tours_enabled` уже существуют.
- Денежные/площадные значения — строки/`numeric`, никогда float (ADR-002). Цена сравнивается в пределах `currency`, FX нет.
- `property_type` принимает single **и** массив (обратная совместимость). `rooms` сохраняет семантику «4 = 4+»; `rooms_min` = «≥N».
- Каждая app-папка = отдельная ветка/PR (CLAUDE.md §0/§5). Порядок: **PR #1 `apps/api`** → **PR #2 `apps/client`**. `main` защищён — мёржит пользователь.
- Prisma-условия только через параметризованный `Prisma.sql` (без конкатенации значений).
- i18n: все user-facing строки — ключами в `apps/client/messages/{ru,uz,en}.json`, три языка.
- Объявления с `NULL` по фильтруемой колонке не попадают под диапазонный фильтр — это ожидаемо.

---

# ЧАСТЬ 1 — PR #1 `apps/api` (фильтры в `GET /search` + гео)

Ветка: `feat/search-zillow-filters-api`.

## Task 1: Расширить `SearchListingsQueryDto` новыми параметрами

**Files:**
- Modify: `apps/api/src/search/dto/search-listings.dto.ts`
- Test: `apps/api/src/search/dto/search-listings.dto.spec.ts` (создать, если нет)

**Interfaces:**
- Produces: поля DTO `property_type: PropertyType[]`, `rooms_min: number`, `floor_min/floor_max/total_floors_min/total_floors_max/year_min/year_max: number`, `not_first_floor/not_last_floor/tours_enabled: boolean`, `listing_source: ListingSource[]`; экспорт `LISTING_SOURCES`, `ListingSource`. (`area_min/area_max` уже есть.)

- [ ] **Step 1: Написать падающий тест валидации DTO**

```ts
// apps/api/src/search/dto/search-listings.dto.spec.ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SearchListingsQueryDto } from './search-listings.dto';

function dto(obj: Record<string, unknown>) {
  const inst = plainToInstance(SearchListingsQueryDto, obj, {
    enableImplicitConversion: true,
  });
  return { inst, errors: validateSync(inst) };
}

describe('SearchListingsQueryDto — Zillow filters', () => {
  it('нормализует одиночный property_type в массив', () => {
    const { inst, errors } = dto({ property_type: 'APARTMENT' });
    expect(errors).toHaveLength(0);
    expect(inst.property_type).toEqual(['APARTMENT']);
  });

  it('принимает массив property_type', () => {
    const { inst, errors } = dto({ property_type: ['APARTMENT', 'HOUSE'] });
    expect(errors).toHaveLength(0);
    expect(inst.property_type).toEqual(['APARTMENT', 'HOUSE']);
  });

  it('отклоняет неизвестный property_type', () => {
    const { errors } = dto({ property_type: ['NOPE'] });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('парсит rooms_min/floor_min/year_min как числа', () => {
    const { inst, errors } = dto({ rooms_min: '2', floor_min: '3', year_min: '2010' });
    expect(errors).toHaveLength(0);
    expect(inst.rooms_min).toBe(2);
    expect(inst.floor_min).toBe(3);
    expect(inst.year_min).toBe(2010);
  });

  it('парсит булевы флаги из query-строк', () => {
    const { inst } = dto({ not_first_floor: 'true', tours_enabled: 'true', not_last_floor: 'false' });
    expect(inst.not_first_floor).toBe(true);
    expect(inst.tours_enabled).toBe(true);
    expect(inst.not_last_floor).toBe(false);
  });

  it('нормализует listing_source в массив и валидирует значения', () => {
    expect(dto({ listing_source: 'OWNER' }).inst.listing_source).toEqual(['OWNER']);
    expect(dto({ listing_source: ['OWNER', 'AGENCY'] }).errors).toHaveLength(0);
    expect(dto({ listing_source: ['BANK'] }).errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @avino/api test -- search-listings.dto`
Expected: FAIL (поля/нормализация отсутствуют).

- [ ] **Step 3: Реализовать поля в DTO**

В импортах class-transformer добавить `Transform`; в class-validator — `IsArray`, `IsBoolean`. Заменить старое одиночное поле `property_type` и добавить новые. Над константой `SORT_MODES` (или рядом) добавить:

```ts
/** Источник объявления для фильтра «от собственника / агентства». */
export const LISTING_SOURCES = ['OWNER', 'AGENCY'] as const;
export type ListingSource = (typeof LISTING_SOURCES)[number];

/** query-строка → массив (single или повторяющийся параметр). */
const toArray = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

/** query-строка 'true' → true, иначе false. */
const toBool = ({ value }: { value: unknown }) => value === true || value === 'true';
```

Заменить поле `property_type`:

```ts
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(PropertyType, { each: true })
  property_type?: PropertyType[];
```

Добавить (рядом с `rooms`):

```ts
  /** «N+ комнат» (rooms >= N) — кнопки 1+/2+/…/5+. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rooms_min?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) floor_min?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) floor_max?: number;
  @IsOptional() @Transform(toBool) @IsBoolean() not_first_floor?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() not_last_floor?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) total_floors_min?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) total_floors_max?: number;
  @IsOptional() @Type(() => Number) @IsInt() year_min?: number;
  @IsOptional() @Type(() => Number) @IsInt() year_max?: number;

  /** Источник: ['OWNER'] → agency_id IS NULL; ['AGENCY'] → IS NOT NULL; оба/пусто → без фильтра. */
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(LISTING_SOURCES, { each: true })
  listing_source?: ListingSource[];

  @IsOptional() @Transform(toBool) @IsBoolean() tours_enabled?: boolean;
```

(`area_min`/`area_max` уже объявлены — не трогаем; комментарий «пока игнорируется» убрать.)

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `pnpm --filter @avino/api test -- search-listings.dto`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/search/dto/search-listings.dto.ts apps/api/src/search/dto/search-listings.dto.spec.ts
git commit -m "feat(search): add Zillow-style filter params to query DTO"
```

## Task 2: Применить новые фильтры в `buildWhereSql`

**Files:**
- Modify: `apps/api/src/search/search.service.ts` (`buildWhereSql`, ~стр. 728–770)
- Test: `apps/api/src/search/search.service.int-spec.ts`

**Interfaces:**
- Consumes: поля DTO из Task 1.
- Produces: выдача `GET /search` (и гео-эндпоинтов) фильтруется по новым параметрам.

- [ ] **Step 1: Написать падающие int-spec тесты**

Добавить в `search.service.int-spec.ts` describe-блок. Сид-хелперы (создание листинга с `area/floor/totalFloors/yearBuilt/agencyId/toursEnabled`) повторяют существующий стиль файла — мирроринг существующих `seedListing(...)`. Тест-кейсы:

```ts
describe('GET /search — Zillow filters (Phase 1)', () => {
  it('property_type мультивыбор → IN', async () => {
    // сид: APARTMENT, HOUSE, LAND (все ACTIVE)
    const res = await service.search({ property_type: ['APARTMENT', 'HOUSE'] } as any);
    expect(res.data.map((l) => l.property_type).sort()).toEqual(['APARTMENT', 'HOUSE']);
  });

  it('rooms_min = «≥N»', async () => {
    // сид rooms: 1, 3, 5
    const res = await service.search({ rooms_min: 3 } as any);
    expect(res.data).toHaveLength(2); // 3 и 5
  });

  it('area_min/area_max — диапазон м²', async () => {
    // сид area: 40, 75, 120
    const res = await service.search({ area_min: 50, area_max: 100 } as any);
    expect(res.data).toHaveLength(1); // 75
  });

  it('floor_min + not_first_floor + not_last_floor', async () => {
    // сид (floor,total): (1,9),(5,9),(9,9)
    const notFirst = await service.search({ not_first_floor: true } as any);
    expect(notFirst.data).toHaveLength(2); // 5,9
    const notLast = await service.search({ not_last_floor: true } as any);
    expect(notLast.data).toHaveLength(2); // 1,5
  });

  it('year_min/year_max', async () => {
    // сид yearBuilt: 1990, 2010, 2024
    const res = await service.search({ year_min: 2000, year_max: 2020 } as any);
    expect(res.data).toHaveLength(1); // 2010
  });

  it('listing_source OWNER → agency_id IS NULL', async () => {
    // сид: один с agencyId=null, один с agencyId=<uuid>
    const owner = await service.search({ listing_source: ['OWNER'] } as any);
    expect(owner.data).toHaveLength(1);
    const agency = await service.search({ listing_source: ['AGENCY'] } as any);
    expect(agency.data).toHaveLength(1);
    const both = await service.search({ listing_source: ['OWNER', 'AGENCY'] } as any);
    expect(both.data).toHaveLength(2); // оба → без фильтра
  });

  it('tours_enabled = true', async () => {
    // сид: toursEnabled true/false
    const res = await service.search({ tours_enabled: true } as any);
    expect(res.data).toHaveLength(1);
  });
});
```

(Сигнатуру вызова `service.search(...)` и форму сид-хелперов взять из существующих тестов файла — не выдумывать.)

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @avino/api test -- search.service.int-spec`
Expected: FAIL (новые фильтры не применяются).

- [ ] **Step 3: Добавить условия в `buildWhereSql`**

Заменить старую одиночную ветку `property_type`:

```ts
    if (query.property_type !== undefined && query.property_type.length > 0)
      conds.push(
        Prisma.sql`property_type::text IN (${Prisma.join(query.property_type)})`,
      );
```

После блока `rooms` (оставить его как есть для exact + «4=4+») добавить:

```ts
    if (query.rooms_min !== undefined)
      conds.push(Prisma.sql`rooms >= ${query.rooms_min}`);
    if (query.area_min !== undefined)
      conds.push(Prisma.sql`area >= ${query.area_min}::numeric`);
    if (query.area_max !== undefined)
      conds.push(Prisma.sql`area <= ${query.area_max}::numeric`);
    if (query.floor_min !== undefined)
      conds.push(Prisma.sql`floor >= ${query.floor_min}`);
    if (query.floor_max !== undefined)
      conds.push(Prisma.sql`floor <= ${query.floor_max}`);
    if (query.not_first_floor === true)
      conds.push(Prisma.sql`floor > 1`);
    if (query.not_last_floor === true)
      conds.push(Prisma.sql`floor < total_floors`);
    if (query.total_floors_min !== undefined)
      conds.push(Prisma.sql`total_floors >= ${query.total_floors_min}`);
    if (query.total_floors_max !== undefined)
      conds.push(Prisma.sql`total_floors <= ${query.total_floors_max}`);
    if (query.year_min !== undefined)
      conds.push(Prisma.sql`year_built >= ${query.year_min}`);
    if (query.year_max !== undefined)
      conds.push(Prisma.sql`year_built <= ${query.year_max}`);
    if (query.listing_source !== undefined && query.listing_source.length === 1)
      conds.push(
        query.listing_source[0] === 'OWNER'
          ? Prisma.sql`agency_id IS NULL`
          : Prisma.sql`agency_id IS NOT NULL`,
      );
    if (query.tours_enabled === true)
      conds.push(Prisma.sql`tours_enabled = true`);
```

Обновить doc-комментарий метода (упомянуть новые фильтры Phase 1).

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `pnpm --filter @avino/api test -- search.service.int-spec`
Expected: PASS. Затем прогнать unit-спеки: `pnpm --filter @avino/api test -- search.service.spec`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/search/search.service.ts apps/api/src/search/search.service.int-spec.ts
git commit -m "feat(search): apply area/floor/year/source/tours filters in buildWhereSql"
```

## Task 3: Регенерировать `openapi.public.json`

**Files:**
- Modify: `apps/api/openapi.public.json` (генерируется)

- [ ] **Step 1: Регенерировать**

Run: `pnpm --filter @avino/api openapi:export` (с 4 dummy env, как описано в `docs/` runbook).
Expected: в `openapi.public.json` появляются новые query-параметры `/search`.

- [ ] **Step 2: Проверить drift-check**

Run: `pnpm --filter @avino/api openapi:check` (или CI-эквивалент).
Expected: PASS (нет дрейфа).

- [ ] **Step 3: Commit**

```bash
git add apps/api/openapi.public.json
git commit -m "chore(openapi): regen public spec for new search filters"
```

> После Task 3 — открыть PR #1 (`gh` токеном из `~/.gh_token`, значение не печатать). Мёржит пользователь. PR #2 стартует после мёржа.

---

# ЧАСТЬ 2 — PR #2 `apps/client` (Zillow-бар + контролы)

Ветка: `feat/search-zillow-filters-client`. Зависит от PR #1.

## Task 4: Расширить `ListingFilter` и `buildSearchParams`

**Files:**
- Modify: `apps/client/src/lib/mock/types.ts` (`ListingFilter`, ~стр. 154–176; `SortOption` не трогаем)
- Modify: `apps/client/src/lib/api/listings.ts` (`buildSearchParams`, ~стр. 364–377)
- Test: `apps/client/src/lib/api/listings.test.ts`

**Interfaces:**
- Produces: `ListingFilter` поля `types?: PropertyType[]`, `roomsMin?`, `roomsExact?`, `areaMin?/areaMax?`, `floorMin?/floorMax?`, `notFirstFloor?`, `notLastFloor?`, `totalFloorsMin?/totalFloorsMax?`, `yearMin?/yearMax?`, `listingSource?: 'OWNER'|'AGENCY'`, `toursEnabled?: boolean`. `buildSearchParams` эмитит соответствующие API-параметры.

- [ ] **Step 1: Написать падающий тест маппинга**

```ts
// listings.test.ts — добавить
import { __test } from './listings'; // если buildSearchParams не экспортирован — экспортировать его
// или протестировать через searchListings c моком apiFetch (как уже сделано в файле).

it('buildSearchParams: мультивыбор типов → повторяющийся property_type', () => {
  const p = buildSearchParams({ types: ['APARTMENT', 'HOUSE'] }, 24);
  expect(p.getAll('property_type')).toEqual(['APARTMENT', 'HOUSE']);
});

it('buildSearchParams: rooms_min, area, floor, year, source, tours', () => {
  const p = buildSearchParams(
    {
      roomsMin: 2,
      areaMin: 40, areaMax: 90,
      floorMin: 2, notFirstFloor: true,
      yearMin: 2010,
      listingSource: 'OWNER',
      toursEnabled: true,
    },
    24,
  );
  expect(p.get('rooms_min')).toBe('2');
  expect(p.get('area_min')).toBe('40');
  expect(p.get('area_max')).toBe('90');
  expect(p.get('floor_min')).toBe('2');
  expect(p.get('not_first_floor')).toBe('true');
  expect(p.get('year_min')).toBe('2010');
  expect(p.get('listing_source')).toBe('OWNER');
  expect(p.get('tours_enabled')).toBe('true');
});
```

(Если `buildSearchParams` не экспортирован — добавить `export` к функции в `listings.ts`.)

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @avino/client test -- listings.test`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

В `types.ts` расширить `ListingFilter`:

```ts
  /** Мультивыбор типов жилья (Zillow Home Type). Пусто → все типы. */
  types?: PropertyType[];
  /** «N+ комнат» (rooms_min). */
  roomsMin?: number;
  /** Точное число комнат (режим «Точное совпадение»). */
  roomsExact?: number;
  areaMin?: number;
  areaMax?: number;
  floorMin?: number;
  floorMax?: number;
  notFirstFloor?: boolean;
  notLastFloor?: boolean;
  totalFloorsMin?: number;
  totalFloorsMax?: number;
  yearMin?: number;
  yearMax?: number;
  /** Источник объявления. */
  listingSource?: 'OWNER' | 'AGENCY';
  toursEnabled?: boolean;
```

В `buildSearchParams` (после блоков tx/type) добавить:

```ts
  if (filter.types && filter.types.length > 0)
    for (const tp of filter.types) params.append('property_type', tp);
  if (filter.roomsMin != null) params.set('rooms_min', String(filter.roomsMin));
  if (filter.roomsExact != null) params.set('rooms', String(filter.roomsExact));
  if (filter.areaMin != null) params.set('area_min', String(filter.areaMin));
  if (filter.areaMax != null) params.set('area_max', String(filter.areaMax));
  if (filter.floorMin != null) params.set('floor_min', String(filter.floorMin));
  if (filter.floorMax != null) params.set('floor_max', String(filter.floorMax));
  if (filter.notFirstFloor) params.set('not_first_floor', 'true');
  if (filter.notLastFloor) params.set('not_last_floor', 'true');
  if (filter.totalFloorsMin != null) params.set('total_floors_min', String(filter.totalFloorsMin));
  if (filter.totalFloorsMax != null) params.set('total_floors_max', String(filter.totalFloorsMax));
  if (filter.yearMin != null) params.set('year_min', String(filter.yearMin));
  if (filter.yearMax != null) params.set('year_max', String(filter.yearMax));
  if (filter.listingSource) params.set('listing_source', filter.listingSource);
  if (filter.toursEnabled) params.set('tours_enabled', 'true');
```

(Старое одиночное `filter.type`/`rooms` оставить — мок-слой и canonical их используют; в реальном поиске их заменяют `types`/`roomsMin`/`roomsExact`.)

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `pnpm --filter @avino/client test -- listings.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/lib/mock/types.ts apps/client/src/lib/api/listings.ts apps/client/src/lib/api/listings.test.ts
git commit -m "feat(search): map Zillow filters in ListingFilter and buildSearchParams"
```

## Task 5: i18n-ключи для новых фильтров

**Files:**
- Modify: `apps/client/messages/ru.json`, `uz.json`, `en.json` (блок `search.filters`, ~стр. 209–245 в ru.json)

- [ ] **Step 1: Добавить ключи в `search.filters` всех трёх файлов**

Ru (значения для uz/en — перевести соответственно):

```jsonc
"homeType": "Тип жилья",
"deselectAll": "Снять все",
"exactMatch": "Точное совпадение",
"moreFilters": "Фильтры",
"apply": "Применить",
"resetAll": "Сбросить всё",
"areaTitle": "Площадь, м²",
"yearTitle": "Год постройки",
"floorTitle": "Этаж",
"notFirstFloor": "Не первый этаж",
"notLastFloor": "Не последний этаж",
"totalFloorsTitle": "Этажность дома",
"listingSourceTitle": "Тип объявления",
"sourceOwner": "Собственник",
"sourceAgency": "Агентство",
"toursEnabled": "Принимает заявки на просмотр",
"from": "от",
"to": "до",
"roomsExact": "Комнат ровно: {count}"
```

(`resetAll`, `from`/`to` могут уже существовать — не дублировать; проверить блок.)

- [ ] **Step 2: Проверить валидность JSON**

Run: `pnpm --filter @avino/client lint` (или `node -e "require('./apps/client/messages/ru.json')"` на каждый файл).
Expected: без ошибок парсинга; ключи присутствуют во всех трёх файлах.

- [ ] **Step 3: Commit**

```bash
git add apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "i18n(search): add keys for Zillow-style filters"
```

## Task 6: Переиспользуемые контролы — `RangeFields`, `BedroomsControl`, `HomeTypeMultiSelect`

**Files:**
- Create: `apps/client/src/features/search/controls/RangeFields.tsx`
- Create: `apps/client/src/features/search/controls/BedroomsControl.tsx`
- Create: `apps/client/src/features/search/controls/HomeTypeMultiSelect.tsx`
- Test: `apps/client/src/features/search/controls/RangeFields.test.tsx`, `BedroomsControl.test.tsx`

**Interfaces:**
- Produces:
  - `RangeFields({ min, max, onMin, onMax, fromLabel, toLabel, suffix? })` — пара числовых инпутов, коммит по `onBlur`. Мирроринг текущего ценового дропдауна `FilterBar.tsx:231–246` (компонент `Field`).
  - `BedroomsControl({ value, exact, onChange })` — `value?: number` (выбранное «N+» или точное), `exact: boolean`; кнопки `Любое/1+/2+/3+/4+/5+` (мирроринг `Pill` из `ROOM_OPTIONS`) + чекбокс «Точное совпадение». `onChange(next: { value?: number; exact: boolean })`.
  - `HomeTypeMultiSelect({ value, onChange })` — `value: PropertyType[]`, чекбоксы по `PROPERTY_TYPES` + «Снять все». `onChange(next: PropertyType[])`.

- [ ] **Step 1: Тест `RangeFields`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { RangeFields } from './RangeFields';

it('коммитит min/max по blur', () => {
  const onMin = vi.fn(); const onMax = vi.fn();
  render(<RangeFields min="" max="" onMin={onMin} onMax={onMax} fromLabel="от" toLabel="до" />);
  const [from, to] = screen.getAllByRole('textbox');
  fireEvent.blur(from, { target: { value: '40' } });
  fireEvent.blur(to, { target: { value: '90' } });
  expect(onMin).toHaveBeenCalledWith('40');
  expect(onMax).toHaveBeenCalledWith('90');
});
```

- [ ] **Step 2: Тест `BedroomsControl`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { BedroomsControl } from './BedroomsControl';

it('выбор 2+ отдаёт value=2, exact=false', () => {
  const onChange = vi.fn();
  render(<BedroomsControl value={undefined} exact={false} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: '2+' }));
  expect(onChange).toHaveBeenCalledWith({ value: 2, exact: false });
});

it('чекбокс «Точное совпадение» переключает exact', () => {
  const onChange = vi.fn();
  render(<BedroomsControl value={2} exact={false} onChange={onChange} />);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(onChange).toHaveBeenCalledWith({ value: 2, exact: true });
});
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `pnpm --filter @avino/client test -- controls/`
Expected: FAIL (компоненты не существуют).

- [ ] **Step 4: Реализовать три контрола**

Стилистика — мирроринг существующего `FilterBar.tsx`: инпуты через `Field`/`fieldClass`, кнопки через `Pill`, чекбоксы — нативный `<input type="checkbox">` + label с классами из проекта. Лейблы — через `useTranslations('search.filters')` (`exactMatch`, `deselectAll`, типы — через `useTranslations('enums')`/`propertyType.*`). `RangeFields` — `inputMode="numeric"`, коммит по `onBlur` (как ценовой блок). Логика `BedroomsControl`: клик по уже выбранной кнопке снимает выбор (`value=undefined`); `exact` отдельным чекбоксом; кнопка «Любое» = `value=undefined`. `HomeTypeMultiSelect`: тоггл элемента массива; «Снять все» → `[]`.

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `pnpm --filter @avino/client test -- controls/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/features/search/controls/
git commit -m "feat(search): add RangeFields, BedroomsControl, HomeTypeMultiSelect controls"
```

## Task 7: Мега-панель `FiltersPanel`

**Files:**
- Create: `apps/client/src/features/search/FiltersPanel.tsx`
- Test: `apps/client/src/features/search/FiltersPanel.test.tsx`

**Interfaces:**
- Consumes: `RangeFields` (Task 6).
- Produces: `FiltersPanel({ values, onApply, onReset })` где `values: FiltersPanelValues` (поля: `areaMin/areaMax/yearMin/yearMax/floorMin/floorMax/notFirstFloor/notLastFloor/totalFloorsMin/totalFloorsMax/listingSource/toursEnabled` — всё строки/булевы для инпутов). `onApply(next: FiltersPanelValues)`, `onReset()`. Содержит секции: Площадь · Год · Этаж (+ «не первый/последний») · Этажность · Тип объявления (чекбоксы Собственник/Агентство) · «Принимает заявки на просмотр» · низ: «Сбросить всё»/«Применить».

- [ ] **Step 1: Тест панели**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { FiltersPanel } from './FiltersPanel';

it('Применить отдаёт собранные значения', () => {
  const onApply = vi.fn();
  render(<FiltersPanel values={{}} onApply={onApply} onReset={vi.fn()} />);
  fireEvent.blur(screen.getByLabelText(/Площадь.*от/i), { target: { value: '40' } });
  fireEvent.click(screen.getByText('Применить'));
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ areaMin: '40' }));
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @avino/client test -- FiltersPanel`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

Локальный draft-стейт (инициализируется из `values`), секции из `RangeFields` + чекбоксы; «Применить» → `onApply(draft)`, «Сбросить всё» → `onReset()` + очистка draft. ARIA-лейблы инпутов вида `Площадь, м² от`/`до` (для `getByLabelText`). Десктоп-обёртка — `DropdownContent` (как в `FilterBar`); мобильный полноэкранный режим (sheet) — обёртку решает `FilterBar` (Task 8), панель сама layout-агностична.

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `pnpm --filter @avino/client test -- FiltersPanel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/search/FiltersPanel.tsx apps/client/src/features/search/FiltersPanel.test.tsx
git commit -m "feat(search): add FiltersPanel mega-panel (Phase 1 fields)"
```

## Task 8: Реструктуризация `FilterBar` под Zillow

**Files:**
- Modify: `apps/client/src/features/search/FilterBar.tsx`
- Test: `apps/client/src/features/search/FilterBar.test.tsx` (создать, если нет)

**Interfaces:**
- Consumes: `BedroomsControl`, `HomeTypeMultiSelect`, `FiltersPanel`, расширенный `FilterValues`.
- Produces: бар `[🔍] · [Купить ▾] · [Цена ▾] · [Комнаты ▾] · [Тип жилья ▾] · [⚙ Фильтры ▾] · [Сохранить поиск]`; пишет новые параметры в URL через существующий `setParams`.

- [ ] **Step 1: Расширить `FilterValues` и написать тест бара**

`FilterValues` (в `FilterBar.tsx`) дополнить: `types?: PropertyType[]`, `roomsMin?: number`, `roomsExact?: number`, `areaMin?/areaMax?/yearMin?/yearMax?/floorMin?/floorMax?/totalFloorsMin?/totalFloorsMax?: string`, `notFirstFloor?/notLastFloor?/toursEnabled?: boolean`, `listingSource?: 'OWNER'|'AGENCY'`.

```tsx
// FilterBar.test.tsx — smoke: рендер бара показывает Zillow-кнопки
it('рендерит Zillow-раскладку бара', () => {
  renderWithProviders(<FilterBar values={{ tx: 'SALE', sort: 'promotion', view: 'list' }} districts={[]} />);
  expect(screen.getByRole('button', { name: /Купить/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Цена/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Комнаты/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Тип жилья/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Фильтры/ })).toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @avino/client test -- FilterBar`
Expected: FAIL.

- [ ] **Step 3: Реализовать раскладку**

- Заменить `Segment` Купить/Аренда на `Dropdown` `Купить ▾` (радио, мирроринг `TriggerButton`).
- Блок «Комнаты» — `BedroomsControl`; запись в URL: «N+» → `setParams({ rooms_min: N, rooms: undefined })`, «точно» → `setParams({ rooms: N, rooms_min: undefined })`, «Любое» → оба `undefined`.
- Блок «Тип жилья» — `HomeTypeMultiSelect`; запись повторяющегося параметра: собрать `URLSearchParams`, `delete('type')` + `append('type', t)` для каждого выбранного (расширить `setParams` или сделать локальный `setTypes`).
- Кнопка `⚙ Фильтры ▾` — `Dropdown` (десктоп) c `FiltersPanel` внутри; мобайл — полноэкранный sheet (мирроринг существующего mobile-паттерна, либо `lg:hidden`/портал). `onApply` → `setParams({...})` всеми полями панели; `onReset` → очистка тех же ключей.
- Убрать `<select>` сортировки из бара (переезжает в Task 9).
- «Сохранить поиск» — оставить; `buildFilters()` расширить новыми полями (Task 10 уточняет `SavedSearchFilters`).

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `pnpm --filter @avino/client test -- FilterBar`
Expected: PASS. Затем общий прогон: `pnpm --filter @avino/client test` (база: 180 passed / 2 known LoginModal fails — не регресс).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/search/FilterBar.tsx apps/client/src/features/search/FilterBar.test.tsx
git commit -m "feat(search): restructure FilterBar into Zillow layout with mega-panel"
```

## Task 9: Перенести сортировку к счётчику результатов

**Files:**
- Modify: `apps/client/src/features/search/SearchResults.tsx`
- Test: `apps/client/src/features/search/SearchResults.test.tsx` (если есть; иначе smoke в существующем)

**Interfaces:**
- Produces: `Сортировка ▾` рядом с заголовком/счётчиком; меняет URL-параметр `sort` (значения/`toApiSort` без изменений).

- [ ] **Step 1: Тест — селект сортировки рядом со счётчиком**

```tsx
it('меняет sort в URL', () => {
  // рендер SearchResults c heading/total; найти select сортировки, change → ожидать router.replace с ?sort=
});
```

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @avino/client test -- SearchResults`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

Перенести `<select>` сортировки (значения из старого `FilterBar`: promotion/price_asc/price_desc/area_desc/date_desc) в шапку `SearchResults` рядом со счётчиком (`N результатов · Сортировка ▾`). Запись через `useRouter().replace` тем же паттерном `setParams`. Использовать `search.filters.sort.*` ключи (уже есть).

- [ ] **Step 4: Запустить — проходит**

Run: `pnpm --filter @avino/client test -- SearchResults`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/search/SearchResults.tsx apps/client/src/features/search/SearchResults.test.tsx
git commit -m "feat(search): move sort control next to results count (Zillow-style)"
```

## Task 10: Парсинг новых `searchParams` + save search + чипы

**Files:**
- Modify: `apps/client/src/app/[locale]/search/page.tsx` (парсинг, ~стр. 112–159)
- Modify: `apps/client/src/app/[locale]/map/page.tsx` (тот же парсинг, если дублируется)
- Modify: `apps/client/src/lib/savedSearch.ts` (`SavedSearchFilters` + `describeFilters`)
- Modify: `apps/client/src/features/search/ActiveFilters.tsx`
- Test: `apps/client/src/features/search/ActiveFilters.test.tsx`

**Interfaces:**
- Consumes: расширенные `FilterValues`/`ListingFilter`.
- Produces: SSR-страница читает новые параметры → `FilterValues` + `ListingFilter`; чипы и save search покрывают новые фильтры.

- [ ] **Step 1: Тест парсинга и чипов**

`ActiveFilters.test.tsx` — добавить кейс: при `values` с `areaMin`/`floorMin`/`types.length>1` рендерятся соответствующие чипы; клик по × вызывает удаление параметра.

```tsx
it('рендерит чип площади и убирает его', () => {
  render(<ActiveFilters values={{ tx: 'SALE', sort: 'promotion', view: 'list', areaMin: '40' }} districts={[]} />);
  expect(screen.getByText(/40/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @avino/client test -- ActiveFilters`
Expected: FAIL.

- [ ] **Step 3: Реализовать парсинг и чипы**

В `search/page.tsx`:
- читать **все** значения `?type=` (мультивыбор): `const types = (Array.isArray(sp.type) ? sp.type : sp.type ? [sp.type] : []).filter(isPropertyType)`.
- читать `rooms_min`, `area_min/max`, `floor_min/max`, `not_first_floor`, `not_last_floor`, `total_floors_min/max`, `year_min/max`, `listing_source`, `tours_enabled` (через `first()` + числовая/булева нормализация по образцу `priceMin`).
- собрать `FilterValues` (строки для инпутов) и `ListingFilter` (числа/булевы для API: `types`, `roomsMin`, `roomsExact` (из `?rooms=`), `areaMin/areaMax`, `floorMin/floorMax`, `notFirstFloor`, `notLastFloor`, `totalFloorsMin/Max`, `yearMin/Max`, `listingSource`, `toursEnabled`).
- расширить `isLongTail` в `generateMetadata` новыми параметрами (area/floor/year → noindex).

В `savedSearch.ts`: добавить новые поля в `SavedSearchFilters` (имена = query-параметры API) и описать их в `describeFilters(t)`.

В `ActiveFilters.tsx`: добавить `ChipDef` на каждый активный новый фильтр (площадь/год/этаж/этажность/тип(мультивыбор)/источник/туры/комнаты-min); `handleRemove` чистит нужный параметр (для диапазонов — пару min/max); `handleResetAll` — добавить новые ключи в очистку.

Если `map/page.tsx` дублирует логику парсинга — вынести общий парсер в `lib/searchParams.ts` и переиспользовать в обеих страницах (DRY).

- [ ] **Step 4: Запустить — проходит**

Run: `pnpm --filter @avino/client test -- ActiveFilters` затем `pnpm --filter @avino/client test`
Expected: PASS (кроме 2 известных LoginModal-фейлов).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/app apps/client/src/lib/savedSearch.ts apps/client/src/features/search/ActiveFilters.tsx apps/client/src/features/search/ActiveFilters.test.tsx
git commit -m "feat(search): parse new filter params, extend chips and saved search"
```

## Task 11: Сборка, lint и финальная проверка

- [ ] **Step 1: Lint + build**

Run: `pnpm --filter @avino/client lint` и `pnpm --filter @avino/client exec next build`
Expected: чисто (⚠️ `rtk next build` может ложно показывать «Errors: 1» — сверяться с raw `next build`).

- [ ] **Step 2: Финальный прогон тестов**

Run: `pnpm --filter @avino/client test`
Expected: новые тесты зелёные; база 180 passed / 2 known LoginModal fails — не регресс.

- [ ] **Step 3: Commit (если есть правки lint)**

```bash
git add -A
git commit -m "chore(search): lint and build fixes for Zillow filters"
```

> Открыть PR #2 (`gh` токеном из `~/.gh_token`). Мёржит пользователь.

---

## Self-Review (выполнено при написании плана)

- **Покрытие спека:** §A (API-параметры) → Task 1–2; openapi → Task 3; §B бар/контролы/мега-панель/сортировка/чипы/save → Task 6–10; §C i18n → Task 5; §B маппинг query → Task 4. Все 🟡/🟢-фильтры Фазы 1 покрыты.
- **Гео-эндпоинты:** покрыты автоматически — `GeoSearchQueryDto`/`PolygonSearchQueryDto`/`BoundsSearchQueryDto` наследуют `SearchListingsQueryDto`, а `buildWhereSql` общий.
- **Типы:** `rooms_min`/`roomsMin`, `listing_source`/`listingSource`, `property_type[]`/`types` согласованы между API и клиентом.
- **Вне Фазы 1:** санузлы/парковка/участок/amenities (миграции) — Фаза 2+, в плане отсутствуют намеренно.

## Verify-критерии (после обоих PR)
- API: каждый новый фильтр сужает выдачу `GET /search` и гео-эндпоинтов; мультивыбор `property_type` → `IN`; `rooms_min`=«≥N», `rooms`=«=N» (старый «4=4+» жив); невалид → 400; openapi drift зелёный.
- client: бар как Zillow; мега-панель открывается (десктоп-дропдаун/мобайл-sheet); каждый фильтр пишет параметр и меняет выдачу; чипы/«Сбросить всё» работают; сортировка у счётчика; save search сохраняет новые поля; lint+build зелёные; SSR сохраняет фильтры при перезагрузке.
