# Zillow-фильтры Фаза 2 — Площадь участка (`lot_area`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить характеристику «площадь участка» (`lot_area`, соток) сквозной вертикалью: колонка+миграция → визард create/edit (HOUSE+LAND) → деталь/модерация → диапазон-фильтр API → секция RangeFields в мега-панели.

**Architecture:** `lot_area` — **новое отдельное поле** (Decimal соток), nullable, аддитивно (текущий `area`/`landArea`-показ НЕ трогаем). Зеркалит существующий `area`: create/update DTO — строка-Decimal (`@Matches(DECIMAL_2)`), search — числа `lot_area_min/max` (`@IsNumber @Min(0)`), `buildWhereSql` — `lot_area >= / <= ::numeric`. UI фильтра — `RangeFields` (уже есть), новый компонент НЕ нужен.

**Tech Stack:** NestJS + Prisma (raw SQL migration) + class-validator; Next.js + RTK Query + next-intl + Tailwind; Vitest.

## Global Constraints

- **Источник дизайна:** `docs/superpowers/specs/2026-06-27-zillow-filters-phase2-lot-area-design.md`.
- **Одна app-папка = один PR:** PR #1 `apps/api`, PR #2 `apps/client`, PR #3 `apps/web`. Порядок: **PR #1 → мёрж → PR #2 + PR #3**.
- **Субагенты НЕ трогают git** — пишут код, гоняют lint/build/test, перечисляют изменённые файлы. Коммиты/ветки/PR — контроллер.
- **`main` защищён** — PR открывает контроллер, мёржит пользователь.
- **GitHub** — токен из `~/.gh_token` (не печатать). Git-мутации по одной команде.
- **После правки `schema.prisma`** — `prisma generate`.
- **`/search` публичный** → regen `openapi.{public,internal}.json` в том же PR.
- **i18n** — ключи во ВСЕ три `apps/client/messages/{ru,uz,en}.json`; mocked next-intl скрывает отсутствующие → проверить вручную. eslint apps/client не ловит unused imports → вручную.
- **Аддитивность:** существующий `area` (м²) и `units.landArea`/`format.ts:144` (LAND→«X м² участок») **НЕ трогать**.
- **Единицы — соток** (Decimal(10,2)). Таблица — `listings`. `DECIMAL_2` regex уже есть в `create-listing.dto.ts`.
- **Предсущ. фейлы:** `LoginModal.test` (2 failed) — не регресс.

---

# PR #1 — `apps/api` (ветка `feat/listing-lot-area-api`)

Делегировать `avino-impl` (папка `apps/api`). Мёржится первым.

### Task 1: Колонка `lot_area` + миграция

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (модель `Listing`, рядом с `area`)
- Create: `apps/api/prisma/migrations/20260627100000_add_listing_lot_area/migration.sql`

**Interfaces:**
- Produces: колонка `listings.lot_area DECIMAL(10,2) NULL`; Prisma-поле `Listing.lotArea Decimal?`.

- [ ] **Step 1: Поле в схему** — после `area Decimal? @db.Decimal(10, 2)`:

```prisma
  lotArea            Decimal?                               @map("lot_area") @db.Decimal(10, 2)
```

- [ ] **Step 2: Миграция** — `apps/api/prisma/migrations/20260627100000_add_listing_lot_area/migration.sql`:

```sql
-- Generated to match schema.prisma (no local shadow DB). Apply on staging/CI with
-- `prisma migrate deploy`; if applied out-of-band, verify then
-- `prisma migrate resolve --applied 20260627100000_add_listing_lot_area`.

-- AlterTable
ALTER TABLE "listings" ADD COLUMN "lot_area" DECIMAL(10,2);
```

- [ ] **Step 3: Generate** — `cd apps/api && rtk prisma generate` → `Listing` содержит `lotArea`.

- [ ] **Step 4: Контроллер коммитит**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260627100000_add_listing_lot_area
git commit -m "feat(listings): add lot_area column + migration"
```

---

### Task 2: `lot_area` в DTO, сервисе, ответах

**Files:**
- Modify: `apps/api/src/listings/dto/create-listing.dto.ts`, `update-listing.dto.ts`
- Modify: `apps/api/src/listings/listings.service.ts`
- Test: `apps/api/src/listings/listings.service.spec.ts`

**Interfaces:**
- Produces: create/update принимают `lot_area?: string`; `ListingDetailResponse.lot_area` / `ListingListItem.lot_area` (`string | null`).

- [ ] **Step 1: DTO create + update** — после блока `area?: string` (зеркало `area`):

```ts
  @IsOptional()
  @Matches(DECIMAL_2, { message: 'lot_area must be a decimal string with up to 2 fraction digits' })
  lot_area?: string;
