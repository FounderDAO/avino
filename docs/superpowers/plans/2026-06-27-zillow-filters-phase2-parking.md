# Zillow-фильтры Фаза 2 — Парковка/гараж (`parking_type`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить характеристику «тип парковки/гаража» (`parking_type` enum) сквозной вертикалью: enum+миграция → визард create/edit → деталь/модерация → мультивыбор-фильтр API → секция в мега-панели.

**Architecture:** `parking_type` — **enum** (`YARD/COVERED/GARAGE/UNDERGROUND`), nullable, NULL=«нет/не указано». Паттерн-донор фильтра — существующий **`property_type` (мультивыбор enum → `IN`)**, НЕ `bathrooms`. Все гео-DTO наследуют `SearchListingsQueryDto`, поэтому `parking_type` добавляется в один базовый DTO. UI: новая секция «Парковка» в `FiltersPanel` с `ParkingMultiSelect` (зеркало `HomeTypeMultiSelect`); визард — single-select Chip-группа с «Нет».

**Tech Stack:** NestJS + Prisma (raw SQL migrations, enum) + class-validator/transformer; Next.js + RTK Query + next-intl + Tailwind; Vitest + RTL.

## Global Constraints

- **Источник дизайна:** `docs/superpowers/specs/2026-06-27-zillow-filters-phase2-parking-design.md`.
- **Одна app-папка = один PR:** PR #1 `apps/api`, PR #2 `apps/client`, PR #3 `apps/web`. Порядок: **PR #1 → мёрж → PR #2 + PR #3**.
- **Субагенты НЕ трогают git** — пишут код, гоняют lint/build/test, перечисляют изменённые файлы. Все коммиты/ветки/PR делает контроллер. «Commit»-шаги выполняет контроллер.
- **`main` защищён** — PR открывает контроллер, мёржит пользователь (никогда `--admin`).
- **GitHub** — токен из `~/.gh_token` (не печатать). Git-мутации по одной команде.
- **После правки `schema.prisma`** — `prisma generate`.
- **`/search` публичный** → regen `openapi.{public,internal}.json` в том же PR (CI drift-check).
- **i18n** — ключи во ВСЕ три `apps/client/messages/{ru,uz,en}.json`; замоканный `next-intl` скрывает отсутствующие ключи → проверить вручную. eslint `apps/client` НЕ ловит unused imports → проверить вручную.
- **Таблица БД** — `listings` (`@@map`). **Параметр мультивыбора** зеркалит `property_type`: хелпер `toArray` (search-listings.dto.ts:42), `@Transform(toArray) @IsArray() @IsEnum(…, { each: true })`; в `buildWhereSql` — `Prisma.sql\`<col>::text IN (${Prisma.join(arr)})\``.
- **Предсущ. фейлы:** `LoginModal.test` (2 failed) — не регресс.
- **Значения enum/лейблы:** `YARD`=Двор, `COVERED`=Крытая, `GARAGE`=Гараж, `UNDERGROUND`=Подземная.

---

# PR #1 — `apps/api` (ветка `feat/listing-parking-api`)

Делегировать `avino-impl` (папка `apps/api`). Мёржится первым.

### Task 1: Enum `ParkingType` + колонка + миграция

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (новый enum + поле в `Listing` после `bathrooms`/`floor`)
- Create: `apps/api/prisma/migrations/20260627090000_add_listing_parking_type/migration.sql`

**Interfaces:**
- Produces: enum `ParkingType`, колонка `listings.parking_type` (nullable), Prisma-поле `Listing.parkingType ParkingType?`.

- [ ] **Step 1: Enum + поле в схему**

В `apps/api/prisma/schema.prisma` добавить enum (рядом с другими enum, напр. после `PromotionType`):

```prisma
enum ParkingType {
  YARD
  COVERED
  GARAGE
  UNDERGROUND
}
```

И в модель `Listing`, после `bathrooms Int? @db.SmallInt`:

```prisma
  parkingType        ParkingType?                           @map("parking_type")
```

- [ ] **Step 2: Файл миграции**

Создать `apps/api/prisma/migrations/20260627090000_add_listing_parking_type/migration.sql`:

