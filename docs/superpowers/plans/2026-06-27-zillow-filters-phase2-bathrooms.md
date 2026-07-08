# Zillow-фильтры Фаза 2 — Санузлы (`bathrooms`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить характеристику «санузлы» (`bathrooms`, целое) сквозной вертикалью: миграция БД → визард create/edit → деталь/карточка/модерация → фильтр API → мега-панель «Комнаты и санузлы».

**Architecture:** Поле `bathrooms` зеркалит существующее `rooms` на каждом слое. Колонка `Int? @db.SmallInt` (nullable, без бэкфилла). Фильтр — только `bathrooms_min` (кнопки «N+»), без exact-match. Все гео-DTO наследуют `SearchListingsQueryDto`, поэтому `bathrooms_min` добавляется в один базовый DTO и покрывает `/search` + `/map`. UI: мега-панель `FiltersPanel` получает блок «Комнаты и санузлы» (строка Комнаты переиспользует `BedroomsControl` без exact-чекбокса, строка Санузлы — новый `BathroomsControl`); бар-дропдаун «Комнаты ▾» не трогаем.

**Tech Stack:** NestJS + Prisma (raw SQL migrations) + class-validator; Next.js + RTK Query + next-intl + Tailwind; Vitest + RTL.

## Global Constraints

- **Источник дизайна:** `docs/superpowers/specs/2026-06-27-zillow-filters-phase2-bathrooms-design.md`.
- **Одна app-папка = один PR** (§5 CLAUDE.md): PR #1 `apps/api`, PR #2 `apps/client`, PR #3 `apps/web`. Порядок: **PR #1 → мёрж → PR #2 + PR #3**.
- **API versioning** `/api/v1` уже глобально; новые параметры **optional** (non-breaking, §14 CLAUDE.md).
- **Субагенты НЕ трогают git** — пишут только код, гоняют lint/build/test, и в конце задачи **перечисляют изменённые файлы**. Все коммиты/ветки/PR делает контроллер (см. `avino-subagents-shared-workdir-git-hazard`). «Commit»-шаги ниже выполняет контроллер.
- **`main` защищён** — PR открывает контроллер, мёржит пользователь (никогда `--admin`).
- **GitHub-операции** токеном из `~/.gh_token` (значение не печатать). Git-мутации по одной команде (цепочки через `&&` отклоняются правами).
- **После правки `schema.prisma`** — `prisma generate` (иначе cryptic TS-ошибки `bathrooms не существует`).
- **`/search` публичный** → regen `openapi.public.json` в том же PR (CI drift-check).
- **i18n** — ключи во ВСЕ три файла `apps/client/messages/{ru,uz,en}.json`; замоканный `next-intl` в тестах скрывает отсутствующие ключи → проверить вручную. eslint `apps/client` НЕ ловит unused imports → проверить импорты вручную (см. `avino-client-test-i18n-eslint-gotchas`).
- **Таблица БД** — `listings` (`@@map("listings")`, schema.prisma:458). `SMALLINT_MAX = 32767` уже определён в `create-listing.dto.ts`.
- **Предсущ. фейлы:** `LoginModal.test` (2 failed) — не регресс (`avino-loginmodal-test-preexisting-fail`).

---

# PR #1 — `apps/api` (ветка `feat/listing-bathrooms-api`)

Делегировать `avino-impl` (одна папка `apps/api`). Мёржится первым — фундамент для PR #2/#3.

### Task 1: Миграция + колонка `bathrooms`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (модель `Listing`, после строки 410 `rooms`)
- Create: `apps/api/prisma/migrations/20260627000000_add_listing_bathrooms/migration.sql`

**Interfaces:**
- Produces: колонка `listings.bathrooms SMALLINT NULL`; Prisma-поле `Listing.bathrooms Int?`.

- [ ] **Step 1: Добавить поле в схему**

В `apps/api/prisma/schema.prisma`, в модель `Listing`, сразу после `rooms Int? @db.SmallInt` (строка 410):

```prisma
  bathrooms          Int?                                   @db.SmallInt
```

- [ ] **Step 2: Создать файл миграции**

Создать `apps/api/prisma/migrations/20260627000000_add_listing_bathrooms/migration.sql` (стиль шапки — как `20260622100000_admin_broadcast/migration.sql`):

```sql
-- Generated to match schema.prisma (no local shadow DB). Apply on staging/CI with
-- `prisma migrate deploy`; if applied out-of-band, verify then
-- `prisma migrate resolve --applied 20260627000000_add_listing_bathrooms`.

-- AlterTable
ALTER TABLE "listings" ADD COLUMN "bathrooms" SMALLINT;
```

- [ ] **Step 3: Сгенерировать Prisma-клиент**