```

- [ ] **Step 2: `listings.service.ts`** — `lot_area`/`lotArea` рядом с `area`:

```ts
// ListingScalarInput (snake):       lot_area?: string;
// ListingScalarData (camel):        lotArea?: string;
// ListingDetailResponse:            lot_area: string | null;
// LISTING_DETAIL_SELECT:            lotArea: true,
// ListingListItem:                  lot_area: string | null;
// LISTING_LIST_SELECT:              lotArea: true,
// toScalarData (после area):        if (dto.lot_area !== undefined) data.lotArea = dto.lot_area;
// toListItem маппинг (рядом с area: listing.area?.toFixed(2) ?? null):
//                                   lot_area: listing.lotArea?.toFixed(2) ?? null,
// toDetailResponse маппинг (аналогично):
//                                   lot_area: listing.lotArea?.toFixed(2) ?? null,
```

- [ ] **Step 3: Юнит-тест** — в `listings.service.spec.ts` добавить `lot_area: '5.50'` во входной create-DTO + ассерт `data.lotArea === '5.50'`; update-кейс — `lot_area: '7.00'`, проверить `data.lotArea === '7.00'`.

- [ ] **Step 4: Прогнать** — `cd apps/api && rtk vitest run src/listings/listings.service.spec.ts` → PASS.

- [ ] **Step 5: Контроллер коммитит**

```bash
git add apps/api/src/listings
git commit -m "feat(listings): accept and return lot_area"
```

---

### Task 3: Фильтр-диапазон `lot_area_min/max`

**Files:**
- Modify: `apps/api/src/search/dto/search-listings.dto.ts` (зеркало `area_min/max`)
- Modify: `apps/api/src/search/search.service.ts` (SearchListItem, SEARCH_SELECT, buildWhereSql ~стр.782, toSearchItem)
- Test: `apps/api/src/search/search.service.int-spec.ts`

**Interfaces:**
- Produces: query-параметры `lot_area_min`/`lot_area_max`; `SearchListItem.lot_area: string | null`.

- [ ] **Step 1: Падающий int-тест** — зеркало `area`-кейса:

```ts
it('lot_area_min/max фильтрует диапазон, NULL исключает', async () => {
  // фикстуры: lotArea '3.00', '6.00', '12.00', null
  const res = await service.search({ lot_area_min: 5, lot_area_max: 10 } as any);
  const ids = res.data.map((l) => l.id);
  expect(ids).toContain(listing6.id);
  expect(ids).not.toContain(listing3.id);
  expect(ids).not.toContain(listing12.id);
  expect(ids).not.toContain(listingNullLot.id);
});
```

(Добавить `lotArea` в фикстуры-сидеры рядом с `parkingType`/`bathrooms`.)

- [ ] **Step 2: Прогнать — упадёт** — `cd apps/api && rtk vitest run src/search/search.service.int-spec.ts -t lot_area` → FAIL.

- [ ] **Step 3: DTO-параметры** (зеркало `area_min/max`):

```ts
  /** Площадь участка, соток (Zillow Phase 2). */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lot_area_min?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lot_area_max?: number;
```

- [ ] **Step 4: Применить в сервисе**

```ts
// SearchListItem (рядом с rooms/bathrooms):  lot_area: string | null;
// SEARCH_SELECT:                             lotArea: true,
// buildWhereSql — рядом с area (стр.782):
    if (query.lot_area_min !== undefined)
      conds.push(Prisma.sql`lot_area >= ${query.lot_area_min}::numeric`);
    if (query.lot_area_max !== undefined)
      conds.push(Prisma.sql`lot_area <= ${query.lot_area_max}::numeric`);