```sql
-- Generated to match schema.prisma (no local shadow DB). Apply on staging/CI with
-- `prisma migrate deploy`; if applied out-of-band, verify then
-- `prisma migrate resolve --applied 20260627090000_add_listing_parking_type`.

-- CreateEnum
CREATE TYPE "ParkingType" AS ENUM ('YARD', 'COVERED', 'GARAGE', 'UNDERGROUND');

-- AlterTable
ALTER TABLE "listings" ADD COLUMN "parking_type" "ParkingType";
```

- [ ] **Step 3: Сгенерировать клиент**

Run: `cd apps/api && rtk prisma generate`
Expected: `Generated Prisma Client`; тип `Listing` содержит `parkingType`, экспортируется enum `ParkingType`.

- [ ] **Step 4: Контроллер коммитит**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260627090000_add_listing_parking_type
git commit -m "feat(listings): add parking_type enum + column + migration"
```

---

### Task 2: `parking_type` в DTO, сервисе, ответах

**Files:**
- Modify: `apps/api/src/listings/dto/create-listing.dto.ts`, `update-listing.dto.ts`
- Modify: `apps/api/src/listings/listings.service.ts`
- Test: `apps/api/src/listings/listings.service.spec.ts`

**Interfaces:**
- Consumes: enum `ParkingType` (Task 1, импорт из `@prisma/client`).
- Produces: create/update принимают `parking_type?: ParkingType`; `ListingDetailResponse.parking_type` / `ListingListItem.parking_type` (`ParkingType | null`).

- [ ] **Step 1: DTO create + update**

В обоих DTO импортировать `ParkingType` (из `@prisma/client`, как `PropertyType`) и добавить после блока `bathrooms`:

```ts
  @IsOptional()
  @IsEnum(ParkingType)
  parking_type?: ParkingType;
```

- [ ] **Step 2: `listings.service.ts`** — `parking_type`/`parkingType` рядом с `bathrooms`:

```ts
// ListingScalarInput (snake):       parking_type?: ParkingType;
// ListingScalarData (camel):        parkingType?: ParkingType;
// ListingDetailResponse:            parking_type: ParkingType | null;
// LISTING_DETAIL_SELECT:            parkingType: true,
// ListingListItem:                  parking_type: ParkingType | null;
// LISTING_LIST_SELECT:              parkingType: true,
// toScalarData (после bathrooms):   if (dto.parking_type !== undefined) data.parkingType = dto.parking_type;
// toListItem маппинг:               parking_type: listing.parkingType,
// toDetailResponse маппинг:         parking_type: listing.parkingType,
```

(Импортировать `ParkingType` из `@prisma/client` в начале файла рядом с `PropertyType`.)

- [ ] **Step 3: Юнит-тест**

В `listings.service.spec.ts` добавить `parking_type: 'GARAGE'` (через `ParkingType.GARAGE`) во входной create-DTO + ассерт, что Prisma-`create` получил `parkingType: 'GARAGE'`; в update-кейс — `parking_type: 'YARD'`, проверить `data.parkingType === 'YARD'`.

- [ ] **Step 4: Прогнать**

Run: `cd apps/api && rtk vitest run src/listings/listings.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Контроллер коммитит**

```bash
git add apps/api/src/listings
git commit -m "feat(listings): accept and return parking_type"
```

---

### Task 3: Фильтр `parking_type` (мультивыбор → IN)

**Files:**
- Modify: `apps/api/src/search/dto/search-listings.dto.ts` (зеркало `property_type`, ~стр.88-92)
- Modify: `apps/api/src/search/search.service.ts` (SearchListItem, SEARCH_SELECT, buildWhereSql ~стр.743, toSearchItem)
- Test: `apps/api/src/search/search.service.int-spec.ts`

**Interfaces:**
- Produces: query-параметр `parking_type` (массив, применяется во всех search-эндпоинтах); `SearchListItem.parking_type: ParkingType | null`.

- [ ] **Step 1: Падающий int-тест**

В `search.service.int-spec.ts` (зеркало `property_type`/`bathrooms_min`-кейсов):

```ts
it('parking_type фильтрует IN, NULL исключает', async () => {
  // фикстуры: parkingType GARAGE, YARD, null
  const res = await service.search({ parking_type: ['GARAGE'] } as any);
  const ids = res.data.map((l) => l.id);
  expect(ids).toContain(listingGarage.id);
  expect(ids).not.toContain(listingYard.id);
  expect(ids).not.toContain(listingNullParking.id);
});
```

(Добавить `parkingType` в фикстуры-сидеры рядом с `bathrooms`.)