Run: `cd apps/api && rtk prisma generate`
Expected: `Generated Prisma Client` без ошибок; тип `Listing` теперь содержит `bathrooms`.

- [ ] **Step 4: Контроллер коммитит**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260627000000_add_listing_bathrooms/migration.sql
git commit -m "feat(listings): add bathrooms column + migration"
```

---

### Task 2: `bathrooms` в DTO, сервисе и ответах listings

**Files:**
- Modify: `apps/api/src/listings/dto/create-listing.dto.ts` (после `rooms`, ~стр.108)
- Modify: `apps/api/src/listings/dto/update-listing.dto.ts` (после `rooms`, ~стр.86)
- Modify: `apps/api/src/listings/listings.service.ts` (строки 54, 87, 176, 233, 289, 319, 742, 824, 894)
- Test: `apps/api/src/listings/listings.service.spec.ts`

**Interfaces:**
- Consumes: `Listing.bathrooms` (Task 1).
- Produces: create/update принимают `bathrooms?: number`; `ListingDetailResponse.bathrooms: number | null` (читает деталь клиента и админки); `ListingListItem.bathrooms: number | null`.

- [ ] **Step 1: DTO create + update**

В `create-listing.dto.ts` и `update-listing.dto.ts` добавить **сразу после блока `rooms?`** (зеркало валидаторов):

```ts
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(SMALLINT_MAX)
  bathrooms?: number;
```

- [ ] **Step 2: Интерфейсы и маппинг в `listings.service.ts`**

Добавить `bathrooms` рядом с `rooms` в шести местах (зеркало):

```ts
// ListingScalarInput (после строки 54):
  bathrooms?: number;
// ListingScalarData (после строки 87):
  bathrooms?: number;
// ListingDetailResponse (после строки 176 `rooms: number | null;`):
  bathrooms: number | null;
// LISTING_DETAIL_SELECT (после строки 233 `rooms: true,`):
  bathrooms: true,
// ListingListItem (после строки 289 `rooms: number | null;`):
  bathrooms: number | null;
// LISTING_LIST_SELECT (после строки 319 `rooms: true,`):
  bathrooms: true,
```

В `toScalarData` (после строки 742):

```ts
    if (dto.bathrooms !== undefined) data.bathrooms = dto.bathrooms;
```

В маппинге list-item (после строки 824 `rooms: listing.rooms,`) и detail (после строки 894 `rooms: listing.rooms,`):

```ts
      bathrooms: listing.bathrooms,