// toSearchItem маппинг:                      lot_area: listing.lotArea?.toFixed(2) ?? null,
```

- [ ] **Step 5: Прогнать — пройдёт** — `cd apps/api && rtk vitest run src/search/search.service.int-spec.ts` → PASS.

- [ ] **Step 6: Контроллер коммитит**

```bash
git add apps/api/src/search
git commit -m "feat(search): add lot_area_min/max filter"
```

---

### Task 4: Regen OpenAPI + финализация PR #1

- [ ] **Step 1: Билд+линт** — `cd apps/api && rtk tsc && rtk lint` → чисто.
- [ ] **Step 2: Regen** — `cd apps/api && rtk pnpm openapi:export` (4 dummy env); проверь `lot_area_min`/`lot_area`/`lot_area_max` в openapi (search query + Create/Update body).
- [ ] **Step 3: ADR-0110 + DONE** (контроллер) — `docs/adr/ADR-0110-listing-lot-area.md` (решение: соток, аддитивно, Decimal) + запись в `docs/DONE.md`.
- [ ] **Step 4: Контроллер коммитит + PR**

```bash
git add apps/api/openapi.public.json apps/api/openapi.internal.json docs/DONE.md docs/adr
git commit -m "docs(api): regen openapi + ADR/DONE for lot_area"
git push -u origin feat/listing-lot-area-api
```
PR title: `feat(listings): lot_area column + lot_area_min/max filter (Zillow Phase 2 API)`

**Verify (PR #1):** `GET /search?lot_area_min=5&lot_area_max=10` сужает; NULL исключается; create/update сохраняют; detail/list отдают; невалидное → 400; int/unit-spec зелёные; openapi drift зелёный.

---

# PR #2 — `apps/client` (ветка `feat/listing-lot-area-client`)

Делегировать `avino-impl` (папка `apps/client`). **После мёржа PR #1.** Донор — `area`/`areaMin/areaMax`/RangeFields.

### Task 5: Типы и плюмбинг

**Files:** `apps/client/src/lib/mock/types.ts`, `lib/api/listings.ts`, `store/api/{createListingApi,listingEditApi,favoritesApi}.ts`

**Interfaces:**
- Produces: `Listing.lotArea?: string`, `ListingFilter.lotAreaMin?: number`/`lotAreaMax?: number`; маппинг + `buildSearchParams` пишут `lot_area_min/max`.

- [ ] **Step 1: `mock/types.ts`**

```ts
// interface Listing — после area:
  lotArea?: string;
// interface ListingFilter — рядом с areaMin/areaMax:
  lotAreaMin?: number;
  lotAreaMax?: number;
```

- [ ] **Step 2: `lib/api/listings.ts`**

```ts
// ApiSearchItem + ApiListingDetail (рядом с area/rooms):
  lot_area: string | null;
// mapListing (рядом с area):
    lotArea: (api as ApiSearchItem | ApiListingDetail).lot_area ?? undefined,
// buildSearchParams (рядом с area_min/max):
  if (filter.lotAreaMin != null) params.set('lot_area_min', String(filter.lotAreaMin));
  if (filter.lotAreaMax != null) params.set('lot_area_max', String(filter.lotAreaMax));