- [ ] **Step 2: Прогнать — упадёт**

Run: `cd apps/api && rtk vitest run src/search/search.service.int-spec.ts -t parking_type`
Expected: FAIL.

- [ ] **Step 3: DTO-параметр** (зеркало `property_type`, строки 88-92)

В `search-listings.dto.ts` импортировать `ParkingType` и добавить (рядом с `property_type`):

```ts
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(ParkingType, { each: true })
  parking_type?: ParkingType[];
```

- [ ] **Step 4: Применить в сервисе**

```ts
// SearchListItem (рядом с bathrooms):  parking_type: ParkingType | null;
// SEARCH_SELECT (рядом с bathrooms):   parkingType: true,
// buildWhereSql — зеркало property_type (строка 743):
    if (query.parking_type !== undefined && query.parking_type.length > 0)
      conds.push(
        Prisma.sql`parking_type::text IN (${Prisma.join(query.parking_type)})`,
      );
// toSearchItem маппинг:                parking_type: listing.parkingType,
```

(Импорт `ParkingType` из `@prisma/client` в search.service.ts.)

- [ ] **Step 5: Прогнать — пройдёт**

Run: `cd apps/api && rtk vitest run src/search/search.service.int-spec.ts`
Expected: PASS.

- [ ] **Step 6: Контроллер коммитит**

```bash
git add apps/api/src/search
git commit -m "feat(search): add parking_type multi-select filter"
```

---

### Task 4: Regen OpenAPI + финализация PR #1

- [ ] **Step 1: Билд + линт** — `cd apps/api && rtk tsc && rtk lint` → чисто.
- [ ] **Step 2: Regen** — `cd apps/api && rtk pnpm openapi:export` (4 dummy env); проверить `parking_type` в `openapi.public.json`/`internal.json` на search-эндпоинтах.
- [ ] **Step 3: ADR-0109 + DONE** (контроллер) — `docs/adr/ADR-0109-listing-parking-type.md` (решение: enum, без NONE, nullable, мультивыбор) + запись в `docs/DONE.md`.
- [ ] **Step 4: Контроллер коммитит + PR**

```bash
git add apps/api/openapi.public.json apps/api/openapi.internal.json docs/DONE.md docs/adr
git commit -m "docs(api): regen openapi + ADR/DONE for parking_type"
git push -u origin feat/listing-parking-api
```
PR title: `feat(listings): parking_type enum + multi-select filter (Zillow Phase 2 API)`