```

- [ ] **Step 3: Юнит-тест create/update прокидывает bathrooms**

В `listings.service.spec.ts` — в существующий кейс создания добавить `bathrooms: 2` во входной DTO и проверить, что Prisma-`create` получил `bathrooms: 2`; в кейс update — `bathrooms: 3` и проверить `data.bathrooms === 3`. (Мирроринг существующих `rooms`-ассертов.)

- [ ] **Step 4: Прогнать тесты**

Run: `cd apps/api && rtk vitest run src/listings/listings.service.spec.ts`
Expected: PASS (включая новые ассерты bathrooms).

- [ ] **Step 5: Контроллер коммитит**

```bash
git add apps/api/src/listings
git commit -m "feat(listings): accept and return bathrooms"
```

---

### Task 3: Фильтр `bathrooms_min` в поиске (search + все гео)

**Files:**
- Modify: `apps/api/src/search/dto/search-listings.dto.ts` (после `rooms_min`, ~стр.159)
- Modify: `apps/api/src/search/search.service.ts` (строки 45, 191, 764, 884)
- Test: `apps/api/src/search/search.service.int-spec.ts`

**Interfaces:**
- Consumes: `Listing.bathrooms` (Task 1).
- Produces: query-параметр `bathrooms_min` (применяется в `/search` и всех гео-эндпоинтах через наследование `SearchListingsQueryDto`); `SearchListItem.bathrooms: number | null` (читает карточка клиента).

- [ ] **Step 1: Написать падающий int-тест**

В `search.service.int-spec.ts` добавить кейс (мирроринг `rooms_min`-теста, TASK-207):

```ts
it('bathrooms_min фильтрует bathrooms >= N, NULL исключает', async () => {
  // фикстуры с bathrooms: 1, 2, 3 и одна с bathrooms: null
  const res = await service.search({ bathrooms_min: 2 } as any);
  const ids = res.data.map((l) => l.id);
  expect(ids).toContain(listingWith2Baths.id);
  expect(ids).toContain(listingWith3Baths.id);
  expect(ids).not.toContain(listingWith1Bath.id);
  expect(ids).not.toContain(listingWithNullBaths.id);
});
```

(Добавить `bathrooms` в фикстуры-сидеры этого файла рядом с `rooms`.)

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `cd apps/api && rtk vitest run src/search/search.service.int-spec.ts -t bathrooms_min`
Expected: FAIL (параметр ещё не объявлен/не применяется).

- [ ] **Step 3: DTO-параметр**

В `search-listings.dto.ts` после блока `rooms_min` (строка 159):

```ts
  /** «N+ санузлов» (bathrooms >= N) — кнопки 1+/2+/3+/4+. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bathrooms_min?: number;
```

- [ ] **Step 4: Применить в `buildWhereSql` + select + маппинг**

В `search.service.ts`:

```ts
// SearchListItem (после строки 45 `rooms: number | null;`):
  bathrooms: number | null;
// SEARCH_SELECT (после строки 191 `rooms: true,`):
  bathrooms: true,
// buildWhereSql — сразу после блока rooms_min (строка 764):
    if (query.bathrooms_min !== undefined)
      conds.push(Prisma.sql`bathrooms >= ${query.bathrooms_min}`);
// toSearchItem (после строки 884 `rooms: listing.rooms,`):
      bathrooms: listing.bathrooms,
```

- [ ] **Step 5: Прогнать — убедиться, что прошло**

Run: `cd apps/api && rtk vitest run src/search/search.service.int-spec.ts`
Expected: PASS.

- [ ] **Step 6: Контроллер коммитит**

```bash
git add apps/api/src/search
git commit -m "feat(search): add bathrooms_min filter"
```

---

### Task 4: Regen OpenAPI + финализация PR #1

**Files:**
- Modify: `apps/api/openapi.public.json`, `apps/api/openapi.internal.json` (regen)
- Modify: `docs/DONE.md`, `docs/adr/ADR-XXXX-*.md` (или дополнить ADR фильтров Фазы 1)

- [ ] **Step 1: Полный билд + линт**

Run: `cd apps/api && rtk tsc && rtk lint`
Expected: без ошибок.

- [ ] **Step 2: Regen OpenAPI**

Run: `cd apps/api && rtk pnpm openapi:export` (с 4 dummy env, как в `avino-api-docs-two-layers`)
Expected: `bathrooms_min` появляется в `openapi.public.json`/`openapi.internal.json` рядом с `rooms_min` (несколько search-эндпоинтов).

- [ ] **Step 3: ADR + DONE (контроллер, до пуша)**

Обновить ADR фильтров Zillow (Фаза 1) разделом про санузлы ИЛИ создать новый `ADR-XXXX-zillow-filters-phase2-bathrooms.md`; добавить запись в `docs/DONE.md` (формат §DONE.md CLAUDE.md). Записать в `apps/api`-PR.

- [ ] **Step 4: Контроллер коммитит и открывает PR**

```bash
git add apps/api/openapi.public.json apps/api/openapi.internal.json docs/DONE.md docs/adr
git commit -m "docs(api): regen openapi + ADR/DONE for bathrooms"
git push -u origin feat/listing-bathrooms-api
```
PR title: `feat(listings): bathrooms column + bathrooms_min search filter (Zillow Phase 2 API)`

**Verify (PR #1):** `GET /api/v1/search?bathrooms_min=2` сужает выдачу; `POST/PATCH /listings` сохраняют `bathrooms`; `GET /listings/:id` отдаёт `bathrooms`; невалидное `bathrooms_min=x` → 400; int/unit-spec зелёные; openapi drift-check зелёный.

---

# PR #2 — `apps/client` (ветка `feat/listing-bathrooms-client`)

Делегировать `avino-impl` (папка `apps/client`). **После мёржа PR #1.** Самый большой PR.

### Task 5: Типы и плюмбинг запроса

**Files:**
- Modify: `apps/client/src/lib/mock/types.ts` (строки 92 `Listing.rooms`, 155+ `ListingFilter`)
- Modify: `apps/client/src/lib/api/listings.ts` (строки 58, 93, ~269, 381)

**Interfaces:**
- Produces: `Listing.bathrooms?: number`, `ListingFilter.bathroomsMin?: number`; маппинг API→UI заполняет `bathrooms`; `buildSearchParams` пишет `bathrooms_min`.

- [ ] **Step 1: UI-модель `mock/types.ts`**

```ts
// interface Listing — после `rooms?: number;` (строка 92):
  bathrooms?: number;
// interface ListingFilter — рядом с roomsMin (после строки ~178 «N+ комнат»):
  /** «N+ санузлов» (bathrooms_min). */
  bathroomsMin?: number;
```

- [ ] **Step 2: API-тип и маппинг `lib/api/listings.ts`**

```ts
// ApiSearchItem (после строки 58 `rooms: number | null;`):
  bathrooms: number | null;