```

- [ ] **Step 3: RTK-типы** — `lot_area?: string` в `CreateListingBody` (`createListingApi.ts`) и `UpdateListingPatch` (`listingEditApi.ts`); `lot_area: string | null` в `EditListingDetail` (`listingEditApi.ts`) и `FavoriteSearchItem` (`favoritesApi.ts`).

- [ ] **Step 4: Сборка** — `cd apps/client && rtk pnpm exec tsc --noEmit` → чисто.

- [ ] **Step 5: Контроллер коммитит**

```bash
git add apps/client/src/lib/mock/types.ts apps/client/src/lib/api/listings.ts apps/client/src/store/api/createListingApi.ts apps/client/src/store/api/listingEditApi.ts apps/client/src/store/api/favoritesApi.ts
git commit -m "feat(client): lot_area in types, query and RTK API"
```

---

### Task 6: i18n (ru/uz/en)

**Files:** `apps/client/messages/{ru,uz,en}.json`

**Interfaces:** Produces `units.lotArea`, `search.filters.lotAreaTitle`, `listing.facts.lotArea`, `listingNew.fields.lotArea.{label,placeholder}`.

- [ ] **Step 1: ru.json**

```jsonc
// units (рядом с area/landArea):
"lotArea": "{value} соток",
// search.filters:
"lotAreaTitle": "Площадь участка",
// listing.facts:
"lotArea": "Участок",
// listingNew.fields:
"lotArea": { "label": "Площадь участка, соток", "placeholder": "например, 6" }
```

- [ ] **Step 2: uz.json**

```jsonc
"lotArea": "{value} sotix",
"lotAreaTitle": "Yer uchastkasi",
"lotArea": "Uchastka",
"lotArea": { "label": "Yer maydoni, sotix", "placeholder": "masalan, 6" }
```

- [ ] **Step 3: en.json**

```jsonc
"lotArea": "{value} sotka",
"lotAreaTitle": "Lot size",
"lotArea": "Lot",
"lotArea": { "label": "Lot size, sotka", "placeholder": "e.g. 6" }
```

> Размести по правильным неймспейсам (`units.lotArea`, `search.filters.lotAreaTitle`, `listing.facts.lotArea`, `listingNew.fields.lotArea`) — сверь вложенность `area`/`fields.area`.

- [ ] **Step 4: Валидность JSON** — `cd apps/client && node -e "['ru','uz','en'].forEach(l=>JSON.parse(require('fs').readFileSync('messages/'+l+'.json')))"` → без ошибок.

- [ ] **Step 5: Контроллер коммитит**

```bash
git add apps/client/messages
git commit -m "feat(client): i18n keys for lot_area (ru/uz/en)"
```

---

### Task 7: Деталь (Facts)

**Files:** `apps/client/src/features/detail/Facts.tsx`

- [ ] **Step 1: Иконка + Fact** — `Trees` из lucide:

```tsx
// импорт lucide (добавить Trees):
import { Bed, Bath, Ruler, Layers, CalendarDays, SquareParking, Trees, type LucideIcon } from 'lucide-react';
// после блока parking:
  if (listing.lotArea) {
    items.push(<Fact key="lotArea" icon={Trees} label={t('facts.lotArea')} value={tUnits('lotArea', { value: listing.lotArea })} />);
  }
```

(`t` — `listing`, `tUnits` — `units`. **В `specs()`/карточку НЕ добавляем.**)

- [ ] **Step 2: Сборка** — `tsc --noEmit` чисто.

- [ ] **Step 3: Контроллер коммитит**

```bash
git add apps/client/src/features/detail/Facts.tsx
git commit -m "feat(client): show lot area on detail"
```

---

### Task 8: Визард create + edit (HOUSE+LAND)

**Files:** `apps/client/src/features/listing-new/ListingNew.tsx`, `listing-edit/ListingEdit.tsx`

- [ ] **Step 1: ListingNew — стейт + нормализация**

```ts
// FormState (после area): lotArea: string;
// INITIAL: lotArea: '',
// buildBody (после `if (f.area) body.area = f.area;`):
      if (f.lotArea) body.lot_area = f.lotArea;
```

НЕ добавлять в валидацию `canNext`.

- [ ] **Step 2: ListingNew — поле в шаге 3** (числовой ввод, как `area`; только HOUSE+LAND)

```tsx
            {(f.type === 'HOUSE' || f.type === 'LAND') && (
              <FormField label={t('fields.lotArea.label')}>
                <Field
                  placeholder={t('fields.lotArea.placeholder')}
                  inputMode="decimal"
                  value={f.lotArea}
                  onChange={(e) => set('lotArea', e.target.value.replace(/[^\d.]/g, ''))}
                />
              </FormField>
            )}
```

(Сверь компонент `Field` и стиль соседнего поля `area`.)

- [ ] **Step 3: ListingEdit — стейт + prefill + patch + поле**

```ts
// FormState: lotArea: string;
// detailToForm prefill (после area): lotArea: d.lot_area ?? '',
// buildPatch (после area): if (f.lotArea) patch.lot_area = f.lotArea;
```

Поле рендера — то же (числовой ввод, гейт HOUSE+LAND).

- [ ] **Step 4: Сборка+линт** — `tsc --noEmit && rtk lint` чисто (unused вручную).

- [ ] **Step 5: Контроллер коммитит**

```bash
git add apps/client/src/features/listing-new/ListingNew.tsx apps/client/src/features/listing-edit/ListingEdit.tsx
git commit -m "feat(client): lot area field in create/edit wizard (HOUSE+LAND)"
```

---

### Task 9: Фильтр — мега-панель + проводка + чип + saved search + парсинг

**Files:** `apps/client/src/features/search/FiltersPanel.tsx`, `FilterBar.tsx`,
`ActiveFilters.tsx`, `apps/client/src/lib/savedSearch.ts`, `app/[locale]/search/page.tsx`

**Interfaces:** Consumes `FiltersPanelValues.lotAreaMin/lotAreaMax`, `lot_area_min/max` query.

- [ ] **Step 1: `FiltersPanel.tsx` — секция (зеркало «Площадь, м²»)**

```tsx
// FiltersPanelValues — добавить:
  lotAreaMin?: string;
  lotAreaMax?: string;