**Verify (PR #1):** `GET /search?parking_type=GARAGE` сужает; мультивыбор `?parking_type=GARAGE&parking_type=YARD` → IN; NULL исключается; create/update сохраняют; detail/list отдают; невалидное значение → 400; int/unit-spec зелёные; openapi drift зелёный.

---

# PR #2 — `apps/client` (ветка `feat/listing-parking-client`)

Делегировать `avino-impl` (папка `apps/client`). **После мёржа PR #1.** Паттерн-донор — `property_type`/`types`/`HomeTypeMultiSelect`.

### Task 5: Типы и плюмбинг запроса

**Files:**
- Modify: `apps/client/src/lib/mock/types.ts`, `apps/client/src/lib/api/listings.ts`,
  `apps/client/src/store/api/createListingApi.ts`, `listingEditApi.ts`, `favoritesApi.ts`

**Interfaces:**
- Produces: `ParkingType` + `PARKING_TYPES`; `Listing.parkingType?`, `ListingFilter.parkingTypes?: ParkingType[]`; маппинг и `buildSearchParams` пишут `parking_type`.

- [ ] **Step 1: `mock/types.ts`** — рядом с `PropertyType`/`PROPERTY_TYPES`:

```ts
export type ParkingType = 'YARD' | 'COVERED' | 'GARAGE' | 'UNDERGROUND';
export const PARKING_TYPES: ParkingType[] = ['YARD', 'COVERED', 'GARAGE', 'UNDERGROUND'];
// interface Listing — после bathrooms:
  parkingType?: ParkingType;
// interface ListingFilter — рядом с types:
  parkingTypes?: ParkingType[];
```

- [ ] **Step 2: `lib/api/listings.ts`**

```ts
// ApiSearchItem + ApiListingDetail (рядом с bathrooms):
  parking_type: ParkingType | null;
// mapListing (рядом с bathrooms):
    parkingType: (api as ApiSearchItem | ApiListingDetail).parking_type ?? undefined,
// buildSearchParams (рядом с блоком property_type, мультивыбор):
  if (filter.parkingTypes && filter.parkingTypes.length > 0) {
    for (const pt of filter.parkingTypes) params.append('parking_type', pt);
  }
```

(Импортировать `ParkingType` из `@/lib/mock/types`.)

- [ ] **Step 3: RTK-типы** — `parking_type?: ParkingType` в `CreateListingBody` (`createListingApi.ts`) и `UpdateListingPatch` (`listingEditApi.ts`); `parking_type: ParkingType | null` в `EditListingDetail` (`listingEditApi.ts`) и `FavoriteSearchItem` (`favoritesApi.ts`). Импорт типа из `@/lib/mock/types`.

- [ ] **Step 4: Сборка** — `cd apps/client && rtk pnpm exec tsc --noEmit` → чисто.

- [ ] **Step 5: Контроллер коммитит**

```bash
git add apps/client/src/lib/mock/types.ts apps/client/src/lib/api/listings.ts apps/client/src/store/api/createListingApi.ts apps/client/src/store/api/listingEditApi.ts apps/client/src/store/api/favoritesApi.ts
git commit -m "feat(client): parking_type in types, query and RTK API"
```

---

### Task 6: i18n (ru/uz/en)

**Files:** `apps/client/messages/{ru,uz,en}.json`

**Interfaces:**
- Produces: `enums.parking.{YARD,COVERED,GARAGE,UNDERGROUND}`, `search.filters.parkingTypesTitle`, `search.filters.parkingCount`, `listing.facts.parking`, `listingNew.fields.parking.{label,none}`.

- [ ] **Step 1: ru.json**

```jsonc
// enums (рядом с propertyType):
"parking": { "YARD": "Двор", "COVERED": "Крытая", "GARAGE": "Гараж", "UNDERGROUND": "Подземная" },
// search.filters:
"parkingTypesTitle": "Парковка",
"parkingCount": "Парковка: {count}",
// listing.facts:
"parking": "Парковка",
// listingNew.fields:
"parking": { "label": "Парковка/гараж", "none": "Нет" }
```

- [ ] **Step 2: uz.json**

```jsonc
"parking": { "YARD": "Hovli", "COVERED": "Yopiq", "GARAGE": "Garaj", "UNDERGROUND": "Yer osti" },
"parkingTypesTitle": "Avtoturargoh",
"parkingCount": "Avtoturargoh: {count}",
"parking": "Avtoturargoh",
"parking": { "label": "Avtoturargoh/garaj", "none": "Yo'q" }
```

- [ ] **Step 3: en.json**

```jsonc
"parking": { "YARD": "Yard", "COVERED": "Covered", "GARAGE": "Garage", "UNDERGROUND": "Underground" },
"parkingTypesTitle": "Parking",
"parkingCount": "Parking: {count}",
"parking": "Parking",
"parking": { "label": "Parking/garage", "none": "None" }
```

> Размести ключи по правильным неймспейсам (`enums.parking`, `search.filters.*`, `listing.facts.parking`, `listingNew.fields.parking`) — не как плоский дубль. Сверь существующую вложенность `propertyType`/`fields.rooms`.

- [ ] **Step 4: Валидность JSON** — `cd apps/client && node -e "['ru','uz','en'].forEach(l=>JSON.parse(require('fs').readFileSync('messages/'+l+'.json')))"` → без ошибок.

- [ ] **Step 5: Контроллер коммитит**

```bash
git add apps/client/messages
git commit -m "feat(client): i18n keys for parking_type (ru/uz/en)"
```

---

### Task 7: Деталь (Facts)

**Files:** `apps/client/src/features/detail/Facts.tsx`

**Interfaces:** Consumes `Listing.parkingType`, `enums.parking.*`, `listing.facts.parking`.

- [ ] **Step 1: Иконка + Fact**

```tsx
// импорт lucide (добавить SquareParking):
import { Bed, Bath, Ruler, Layers, CalendarDays, SquareParking, type LucideIcon } from 'lucide-react';
// нужен tEnums неймспейс 'enums' (если в Facts его нет — добавить const tEnums = useTranslations('enums')):
// после блока bathrooms/year:
  if (listing.parkingType) {
    items.push(<Fact key="parking" icon={SquareParking} label={t('facts.parking')} value={tEnums(`parking.${listing.parkingType}`)} />);
  }
```

(`t` — неймспейс `listing`; `tEnums` — `enums`. Сверь, какие хуки уже объявлены в Facts.)

- [ ] **Step 2: Сборка** — `tsc --noEmit` чисто. **В `specs()`/карточку НЕ добавляем.**

- [ ] **Step 3: Контроллер коммитит**

```bash
git add apps/client/src/features/detail/Facts.tsx
git commit -m "feat(client): show parking type on detail"
```

---

### Task 8: Визард create + edit

**Files:** `apps/client/src/features/listing-new/ListingNew.tsx`, `listing-edit/ListingEdit.tsx`

**Interfaces:** Consumes `PARKING_TYPES`, `listingNew.fields.parking.*`, `enums.parking.*`; Produces `body.parking_type`.

- [ ] **Step 1: ListingNew — стейт + нормализация**

```ts
// FormState (после bathrooms): parking: string;   // '' = Нет
// INITIAL: parking: '',
// buildBody (после bathrooms, внутри тела): 
      if (f.parking) body.parking_type = f.parking as ParkingType;
```

Импортировать `PARKING_TYPES` (и тип `ParkingType`) из `@/lib/mock/types`. НЕ добавлять в валидацию.

- [ ] **Step 2: ListingNew — поле в шаге 3** (Chip-группа single-select c «Нет», зеркало блока `type`/комнат)

```tsx
            <FormField label={t('fields.parking.label')}>
              <div className="flex flex-wrap gap-2">
                <Chip active={f.parking === ''} onClick={() => set('parking', '')}>
                  {t('fields.parking.none')}
                </Chip>
                {PARKING_TYPES.map((p) => (
                  <Chip key={p} active={f.parking === p} onClick={() => set('parking', p)}>
                    {tEnums(`parking.${p}`)}
                  </Chip>
                ))}
              </div>
            </FormField>
```

(Нужен `tEnums = useTranslations('enums')`, если в ListingNew его нет — добавить. Показываем для всех типов недвижимости.)

- [ ] **Step 3: ListingEdit — стейт + prefill + patch + поле**

```ts
// FormState: parking: string;
// detailToForm prefill (после bathrooms): parking: d.parking_type ?? '',
// buildPatch (после bathrooms): if (f.parking) patch.parking_type = f.parking as ParkingType;
```

Поле рендера — то же, что в ListingNew (Chip-группа с «Нет»).

- [ ] **Step 4: Сборка + линт** — `tsc --noEmit && rtk lint` чисто (проверь unused вручную).

- [ ] **Step 5: Контроллер коммитит**

```bash
git add apps/client/src/features/listing-new/ListingNew.tsx apps/client/src/features/listing-edit/ListingEdit.tsx
git commit -m "feat(client): parking field in create/edit wizard"
```

---

### Task 9: `ParkingMultiSelect` + секция в `FiltersPanel`

**Files:**
- Create: `apps/client/src/features/search/controls/ParkingMultiSelect.tsx`
- Create: `apps/client/src/features/search/controls/ParkingMultiSelect.test.tsx`
- Modify: `apps/client/src/features/search/FiltersPanel.tsx`

**Interfaces:**
- Produces: `ParkingMultiSelect` (`{ value: ParkingType[]; onChange: (next: ParkingType[]) => void }`); `FiltersPanelValues.parkingTypes?: ParkingType[]`.

- [ ] **Step 1: Падающий RTL-тест**

`ParkingMultiSelect.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ParkingMultiSelect } from './ParkingMultiSelect';

const msgs = { enums: { parking: { YARD: 'Двор', COVERED: 'Крытая', GARAGE: 'Гараж', UNDERGROUND: 'Подземная' } }, search: { filters: { deselectAll: 'Снять все' } } };
function setup(value: any[] = [], onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="ru" messages={msgs}>
      <ParkingMultiSelect value={value} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

it('клик по «Гараж» добавляет GARAGE', () => {
  const onChange = setup([]);
  fireEvent.click(screen.getByText('Гараж'));
  expect(onChange).toHaveBeenCalledWith(['GARAGE']);
});

it('повторный клик убирает тип', () => {
  const onChange = setup(['GARAGE']);
  fireEvent.click(screen.getByText('Гараж'));
  expect(onChange).toHaveBeenCalledWith([]);
});
```

- [ ] **Step 2: Прогнать — упадёт**

Run: `cd apps/client && rtk vitest run src/features/search/controls/ParkingMultiSelect.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Создать `ParkingMultiSelect.tsx`** (зеркало `HomeTypeMultiSelect`, лейблы `enums.parking.*`)

```tsx
/**
 * ParkingMultiSelect — мультивыбор типов парковки (Zillow Phase 2).
 * Чекбоксы по PARKING_TYPES; тоггл add/remove; «Снять все» → [].
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { PARKING_TYPES, type ParkingType } from '@/lib/mock/types';
import { cn } from '@/lib/utils';

export interface ParkingMultiSelectProps {
  value: ParkingType[];
  onChange: (next: ParkingType[]) => void;
}

export function ParkingMultiSelect({ value, onChange }: ParkingMultiSelectProps) {
  const tEnums = useTranslations('enums');
  const tFilters = useTranslations('search.filters');

  const toggle = (type: ParkingType) => {
    if (value.includes(type)) onChange(value.filter((v) => v !== type));
    else onChange([...value, type]);
  };

  return (
    <div className="flex flex-col gap-1">
      {PARKING_TYPES.map((type) => (
        <label
          key={type}
          className={cn(
            'inline-flex cursor-pointer items-center gap-3 rounded-lg px-3 py-[9px] text-[14.5px] font-semibold text-ink transition-colors hover:bg-mint',
            value.includes(type) && 'bg-mint',
          )}
        >
          <input
            type="checkbox"
            checked={value.includes(type)}
            onChange={() => toggle(type)}
            className="h-4 w-4 rounded border-border accent-ink"
          />
          {tEnums(`parking.${type}`)}
        </label>
      ))}
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="mt-1 self-start rounded-lg px-3 py-[7px] text-[13px] font-semibold text-muted-foreground transition-colors hover:text-ink"
        >
          {tFilters('deselectAll')}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Секция в `FiltersPanel.tsx`**

```tsx
// импорт:
import { ParkingMultiSelect } from './controls/ParkingMultiSelect';
import type { ParkingType } from '@/lib/mock/types';
// FiltersPanelValues — добавить:
  parkingTypes?: ParkingType[];
// JSX — новая секция (после блока «Тип объявления», перед «Принимает заявки»):
      <Section title={t('parkingTypesTitle')}>
        <ParkingMultiSelect
          value={draft.parkingTypes ?? []}
          onChange={(next) => patch({ parkingTypes: next.length ? next : undefined })}
        />
      </Section>
```

- [ ] **Step 5: Прогнать тест**

Run: `cd apps/client && rtk vitest run src/features/search/controls/ParkingMultiSelect.test.tsx`
Expected: PASS.

- [ ] **Step 6: Контроллер коммитит**

```bash
git add apps/client/src/features/search/controls/ParkingMultiSelect.tsx apps/client/src/features/search/controls/ParkingMultiSelect.test.tsx apps/client/src/features/search/FiltersPanel.tsx
git commit -m "feat(client): ParkingMultiSelect + panel parking section"
```

---

### Task 10: Проводка `FilterBar` (repeated param) + чип + saved search + парсинг

**Files:** `apps/client/src/features/search/FilterBar.tsx`, `ActiveFilters.tsx`,
`apps/client/src/lib/savedSearch.ts`, `apps/client/src/app/[locale]/search/page.tsx`

**Interfaces:** Consumes `FiltersPanelValues.parkingTypes` (Task 9), `parking_type` query, `enums.parking.*`/`search.filters.parkingCount`.

- [ ] **Step 1: `FilterBar.tsx` — `FilterValues` + `extraActive` + `panelValues`**

```ts
// FilterValues (в расширенных): parkingTypes?: ParkingType[];   (импорт ParkingType)
// extraActive — добавить в условие: || (values.parkingTypes?.length ?? 0) > 0
// panelValues — добавить: parkingTypes: values.parkingTypes,
// buildFilters (рядом с tours_enabled): 
    if (values.parkingTypes && values.parkingTypes.length > 0) filters.parking_types = values.parkingTypes;
```

- [ ] **Step 2: `FilterBar.tsx` — переписать `handlePanelApply` на единый `router.replace`**

`parking_type` — ПОВТОРЯЮЩИЙСЯ параметр; `setParams` умеет только `set`. Заменить тело `handlePanelApply` на ручной билдер (скаляры + append parking) в один replace:

```ts
  const handlePanelApply = React.useCallback(
    (next: FiltersPanelValues) => {
      const params = new URLSearchParams(searchParams.toString());
      const setOne = (k: string, v: string | number | undefined) => {
        if (v == null || v === '') params.delete(k);
        else params.set(k, String(v));
      };
      setOne('rooms_min', next.roomsMin);
      if (next.roomsMin != null) params.delete('rooms');
      setOne('bathrooms_min', next.bathroomsMin);
      setOne('area_min', next.areaMin);
      setOne('area_max', next.areaMax);
      setOne('year_min', next.yearMin);
      setOne('year_max', next.yearMax);
      setOne('floor_min', next.floorMin);
      setOne('floor_max', next.floorMax);
      setOne('total_floors_min', next.totalFloorsMin);
      setOne('total_floors_max', next.totalFloorsMax);
      setOne('not_first_floor', next.notFirstFloor ? 'true' : undefined);
      setOne('not_last_floor', next.notLastFloor ? 'true' : undefined);
      setOne('listing_source', next.listingSource);
      setOne('tours_enabled', next.toursEnabled ? 'true' : undefined);
      params.delete('parking_type');
      for (const pt of next.parkingTypes ?? []) params.append('parking_type', pt);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );
```

В `handlePanelReset` (через `setParams`) добавить `parking_type: undefined` (delete удалит все повторы).

- [ ] **Step 3: `ActiveFilters.tsx` — чип `__parking` + reset**

```ts
// после блока types/__types:
  if (values.parkingTypes && values.parkingTypes.length > 0) {
    const label = values.parkingTypes.length > 1
      ? t('parkingCount', { count: String(values.parkingTypes.length) })
      : tEnums(`parking.${values.parkingTypes[0]}`);
    chips.push({ key: 'parking', label, param: '__parking' });
  }
// handleRemove — новая ветка (зеркало __types):
    } else if (chip.param === '__parking') {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('parking_type');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
// handleResetAll keysToDelete — добавить 'parking_type'
```

(`tEnums` — неймспейс `enums`; если в ActiveFilters его нет, добавить `const tEnums = useTranslations('enums')`.)

- [ ] **Step 4: `savedSearch.ts`**

```ts
// describeFilters — рядом с property_type: 
  const parking = Array.isArray(filters.parking_types) ? (filters.parking_types as string[]) : [];
  if (parking.length) parts.push(t('search.filters.parkingTypesTitle'));
// filtersToSearchHref — повторяющийся parking_type:
  if (Array.isArray(filters.parking_types)) {
    for (const p of filters.parking_types as string[]) hrefParams.append('parking_type', p);
  }
```

(Сверь точные имена локальных переменных href в `filtersToSearchHref` — используй ту же `URLSearchParams`, что и для остальных; если функция строит строку через хелпер `set`, добавь append-эквивалент.)

- [ ] **Step 5: Парсинг `search/page.tsx`** (зеркало `types`, строки 159-163)

```ts
// noindex long-tail (рядом с bathrooms_min): sp.parking_type ||
// после блока types:
  const rawParking = Array.isArray(sp.parking_type) ? sp.parking_type : sp.parking_type ? [sp.parking_type] : [];
  const parkingTypes = rawParking.filter((p): p is ParkingType => PARKING_TYPES.includes(p as ParkingType));
// в filter (ListingFilter) и filterValues (FilterValues):
  parkingTypes: parkingTypes.length > 0 ? parkingTypes : undefined,
```

(Импортировать `PARKING_TYPES`, `ParkingType` из `@/lib/mock/types`.)

- [ ] **Step 6: Сборка + линт** — `tsc --noEmit && rtk lint` чисто.

- [ ] **Step 7: Контроллер коммитит**

```bash
git add apps/client/src/features/search/FilterBar.tsx apps/client/src/features/search/ActiveFilters.tsx apps/client/src/lib/savedSearch.ts "apps/client/src/app/[locale]/search/page.tsx"
git commit -m "feat(client): wire parking_type through filters, chips, saved search, SSR"
```

---

### Task 11: Тесты + финализация PR #2

- [ ] **Step 1: Тесты** — `cd apps/client && rtk vitest run` → PASS кроме 2 предсущ. `LoginModal`.
- [ ] **Step 2: Сборка** — `cd apps/client && rtk pnpm exec next build` → успешно (при сомнении — raw-вывод).
- [ ] **Step 3: DONE (контроллер)** — запись PR #2.
- [ ] **Step 4: Контроллер коммитит + PR**

```bash
git add docs/DONE.md
git commit -m "docs: DONE entry for parking client"
git push -u origin feat/listing-parking-client
```
PR title: `feat(client): parking type in wizard, detail and search filter (Zillow Phase 2 client)`

**Verify (PR #2):** визард создаёт/редактирует тип парковки (опц.); деталь показывает тип; мега-панель «Парковка» (мультивыбор) пишет повторяющийся `parking_type` и сужает выдачу; чип/сброс/save-search работают; SSR сохраняет; lint/build/тесты зелёные.

---

# PR #3 — `apps/web` (ветка `feat/listing-parking-admin`)

Делегировать `avino-impl` (папка `apps/web`). **После мёржа PR #1.** Маленький.

### Task 12: Тип парковки в модерации

**Files:** `apps/web/src/store/api/adminTypes.ts`, `apps/web/src/app/admin/listings/[id]/page.tsx`

**Interfaces:** Consumes `parking_type` в detail-ответе (PR #1).

- [ ] **Step 1: Тип** — в `ListingDetail` (`adminTypes.ts`, рядом с `bathrooms`):

```ts
  parking_type: 'YARD' | 'COVERED' | 'GARAGE' | 'UNDERGROUND' | null;
```

- [ ] **Step 2: Отображение** — в спек-строке детали (`[id]/page.tsx`, рядом с санузлами) добавить тип парковки с hardcode-маппингом лейбла (i18n в web нет):

```tsx
{data?.parking_type && (
  <><span>{({ YARD: 'Двор', COVERED: 'Крытая', GARAGE: 'Гараж', UNDERGROUND: 'Подземная' } as const)[data.parking_type]}</span><span>·</span></>
)}
```

(Вставить в ту же строку `<div className="row…">` после блока санузлов; сверь точную разметку.)

- [ ] **Step 3: Сборка** — `cd apps/web && rtk pnpm exec tsc --noEmit && rtk lint` чисто.

- [ ] **Step 4: DONE (контроллер) + коммит + PR**

```bash
git add apps/web/src/store/api/adminTypes.ts "apps/web/src/app/admin/listings/[id]/page.tsx" docs/DONE.md
git commit -m "feat(web): show parking type in moderation detail"
git push -u origin feat/listing-parking-admin
```
PR title: `feat(web): show parking type in moderation (Zillow Phase 2 admin)`

**Verify (PR #3):** карточка модерации показывает тип парковки; tsc/lint зелёные.

---

## Self-Review

**Spec coverage:**
- A.1 enum/схема/миграция → Task 1 ✓
- A.2 DTO (create/update/search) → Task 2 (create/update), Task 3 (search) ✓
- A.3 сервисы → Task 2, Task 3 ✓
- A.4 тесты + openapi → Task 2/3 (specs), Task 4 (openapi) ✓
- B.1 визард → Task 8 ✓
- B.2 отображение (деталь, типы/маппинг) → Task 5, Task 7 ✓
- B.3 фильтр мега-панель → Task 9, Task 10 ✓
- B.4 i18n → Task 6 ✓
- B.5 тесты → Task 9 (control), Task 11 ✓
- C web → Task 12 ✓

**Доп. покрытие:** `ListingDetailResponse`/`ListingListItem` + selects/маппинги (Task 2). `handlePanelApply` переписан на единый replace (Task 10 Step 2) — `parking_type` повторяющийся, `setParams` его не пишет (ключевой нюанс). SEO-noindex `parking_type` (Task 10 Step 5).

**Type consistency:** `parking_type` (контракт snake) ↔ `parkingType` (Prisma camel / UI `Listing.parkingType`) ↔ `parkingTypes` (client `ListingFilter`/`FilterValues`/`FiltersPanelValues` массив) — единообразно. enum значения `YARD/COVERED/GARAGE/UNDERGROUND` везде. `ParkingMultiSelect.onChange(next: ParkingType[])` согласован с Task 9 Step 4. Импорт `ParkingType` из `@prisma/client` (api) / `@/lib/mock/types` (client).

**Placeholder scan:** реальный код/SQL/JSON во всех шагах; `ADR-0109`/`<ts>` — намеренные (номер/таймстамп присваивает контроллер). i18n-блоки Task 6 — намеренно по неймспейсам (инструкция о вложенности дана).