// ApiListingDetail (после строки 93 `rooms: number | null;`):
  bathrooms: number | null;
// маппинг API→Listing (рядом со строкой 269 `rooms: api.rooms ?? undefined,`):
    bathrooms: (api as ApiSearchItem | ApiListingDetail).bathrooms ?? undefined,
// buildSearchParams (после строки 381 rooms_min):
  if (filter.bathroomsMin != null) params.set('bathrooms_min', String(filter.bathroomsMin));
```

(Сверить точную форму маппинга в строке 269 — повторить выражение, использованное для `rooms`.)

- [ ] **Step 3: Сборка**

Run: `cd apps/client && rtk pnpm exec tsc --noEmit`
Expected: без ошибок типов.

- [ ] **Step 4: Контроллер коммитит**

```bash
git add apps/client/src/lib/mock/types.ts apps/client/src/lib/api/listings.ts
git commit -m "feat(client): bathrooms in listing types and query builder"
```

---

### Task 6: i18n-ключи (ru/uz/en)

**Files:**
- Modify: `apps/client/messages/{ru,uz,en}.json`

**Interfaces:**
- Produces: ключи `search.filters.bathrooms`, `search.filters.roomsAndBathrooms`, `search.filters.bathroomsCount`, `listingNew.fields.bathrooms.label`, `savedSearch.bathrooms`, `units.bathroomsLabel`, `units.bathroomsShort`.

- [ ] **Step 1: ru.json**

```jsonc
// search.filters (рядом с "rooms"/"moreFilters"):
"bathrooms": "Санузлы",
"roomsAndBathrooms": "Комнаты и санузлы",
"bathroomsCount": "Санузлов: {count}",
// listingNew.fields (рядом с "rooms"):
"bathrooms": { "label": "Санузлы" },
// savedSearch (рядом с "rooms": "{count} комн"):
"bathrooms": "{count} с/у",
// units (рядом с roomsLabel/roomsShort):
"bathroomsLabel": "{count, plural, one {санузел} few {санузла} many {санузлов} other {санузла}}",
"bathroomsShort": "{count, plural, one {# с/у} few {# с/у} many {# с/у} other {# с/у}}"
```

- [ ] **Step 2: uz.json** (мирроринг ключей rooms в uz; узбекский без склонений)

```jsonc
"bathrooms": "Sanuzellar",
"roomsAndBathrooms": "Xonalar va sanuzellar",
"bathroomsCount": "Sanuzel: {count}",
// listingNew.fields:
"bathrooms": { "label": "Sanuzellar" },
// savedSearch:
"bathrooms": "{count} s/u",
// units:
"bathroomsLabel": "{count} sanuzel",
"bathroomsShort": "{count} s/u"
```

- [ ] **Step 3: en.json**

```jsonc
"bathrooms": "Bathrooms",
"roomsAndBathrooms": "Rooms and bathrooms",
"bathroomsCount": "Bathrooms: {count}",
// listingNew.fields:
"bathrooms": { "label": "Bathrooms" },
// savedSearch:
"bathrooms": "{count} ba",
// units:
"bathroomsLabel": "{count, plural, one {bathroom} other {bathrooms}}",
"bathroomsShort": "{count, plural, one {# ba} other {# ba}}"
```

- [ ] **Step 4: Проверить валидность JSON всех трёх файлов**

Run: `cd apps/client && node -e "['ru','uz','en'].forEach(l=>JSON.parse(require('fs').readFileSync('messages/'+l+'.json')))"`
Expected: без ошибок парсинга.

- [ ] **Step 5: Контроллер коммитит**

```bash
git add apps/client/messages
git commit -m "feat(client): i18n keys for bathrooms (ru/uz/en)"
```

---

### Task 7: Отображение — карточка и деталь

**Files:**
- Modify: `apps/client/src/lib/format.ts` (`specs`, строки 134-145)
- Modify: `apps/client/src/features/detail/Facts.tsx` (импорт + блок rooms)

**Interfaces:**
- Consumes: `Listing.bathrooms` (Task 5), `units.bathroomsShort`/`bathroomsLabel` (Task 6).

- [ ] **Step 1: `specs()` в format.ts**

Расширить `Pick<...>` и добавить часть после комнат:

```ts
export function specs(
  l: Pick<Listing, 'rooms' | 'bathrooms' | 'area' | 'floor' | 'totalFloors' | 'type'>,
  t: T,
): string[] {
  const parts: string[] = [];
  if (l.rooms) parts.push(t('roomsShort', { count: l.rooms }));
  if (l.bathrooms) parts.push(t('bathroomsShort', { count: l.bathrooms }));
  // …остальное без изменений
```

- [ ] **Step 2: Facts.tsx — иконка `Bath` + Fact**

```tsx
// импорт lucide (добавить Bath):
import { Bed, Bath, Ruler, Layers, CalendarDays, type LucideIcon } from 'lucide-react';
// после блока `if (listing.rooms) {…}` (строка 38):
  if (listing.bathrooms) {
    items.push(<Fact key="bathrooms" icon={Bath} label={tUnits('bathroomsLabel', { count: listing.bathrooms })} value={listing.bathrooms} />);
  }
```

- [ ] **Step 3: Сборка**

Run: `cd apps/client && rtk pnpm exec tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Контроллер коммитит**

```bash
git add apps/client/src/lib/format.ts apps/client/src/features/detail/Facts.tsx
git commit -m "feat(client): show bathrooms on card and detail"
```

---

### Task 8: Визард create + edit

**Files:**
- Modify: `apps/client/src/features/listing-new/ListingNew.tsx` (строки 67, 73-91, 98, 216-225, 430-440, preview ~586)
- Modify: `apps/client/src/features/listing-edit/ListingEdit.tsx` (строки 59, 76, 102-108, 244-246, 380-384)

**Interfaces:**
- Consumes: API `bathrooms` (PR #1), `listingNew.fields.bathrooms.label` (Task 6).
- Produces: визард отправляет `body.bathrooms` (опционально).

- [ ] **Step 1: ListingNew — опции, стейт, нормализация**

```ts
// после ROOM_OPTIONS (строка 67):
const BATHROOM_OPTIONS = ['1', '2', '3', '4+'] as const;
// FormState (после `rooms: string;`):
  bathrooms: string;
// INITIAL (после `rooms: '2',`) — пусто = не выбрано (опционально):
  bathrooms: '',
// buildBody — внутри `if (!noRooms) {` после блока rooms (строка 222):
      if (f.bathrooms) {
        const b = f.bathrooms === '4+' ? 4 : Number.parseInt(f.bathrooms, 10);
        if (Number.isFinite(b)) body.bathrooms = b;
      }
```

> НЕ добавлять `bathrooms` в `canNext()` (поле опционально).

- [ ] **Step 2: ListingNew — поле в шаге 3 (после FormField комнат, строка 440)**

```tsx
            {!noRooms && (
              <FormField label={t('fields.bathrooms.label')}>
                <div className="flex flex-wrap gap-2">
                  {BATHROOM_OPTIONS.map((b) => (
                    <Chip
                      key={b}
                      active={f.bathrooms === b}
                      onClick={() => set('bathrooms', f.bathrooms === b ? '' : b)}
                    >
                      {b}
                    </Chip>
                  ))}
                </div>
              </FormField>
            )}
```

(Клик по выбранному снимает выбор — поле опционально. В preview-блоке ~стр.586 добавить строку с `f.bathrooms`, если задано — по образцу строки rooms.)

- [ ] **Step 3: ListingEdit — те же опции/стейт + пред-заполнение**

```ts
// BATHROOM_OPTIONS (после строки 59), FormState.bathrooms (после строки 76)
// prefill (рядом со строкой 102 `d.rooms === 0 ? 'studio' : String(d.rooms)`):
  bathrooms: d.bathrooms != null ? (d.bathrooms >= 4 ? '4+' : String(d.bathrooms)) : '',
// buildBody patch (после блока rooms, строка 246):
  if (f.bathrooms) {
    const b = f.bathrooms === '4+' ? 4 : Number.parseInt(f.bathrooms, 10);
    if (Number.isFinite(b)) patch.bathrooms = b;
  }
```

Поле рендера — мирроринг блока rooms (строка 380), `BATHROOM_OPTIONS`, `t('fields.bathrooms.label')`. Не добавлять в валидацию (строка 227).

- [ ] **Step 4: Сборка + линт (проверить unused вручную)**

Run: `cd apps/client && rtk pnpm exec tsc --noEmit && rtk lint`
Expected: без ошибок; визуально проверить, что нет неиспользуемых импортов.

- [ ] **Step 5: Контроллер коммитит**

```bash
git add apps/client/src/features/listing-new/ListingNew.tsx apps/client/src/features/listing-edit/ListingEdit.tsx
git commit -m "feat(client): bathrooms field in create/edit wizard"
```

---

### Task 9: `BathroomsControl` + `BedroomsControl` (showExact) + блок в `FiltersPanel`

**Files:**
- Create: `apps/client/src/features/search/controls/BathroomsControl.tsx`
- Modify: `apps/client/src/features/search/controls/BedroomsControl.tsx` (добавить `showExact?`)
- Modify: `apps/client/src/features/search/FiltersPanel.tsx` (тип + блок)
- Test: `apps/client/src/features/search/controls/BathroomsControl.test.tsx`

**Interfaces:**
- Produces: `BathroomsControl` (`{ value?: number; onChange: (next?: number) => void }`); `FiltersPanelValues` расширен `roomsMin?: number` + `bathroomsMin?: number`.
- Consumes: `search.filters.{bathrooms,roomsAndBathrooms,any}` (Task 6).

- [ ] **Step 1: Падающий RTL-тест BathroomsControl**

Создать `BathroomsControl.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BathroomsControl } from './BathroomsControl';

const msgs = { search: { filters: { any: 'Любое', bathrooms: 'Санузлы' } } };
function setup(onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="ru" messages={msgs}>
      <BathroomsControl value={undefined} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

it('клик «2+» вызывает onChange(2)', () => {
  const onChange = setup();
  fireEvent.click(screen.getByText('2+'));
  expect(onChange).toHaveBeenCalledWith(2);
});

it('повторный клик по выбранному снимает выбор (undefined)', () => {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="ru" messages={msgs}>
      <BathroomsControl value={2} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByText('2+'));
  expect(onChange).toHaveBeenCalledWith(undefined);
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `cd apps/client && rtk vitest run src/features/search/controls/BathroomsControl.test.tsx`
Expected: FAIL (компонента нет).

- [ ] **Step 3: Создать `BathroomsControl.tsx`** (зеркало BedroomsControl без exact)

```tsx
/**
 * BathroomsControl — выбор «N+ санузлов» в стиле Zillow (без exact-match).
 * Кнопки «Любое / 1+ / 2+ / 3+ / 4+». Клик по выбранной снимает выбор.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Pill } from '@/components/ui/pill';

export interface BathroomsControlProps {
  /** Текущий выбор «N+» (undefined = Любое). */
  value?: number;
  onChange: (next?: number) => void;
}

const BATHROOM_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1+' },
  { value: 2, label: '2+' },
  { value: 3, label: '3+' },
  { value: 4, label: '4+' },
];

export function BathroomsControl({ value, onChange }: BathroomsControlProps) {
  const t = useTranslations('search.filters');
  return (
    <div className="flex flex-wrap gap-2">
      <Pill active={value === undefined} onClick={() => onChange(undefined)}>
        {t('any')}
      </Pill>
      {BATHROOM_OPTIONS.map((opt) => (
        <Pill
          key={opt.value}
          active={value === opt.value}
          onClick={() => onChange(value === opt.value ? undefined : opt.value)}
        >
          {opt.label}
        </Pill>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: `BedroomsControl` — опциональный `showExact`**

В `BedroomsControl.tsx`: добавить в props `showExact?: boolean;` (default `true`) и обернуть рендер чекбокса «Точное совпадение» условием `{showExact !== false && ( …label… )}`. Бар-дропдаун (без пропа) поведения не меняет.

- [ ] **Step 5: Блок «Комнаты и санузлы» в `FiltersPanel.tsx`**

Расширить тип и добавить секцию **первой** (перед «Площадь, м²»):

```tsx
// импорты:
import { BedroomsControl } from './controls/BedroomsControl';
import { BathroomsControl } from './controls/BathroomsControl';
// FiltersPanelValues — добавить:
  roomsMin?: number;
  bathroomsMin?: number;
// JSX, первым блоком внутри обёртки (перед Section areaTitle):
      <Section title={t('roomsAndBathrooms')}>
        <BedroomsControl
          value={draft.roomsMin}
          exact={false}
          showExact={false}
          onChange={({ value }) => patch({ roomsMin: value })}
        />
        <div className="mt-2 text-[12.5px] font-bold text-muted-foreground">{t('bathrooms')}</div>
        <BathroomsControl
          value={draft.bathroomsMin}
          onChange={(value) => patch({ bathroomsMin: value })}
        />
      </Section>
```

> `emptyDraft()` остаётся `{}` — сброс очистит roomsMin/bathroomsMin автоматически.

- [ ] **Step 6: Прогнать тест**

Run: `cd apps/client && rtk vitest run src/features/search/controls/BathroomsControl.test.tsx`
Expected: PASS.

- [ ] **Step 7: Контроллер коммитит**

```bash
git add apps/client/src/features/search/controls/BathroomsControl.tsx apps/client/src/features/search/controls/BathroomsControl.test.tsx apps/client/src/features/search/controls/BedroomsControl.tsx apps/client/src/features/search/FiltersPanel.tsx
git commit -m "feat(client): BathroomsControl + rooms&bathrooms panel block"
```

---

### Task 10: Проводка `FilterBar` + чипы + saved search + парсинг страниц

**Files:**
- Modify: `apps/client/src/features/search/FilterBar.tsx` (строки 67, 205-212, 216-229, 231-266, 286)
- Modify: `apps/client/src/features/search/ActiveFilters.tsx` (после строки 112, и строка 193)
- Modify: `apps/client/src/lib/savedSearch.ts` (после строки 70 и 130)
- Modify: `apps/client/src/app/[locale]/search/page.tsx` (строки 47-48, 148-149, ~190)
- Modify: `apps/client/src/app/[locale]/map/page.tsx` (проверить парсинг roomsMin; зеркалить)

**Interfaces:**
- Consumes: `FiltersPanelValues.{roomsMin,bathroomsMin}` (Task 9), `bathrooms_min` query (PR #1), `search.filters.bathroomsCount`/`savedSearch.bathrooms` (Task 6).

- [ ] **Step 1: `FilterValues` + `extraActive` + `panelValues` + apply/reset + `buildFilters`**

В `FilterBar.tsx`:

```ts
// FilterValues (в блоке расширенных, рядом со строкой 67):
  bathroomsMin?: number;
// extraActive (строка 205) — добавить в условие:
    || values.bathroomsMin
// panelValues (после строки 228):
    roomsMin: values.roomsMin,
    bathroomsMin: values.bathroomsMin,
// handlePanelApply (внутри setParams, после tours_enabled, строка 245):
        rooms_min: next.roomsMin,
        ...(next.roomsMin != null ? { rooms: undefined } : {}),
        bathrooms_min: next.bathroomsMin,
// handlePanelReset (после tours_enabled, строка 264):
      rooms: undefined,
      rooms_min: undefined,
      bathrooms_min: undefined,
// buildFilters (после строки 286 `filters.rooms_min = values.roomsMin;`):
    if (values.bathroomsMin != null) filters.bathrooms_min = values.bathroomsMin;
```

> Панель пишет `rooms_min` (режим «N+»); exact-режим остаётся за баром «Комнаты ▾». При apply с выбранным `roomsMin` сбрасываем exact `rooms`.

- [ ] **Step 2: Чип в `ActiveFilters.tsx`**

После блока `roomsMin` (строка 112):

```ts
  if (values.bathroomsMin != null) {
    chips.push({
      key: 'bathrooms_min',
      label: t('bathroomsCount', { count: `${String(values.bathroomsMin)}+` }),
      param: 'bathrooms_min',
    });
  }
```

В массив reset-all (строка 193) добавить `'bathrooms_min'`.

- [ ] **Step 3: `savedSearch.ts`**

```ts
// describeFilters — после блока rooms_min (строка 70):
  const bathroomsMin = asString(filters.bathrooms_min);
  if (bathroomsMin) parts.push(t('savedSearch.bathrooms', { count: bathroomsMin }));
// filtersToSearchHref — после строки 130 `set('rooms_min', …)`:
  set('bathrooms_min', asString(filters.bathrooms_min));
```

- [ ] **Step 4: Парсинг `search/page.tsx`**

```ts
// noindex long-tail (строка 48) — добавить:
    sp.bathrooms_min ||
// рядом с roomsMin (строки 148-149):
  const bathroomsMinParsed = toNum(first(sp.bathrooms_min));
  const bathroomsMin = bathroomsMinParsed !== undefined && bathroomsMinParsed > 0 ? bathroomsMinParsed : undefined;
// в объект фильтров (рядом со строкой 190 `roomsMin`):
  bathroomsMin,
```

- [ ] **Step 5: Парсинг `map/page.tsx`**

Проверить, как `map/page.tsx` строит `ListingFilter` (grep `roomsMin`/`rooms_min`). Если парсит — добавить `bathroomsMin` тем же образом; если использует общий хелпер — изменений не требуется. Зафиксировать, что выбрано.

- [ ] **Step 6: Сборка + линт**

Run: `cd apps/client && rtk pnpm exec tsc --noEmit && rtk lint`
Expected: без ошибок (проверить unused импорты вручную).

- [ ] **Step 7: Контроллер коммитит**

```bash
git add apps/client/src/features/search/FilterBar.tsx apps/client/src/features/search/ActiveFilters.tsx apps/client/src/lib/savedSearch.ts "apps/client/src/app/[locale]/search/page.tsx" "apps/client/src/app/[locale]/map/page.tsx"
git commit -m "feat(client): wire bathrooms_min through filters, chips, saved search, SSR"
```

---

### Task 11: Тесты + финализация PR #2

- [ ] **Step 1: Полный прогон тестов клиента**

Run: `cd apps/client && rtk vitest run`
Expected: PASS, кроме 2 предсущ. фейлов `LoginModal.test` (не регресс). Итог ожидается ~182 passed/2 failed.

- [ ] **Step 2: Прод-сборка**

Run: `cd apps/client && rtk pnpm exec next build`
Expected: успешная сборка (учесть `avino-rtk-next-build-false-error` — при сомнении смотреть raw-вывод).

- [ ] **Step 3: DONE.md (контроллер)** — добавить запись PR #2.

- [ ] **Step 4: Контроллер коммитит и открывает PR**

```bash
git add docs/DONE.md
git commit -m "docs: DONE entry for bathrooms client"
git push -u origin feat/listing-bathrooms-client
```
PR title: `feat(client): bathrooms in wizard, detail, card and search filters (Zillow Phase 2 client)`

**Verify (PR #2):** визард создаёт/редактирует объявление с санузлами (опционально); деталь/карточка показывают «N с/у»; мега-панель «Комнаты и санузлы» открывается, кнопки Санузлы пишут `bathrooms_min` и сужают выдачу; строка Комнаты в панели работает (N+); чип и «Сбросить всё» работают; save search хранит `bathrooms_min`; SSR-перезагрузка сохраняет фильтр; lint/build/тесты зелёные.

---

# PR #3 — `apps/web` (ветка `feat/listing-bathrooms-admin`)

Делегировать `avino-impl` (папка `apps/web`). **После мёржа PR #1.** Маленький.

### Task 12: Санузлы в модерации

**Files:**
- Modify: `apps/web/src/store/api/adminTypes.ts` (строка 169 `rooms: number | null;`)
- Modify: `apps/web/src/app/admin/listings/[id]/page.tsx` (строка 158)

**Interfaces:**
- Consumes: `bathrooms` в detail-ответе API (PR #1, `ListingDetailResponse` переиспользуется админкой).

- [ ] **Step 1: Тип ответа**

В `adminTypes.ts` после строки 169:

```ts
  bathrooms: number | null;
```

- [ ] **Step 2: Отображение в деталь-странице**

В `apps/web/src/app/admin/listings/[id]/page.tsx`, в спек-строке (строка 158) добавить санузлы после комнат:

```tsx
<span>{listing.rooms} комн</span><span>·</span><span>{listing.bathrooms ?? '—'} с/у</span><span>·</span>
```

> Список-таблица (`admin/listings/page.tsx:143`) — опционально; для «модерация показывает санузлы» достаточно деталь-страницы. Если добавлять колонку — не забыть заголовок `<th>`.

- [ ] **Step 3: Сборка + линт**

Run: `cd apps/web && rtk pnpm exec tsc --noEmit && rtk lint`
Expected: без ошибок.

- [ ] **Step 4: DONE.md (контроллер) + коммит + PR**

```bash
git add apps/web/src/store/api/adminTypes.ts "apps/web/src/app/admin/listings/[id]/page.tsx" docs/DONE.md
git commit -m "feat(web): show bathrooms in moderation detail"
git push -u origin feat/listing-bathrooms-admin
```
PR title: `feat(web): show bathrooms in moderation (Zillow Phase 2 admin)`

**Verify (PR #3):** карточка модерации показывает «N с/у» рядом с комнатами; tsc/lint зелёные.

---

## Self-Review

**Spec coverage:**
- A.1 миграция/схема → Task 1 ✓
- A.2 DTO (create/update/search) → Task 2 (create/update), Task 3 (search) ✓
- A.3 сервисы (listings + search) → Task 2, Task 3 ✓
- A.4 тесты + openapi → Task 2/3 (specs), Task 4 (openapi) ✓
- B.1 визард create/edit → Task 8 ✓
- B.2 деталь/карточка → Task 7 ✓
- B.3 мега-панель → Task 9 ✓
- B.4 плюмбинг (types/api/chips/savedSearch/parse) → Task 5, Task 10 ✓
- B.5 i18n → Task 6 ✓
- B.6 RTL-тесты → Task 9 (control), Task 11 (прогон) ✓
- C web модерация → Task 12 ✓

**Доп. покрытие сверх спека:** `ListingDetailResponse`/`ListingListItem` + их select/маппинг (Task 2) — пропущены Explore, но обязательны, чтобы деталь и админка получали `bathrooms`. SEO-noindex `bathrooms_min` (Task 10 Step 4) — консистентность с `rooms_min`.

**Type consistency:** `bathrooms` (API snake/camel совпадают, одно слово) сквозь все слои; `bathrooms_min` (query) ↔ `bathroomsMin` (client `ListingFilter`/`FilterValues`/`FiltersPanelValues`) — единообразно. `BathroomsControl.onChange(next?: number)` (без exact) согласован с использованием в Task 9 Step 5.

**Placeholder scan:** реальный код/SQL/JSON во всех шагах; `ADR-XXXX` — намеренный (номер присваивает контроллер при создании ADR).