// JSX — новая секция (после «Площадь, м²» или рядом):
      <Section title={t('lotAreaTitle')}>
        <RangeFields
          min={draft.lotAreaMin ?? ''}
          max={draft.lotAreaMax ?? ''}
          onMin={(v) => patch({ lotAreaMin: v || undefined })}
          onMax={(v) => patch({ lotAreaMax: v || undefined })}
          fromLabel={t('rangeFrom')}
          toLabel={t('rangeTo')}
          suffix="соток"
        />
      </Section>
```

- [ ] **Step 2: `FilterBar.tsx`**

```ts
// FilterValues (расширенные): lotAreaMin?: string; lotAreaMax?: string;
// extraActive — добавить: || values.lotAreaMin || values.lotAreaMax
// panelValues — добавить: lotAreaMin: values.lotAreaMin, lotAreaMax: values.lotAreaMax,
// handlePanelApply — добавить два setOne (рядом с area_min/max):
      setOne('lot_area_min', next.lotAreaMin);
      setOne('lot_area_max', next.lotAreaMax);
// handlePanelReset (setParams) — добавить: lot_area_min: undefined, lot_area_max: undefined,
// buildFilters (рядом с area_min/max):
    if (values.lotAreaMin) filters.lot_area_min = values.lotAreaMin;
    if (values.lotAreaMax) filters.lot_area_max = values.lotAreaMax;
```

- [ ] **Step 3: `ActiveFilters.tsx` — чип `__lot_area` (зеркало `__area`)**

```ts
// после блока area:
  if (values.lotAreaMin || values.lotAreaMax) {
    const label = t('lotAreaTitle') + ': ' + (values.lotAreaMin || '0') + '–' + (values.lotAreaMax || '∞');
    chips.push({ key: 'lot_area', label, param: '__lot_area' });
  }
// handleRemove — ветка:
    } else if (chip.param === '__lot_area') {
      setParams({ lot_area_min: undefined, lot_area_max: undefined });
// handleResetAll keysToDelete — добавить 'lot_area_min', 'lot_area_max'
```

(Сверь точную форму area-чипа/лейбла — зеркаль её.)

- [ ] **Step 4: `savedSearch.ts`**

```ts
// describeFilters (рядом с area):
  const lotMin = asString(filters.lot_area_min);
  const lotMax = asString(filters.lot_area_max);
  if (lotMin || lotMax) parts.push(`${t('search.filters.lotAreaTitle')}: ${lotMin || '0'}–${lotMax || '∞'}`);
// filtersToSearchHref (рядом с area_min/max):
  set('lot_area_min', asString(filters.lot_area_min));
  set('lot_area_max', asString(filters.lot_area_max));
```

- [ ] **Step 5: Парсинг `search/page.tsx`** (зеркало `area`)

```ts
// noindex long-tail — добавить: sp.lot_area_min || sp.lot_area_max ||
// рядом с areaMinRaw/areaMaxRaw:
  const lotAreaMinRaw = first(sp.lot_area_min);
  const lotAreaMaxRaw = first(sp.lot_area_max);
// в filter (ListingFilter — числа):
    lotAreaMin: toNum(lotAreaMinRaw),
    lotAreaMax: toNum(lotAreaMaxRaw),
// в filterValues (FilterValues — строки):
    lotAreaMin: lotAreaMinRaw,
    lotAreaMax: lotAreaMaxRaw,
```

- [ ] **Step 6: Сборка+линт** — `tsc --noEmit && rtk lint` чисто.

- [ ] **Step 7: Контроллер коммитит**

```bash
git add apps/client/src/features/search/FiltersPanel.tsx apps/client/src/features/search/FilterBar.tsx apps/client/src/features/search/ActiveFilters.tsx apps/client/src/lib/savedSearch.ts "apps/client/src/app/[locale]/search/page.tsx"
git commit -m "feat(client): wire lot_area_min/max through panel, chip, saved search, SSR"
```

---

### Task 10: Тесты + финализация PR #2

- [ ] **Step 1: Тесты** — `cd apps/client && rtk vitest run` → PASS кроме 2 предсущ. `LoginModal`.
- [ ] **Step 2: Сборка** — `cd apps/client && rtk pnpm exec next build` → успешно.
- [ ] **Step 3: DONE (контроллер)** — запись PR #2.
- [ ] **Step 4: Контроллер коммитит + PR**

```bash
git add docs/DONE.md
git commit -m "docs: DONE entry for lot area client"
git push -u origin feat/listing-lot-area-client
```
PR title: `feat(client): lot area in wizard, detail and search filter (Zillow Phase 2 client)`

**Verify (PR #2):** визард (HOUSE+LAND, опц.) создаёт/редактирует площадь участка; деталь показывает «X соток»; мега-панель «Площадь участка» (RangeFields) пишет `lot_area_min/max` и сужает выдачу; чип/сброс/save-search работают; SSR сохраняет; lint/build/тесты зелёные.

---

# PR #3 — `apps/web` (ветка `feat/listing-lot-area-admin`)

Делегировать `avino-impl` (папка `apps/web`). **После мёржа PR #1.** Маленький.

### Task 11: Площадь участка в модерации

**Files:** `apps/web/src/store/api/adminTypes.ts`, `apps/web/src/app/admin/listings/[id]/page.tsx`

- [ ] **Step 1: Тип** — в `ListingDetail` (рядом с `area`):

```ts
  lot_area: string | null;
```

- [ ] **Step 2: Отображение** — в спек-строке детали (рядом с площадью/санузлами):

```tsx
{data?.lot_area && (<><span>{data.lot_area} соток</span><span>·</span></>)}
```

(Сверь точную разметку строки; используй `data` как для bathrooms/parking.)

- [ ] **Step 3: Сборка** — `cd apps/web && rtk pnpm exec tsc --noEmit && rtk lint` чисто.

- [ ] **Step 4: DONE (контроллер) + коммит + PR**

```bash
git add apps/web/src/store/api/adminTypes.ts "apps/web/src/app/admin/listings/[id]/page.tsx" docs/DONE.md
git commit -m "feat(web): show lot area in moderation detail"
git push -u origin feat/listing-lot-area-admin
```
PR title: `feat(web): show lot area in moderation (Zillow Phase 2 admin)`

**Verify (PR #3):** карточка модерации показывает «X соток»; tsc/lint зелёные.

---

## Self-Review

**Spec coverage:**
- A.1 колонка/миграция → Task 1 ✓
- A.2 DTO (create/update/search) → Task 2, Task 3 ✓
- A.3 сервисы → Task 2, Task 3 ✓
- A.4 тесты+openapi → Task 2/3, Task 4 ✓
- B.1 визард → Task 8 ✓
- B.2 отображение → Task 5, Task 7 ✓
- B.3 фильтр мега-панель → Task 9 ✓
- B.4 i18n → Task 6 ✓
- B.5 тесты → Task 10 ✓
- C web → Task 11 ✓

**Доп. покрытие:** `ListingDetailResponse`/`ListingListItem` + selects/маппинги (Task 2). `handlePanelApply` — уже единый `router.replace` (после парковки), lot_area = +2 `setOne` (Task 9 Step 2), переписывать НЕ нужно. SEO-noindex `lot_area_*` (Task 9 Step 5). landArea-хак НЕ трогаем (аддитивно).

**Type consistency:** `lot_area` (контракт snake, string Decimal в create/update/ответах) ↔ `lotArea` (Prisma camel / UI `Listing.lotArea`) ↔ `lotAreaMin`/`lotAreaMax` (client filter: числа в `ListingFilter`, строки в `FilterValues`/`FiltersPanelValues` — как `area`). Search-параметры `lot_area_min/max` — числа. Единообразно с донором `area`.

**Placeholder scan:** реальный код/SQL/JSON; `ADR-0110`/`<ts>` намеренные. i18n uz/en для «соток» — приближённые (`sotix`/`sotka`), по неймспейсам.
