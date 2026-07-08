# Zillow-фильтры Фаза 2 — Удобства (amenities) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Каждая Task = один PR в одной app-папке, выполняется отдельным `avino-impl`-субагентом. **Субагенты НЕ трогают git** — ветки/коммиты/PR ведёт контроллер (см. [[avino-subagents-shared-workdir-git-hazard]]).

**Goal:** Добавить структурированный фильтруемый список удобств (`amenities`) — последний 🔴-фильтр Zillow Фазы 2 — как Postgres enum-массив на listings, с мультивыбором в визарде, секцией-бейджами в детали/модерации и AND-фильтром в поиске.

**Architecture:** Новый enum `Amenity` (8 значений) + scalar-list колонка `Listing.amenities Amenity[]` (NOT NULL DEFAULT `'{}'`) + GIN-индекс. Фильтр поиска — AND-containment `amenities::text[] @> ARRAY[...]::text[]` в raw-`buildWhereSql` (донор — `parking_type`). Удобства показываются в детали и модерации, но **НЕ в search-карточке** (карточка чистая → card-shape тесты не трогаются). Аддитивно: переводимый `featuresText` остаётся. Снимает заглушку M5.

**Tech Stack:** NestJS + Prisma + PostgreSQL (enum array + GIN), class-validator; Next.js + RTK Query + next-intl (client); Next.js + RTK Query (web admin).

## Global Constraints

- Одна Task = одна app-папка = один PR (`apps/api` → потом `apps/client` + `apps/web`). НИКОГДА не смешивать папки в одном PR (CLAUDE.md §0).
- Backend camelCase в TS, snake_case в JSON-контракте; **глобального snake_case-трансформера НЕТ** (маппинг вручную).
- Enum-значения — UPPERCASE, часть v1-контракта; добавление значения non-breaking (ADR-0008).
- Деньги/Decimal — строки, не float (здесь не применяется — amenities не числовое).
- Параметры поиска биндятся через `Prisma.sql` (защита от инъекций); enum-колонки сравниваются через `::text`/`::text[]` (без зависимости от имени PG-типа).
- i18n клиента — `apps/client/messages/{ru,uz,en}.json`, все 3 языка; web без i18n (hardcode-лейблы).
- Миграции рукописные (no local shadow DB): `prisma migrate deploy` на стенде/CI, либо out-of-band + `prisma migrate resolve --applied <name>`.
- `main` защищён — PR открывает контроллер, мёржит пользователь, никогда `--admin`. GitHub-токен из `~/.gh_token` (не печатать). Git-мутации по одной команде.
- `avino-impl` после правок схемы обязан `prisma generate` (иначе stale-клиент, [[avino-prisma-client-stale-after-branch-switch]]).
- ADR-0111 + `docs/DONE.md` — внутри feature-PR (api).
- Прод-TODO (за пользователем): `migrate deploy` накопленных миграций (санузлы/парковка/участок/удобства) ДО выкладки кода.

**Словарь `Amenity` (8, фиксирован брейнштормом):** `AIR_CONDITIONING`, `FURNITURE`, `APPLIANCES`, `INTERNET`, `ELEVATOR`, `BALCONY`, `HEATING`, `SECURITY`.

---

## Task 1: apps/api — enum, колонка-массив, миграция, AND-фильтр (PR #1)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (новый `enum Amenity`; `Listing.amenities`; `@@index([amenities], type: Gin)`)
- Create: `apps/api/prisma/migrations/20260627110000_add_listing_amenities/migration.sql`
- Modify: `apps/api/src/listings/dto/create-listing.dto.ts`, `apps/api/src/listings/dto/update-listing.dto.ts`
- Modify: `apps/api/src/listings/listings.service.ts` (ScalarInput/Data, toScalarData, DetailResponse, LISTING_DETAIL_SELECT, detail-маппинг)
- Modify: `apps/api/src/search/dto/search-listings.dto.ts` (`amenities?` query-параметр)
- Modify: `apps/api/src/search/search.service.ts` (`buildWhereSql` containment)
- Modify/Test: `apps/api/src/search/search.service.int-spec.ts`, `apps/api/src/listings/listings.service.spec.ts`, `apps/api/src/search/dto/search-listings.dto.spec.ts`
- Modify: `apps/api/openapi.public.json`, `apps/api/openapi.internal.json` (regen)
- Create: `docs/adr/ADR-0111-listing-amenities.md`; Modify: `docs/DONE.md`

**Interfaces:**
- Produces (контракт для client/web Task 2/3):
  - Enum `Amenity` (8 значений выше) экспортируется из `@prisma/client`.
  - Create/Update body: `amenities?: Amenity[]` (опц.; отсутствие → `[]`).
  - Search query: повторяющийся `amenities` (`?amenities=ELEVATOR&amenities=HEATING`), семантика AND.
  - `GET /listings/:id` detail-ответ: новое поле `amenities: Amenity[]` (всегда массив, мб пустой).
  - Search-карточка (`/search`) `amenities` **НЕ содержит** (намеренно).

- [ ] **Step 1: Enum + колонка в schema.prisma**

В `apps/api/prisma/schema.prisma` добавить enum рядом с `enum ParkingType { ... }`:

```prisma
/// Удобства объявления (ADR-0111, Zillow Phase 2). Мультизначный enum-массив на
/// listings.amenities. Фиксированный UI-словарь (лейблы i18n на клиенте), как
/// PropertyType/ParkingType. Добавление значения — non-breaking (ADR-0008).
enum Amenity {
  AIR_CONDITIONING
  FURNITURE
  APPLIANCES
  INTERNET
  ELEVATOR
  BALCONY
  HEATING
  SECURITY
}
```

В `model Listing` добавить поле рядом с `parkingType` (после строки `parkingType  ParkingType?  @map("parking_type")`):

```prisma
  amenities          Amenity[]
```

В блок `@@index(...)` модели `Listing` добавить (рядом с прочими `@@index`):

```prisma
  @@index([amenities], type: Gin)
```

- [ ] **Step 2: `prisma generate` + проверка валидности схемы**

Run: `cd apps/api && pnpm prisma validate && pnpm prisma generate`
Expected: `The schema ... is valid` + `Generated Prisma Client`.

> ⚠️ Если `prisma validate` отвергает `@@index([amenities], type: Gin)` для enum-массива — УБРАТЬ строку `@@index([amenities], type: Gin)` из схемы (индекс всё равно создаётся raw-SQL миграцией в Step 3; небольшой schema↔DB drift по индексу допустим, как у GIST-индекса `location` и partial-unique, которые тоже только в raw SQL). Повторить `prisma generate`.

- [ ] **Step 3: Написать миграцию**

Create `apps/api/prisma/migrations/20260627110000_add_listing_amenities/migration.sql`:

```sql
-- Generated to match schema.prisma (no local shadow DB). Apply on staging/CI with
-- `prisma migrate deploy`; if applied out-of-band, verify then
-- `prisma migrate resolve --applied 20260627110000_add_listing_amenities`.

-- CreateEnum
CREATE TYPE "Amenity" AS ENUM (
  'AIR_CONDITIONING', 'FURNITURE', 'APPLIANCES', 'INTERNET',
  'ELEVATOR', 'BALCONY', 'HEATING', 'SECURITY'
);

-- AlterTable
ALTER TABLE "listings" ADD COLUMN "amenities" "Amenity"[] NOT NULL DEFAULT '{}';

-- CreateIndex (GIN ускоряет @> containment)
CREATE INDEX "listings_amenities_idx" ON "listings" USING GIN ("amenities");
```

- [ ] **Step 4: Create/Update DTO**

В `apps/api/src/listings/dto/create-listing.dto.ts`:
- В импорт из `@prisma/client` добавить `Amenity`.
- В шапке `CreateListingDto` обновить устаревший комментарий: заменить «`feature_ids` и медиа — отдельные задачи M5, здесь не принимаются» на «медиа — отдельная задача; удобства принимаются как `amenities` (ADR-0111)».
- Добавить поле (после `parking_type?`):

```ts
  @IsOptional()
  @IsArray()
  @IsEnum(Amenity, { each: true })
  amenities?: Amenity[];
```

(`IsArray`, `IsEnum`, `IsOptional` уже импортированы.)

В `apps/api/src/listings/dto/update-listing.dto.ts` — то же поле и импорт `Amenity` (проверить, что `IsArray`/`IsEnum` импортированы; если нет — добавить).

- [ ] **Step 5: Search DTO (повторяющийся query-параметр, донор `parking_type`)**

В `apps/api/src/search/dto/search-listings.dto.ts`:
- В импорт из `@prisma/client` добавить `Amenity`.
- Добавить поле (после `parking_type?`):

```ts
  /** Удобства — мультивыбор (AND-containment), Zillow Phase 2. */
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(Amenity, { each: true })
  amenities?: Amenity[];
```

- [ ] **Step 6: listings.service — scalar-маппинг + detail-ответ**

В `apps/api/src/listings/listings.service.ts`:
- В импорт из `@prisma/client` добавить `Amenity`.
- `interface ListingScalarInput` — добавить (после `parking_type?`): `amenities?: Amenity[];`
- `interface ListingScalarData` — добавить (после `parkingType?`): `amenities?: Amenity[];`
- `toScalarData(...)` — добавить (после строки с `parking_type`):

```ts
    if (dto.amenities !== undefined) data.amenities = dto.amenities;
```

(На create `amenities` опущенный → DB-дефолт `'{}'`. Спец-обработки `?? []` не нужно.)
- `interface ListingDetailResponse` — добавить (после `parking_type`): `amenities: Amenity[];`
- `LISTING_DETAIL_SELECT` — добавить (после `parkingType: true`): `amenities: true,`
- В построении detail-ответа (метод, формирующий `ListingDetailResponse`, рядом с `parking_type: listing.parkingType`) добавить:

```ts
      amenities: listing.amenities,
```

> **НЕ добавлять** `amenities` в `ListingListItem` / `LISTING_LIST_SELECT` / `toListItem` (списку `/mine` не нужно). **НЕ добавлять** в `SearchListItem`/`SEARCH_SELECT`/`toSearchItem`.

- [ ] **Step 7: search.service — AND-containment в buildWhereSql**

В `apps/api/src/search/search.service.ts`, метод `buildWhereSql`, после блока `parking_type` (`// Zillow Phase 2: тип парковки ...`):

```ts
    // Zillow Phase 2: удобства (AND — есть ВСЕ выбранные; пустой/NULL-массив не матчит)
    if (query.amenities !== undefined && query.amenities.length > 0)
      conds.push(
        Prisma.sql`amenities::text[] @> ARRAY[${Prisma.join(query.amenities)}]::text[]`,
      );
```

(`Amenity` импортировать из `@prisma/client`, если ещё не импортирован — рядом с `ParkingType`.)

- [ ] **Step 8: int-spec — AND-семантика (тест ПЕРВЫМ, потом прогон)**

В `apps/api/src/search/search.service.int-spec.ts` (зеркаль существующие parking-кейсы) добавить блок: засидить 3 ACTIVE-листинга — A=`[ELEVATOR, AIR_CONDITIONING]`, B=`[ELEVATOR]`, C=`[]`. Кейсы:
- `?amenities=ELEVATOR` → A и B (не C).
- `?amenities=ELEVATOR&amenities=AIR_CONDITIONING` → только A (AND, не B).
- без параметра → A, B, C (плюс прочие фикстуры).

Пример (адаптируй под фабрики/хелперы файла):

```ts
it('amenities filter is AND-containment (has ALL selected)', async () => {
  const a = await seedActive({ amenities: ['ELEVATOR', 'AIR_CONDITIONING'] });
  const b = await seedActive({ amenities: ['ELEVATOR'] });
  await seedActive({ amenities: [] });

  const both = await service.search({ amenities: ['ELEVATOR', 'AIR_CONDITIONING'] } as any);
  expect(both.data.map((x) => x.id).sort()).toEqual([a.id].sort());

  const one = await service.search({ amenities: ['ELEVATOR'] } as any);
  expect(one.data.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
});
```

Run: `cd apps/api && pnpm vitest run src/search/search.service.int-spec.ts -t amenities`
Expected: FAIL до Step 7 применён / PASS после. (Если int-spec требует живую БД и не гоняется в окружении субагента — пометить кейс и оставить контроллеру для live-verify; не блокировать.)

- [ ] **Step 9: unit-spec — detail отдаёт amenities; create/update прокидывают**

В `apps/api/src/listings/listings.service.spec.ts`:
- Где мокается detail-строка Prisma (фикстура с `parkingType`) — добавить `amenities: ['ELEVATOR']` (или `[]`) в мок-строку, и в ожидаемый detail-объект — `amenities: ['ELEVATOR']`.
- Кейс create/update: dto с `amenities: ['INTERNET']` → проверить, что в `prisma.listing.create/update` ушло `amenities: ['INTERNET']`.

Run: `cd apps/api && pnpm vitest run src/listings/listings.service.spec.ts`
Expected: PASS.

- [ ] **Step 10: dto-spec — валидный массив проходит, мусор отбивается**

В `apps/api/src/search/dto/search-listings.dto.spec.ts` добавить: `{ amenities: ['ELEVATOR', 'HEATING'] }` валиден; `{ amenities: ['NOPE'] }` → ошибка валидации; одиночное `amenities: 'ELEVATOR'` (строка) коэрсится `toArray` в `['ELEVATOR']`.

Run: `cd apps/api && pnpm vitest run src/search/dto/search-listings.dto.spec.ts`
Expected: PASS.

- [ ] **Step 11: Прогнать ВСЕ затронутые api-тесты (поймать card-shape регрессии заранее)**

Run: `cd apps/api && pnpm vitest run src/listings src/search`
Expected: PASS. Особое внимание — `search.service.spec.ts` (card-shape) и `listings.service.spec.ts › findMine` должны остаться зелёными БЕЗ правок (amenities не в карточке/списке). Если красные из-за amenities — значит поле случайно протекло в карточку/список: убрать.

- [ ] **Step 12: Regen OpenAPI**

Run: `cd apps/api && pnpm openapi:export` (с 4 dummy env, см. [[avino-api-docs-two-layers]])
Затем drift-check: `cd apps/api && pnpm openapi:check` (или эквивалент CI).
Expected: `openapi.public.json` + `openapi.internal.json` обновлены и drift зелёный. (Query enum-array Swagger не задокументирует — как `parking_type`; в дифф попадут только body-поля Create/Update — норм.)

- [ ] **Step 13: ADR-0111 + DONE.md**

Create `docs/adr/ADR-0111-listing-amenities.md` (формат CLAUDE.md §ADR): Status Accepted, Date 2026-06-27, Context (нужен фильтруемый структурированный список удобств; M5-заглушка; выбор модели), Decision (Postgres enum-массив `Amenity[]` + GIN + AND-containment; отвергли reference-таблицу и JSONB — обоснование из спека), Consequences (плюсы: консистентность с parking/property, без join, type-safe; минусы: добавление удобства = миграция+деплой, не на карточке), Related files, Related task.
Дополнить `docs/DONE.md` записью по формату §DONE (PR: pending до мёржа).

- [ ] **Step 14: Финальный lint/build, отдать контроллеру**

Run: `cd apps/api && pnpm lint && pnpm build`
Expected: чисто. Затем СТОП — субагент возвращает контроллеру список изменённых файлов. **Контроллер** заводит ветку `feat/listing-amenities-api`, коммитит файлы папки `apps/api` + `docs/adr/ADR-0111-*` + `docs/DONE.md`, открывает PR #1. Пользователь мёржит.

---

## Task 2: apps/client — визард, деталь, мультивыбор-фильтр (PR #2)

> Стартует ПОСЛЕ мёржа Task 1 (код селектит `amenities`; но client не зависит от api-рантайма для сборки — может идти параллельно с Task 3). Донор паттерна — `parking_type` / `ParkingMultiSelect` / `HomeTypeMultiSelect` / чип `__parking` (мультивыбор enum, повторяющийся параметр).

**Files (ориентир — сверить с реальными путями `parking`-вертикали #245):**
- Create: `apps/client/src/features/search/AmenitiesMultiSelect.tsx` (зеркало `ParkingMultiSelect.tsx`, но мультивыбор)
- Modify: `apps/client/src/features/search/FiltersPanel.tsx` (секция «Удобства»)
- Modify: `apps/client/src/features/search/FilterBar.tsx` (`FilterValues.amenities`, panelValues, handlePanelApply/Reset, buildFilters)
- Modify: `apps/client/src/features/search/ActiveFilters.tsx` (чип `__amenities`)
- Modify: `apps/client/src/app/[locale]/search/page.tsx` (парсинг повторяющегося `amenities`, noindex long-tail)
- Modify: `apps/client/src/features/map/*` если карта строит params отдельно (свериться: `buildSearchParams` общий?)
- Modify: листинг-нью/эдит (`apps/client/src/features/listing-new/*`, `listing-edit/*`) — мультивыбор удобств
- Modify: деталь (`apps/client/src/features/detail/*`) — секция «Удобства» бейджами
- Modify: `apps/client/src/lib/api/listings.ts` (типы `Amenity`, `ApiListingDetail.amenities`, `mapListing`), `buildSearchParams`, `ListingFilter`, `savedSearch.ts`, `lib/mock/types.ts`
- Modify: RTK create/edit body-типы (`CreateListingBody`/`UpdateListingPatch`/`EditListingDetail`)
- Modify: `apps/client/messages/{ru,uz,en}.json`
- Test: `apps/client/src/lib/api/listings.test.ts` + компонент-тесты панели/визарда

**Interfaces:**
- Consumes (из Task 1): detail-ответ `amenities: Amenity[]`; search-параметр повторяющийся `amenities` (AND).
- Produces: пользователь фильтрует/создаёт/видит удобства.

- [ ] **Step 1: Тип Amenity + плюмбинг типов**

В клиентских enum-типах (рядом с `ParkingType`, вероятно `lib/api/listings.ts` или `lib/enums`): `export type Amenity = 'AIR_CONDITIONING' | 'FURNITURE' | 'APPLIANCES' | 'INTERNET' | 'ELEVATOR' | 'BALCONY' | 'HEATING' | 'SECURITY';` и константа-список `AMENITIES: Amenity[]` для рендера чекбоксов.
- `ApiListingDetail.amenities: Amenity[]`; `mapListing` → `amenities: api.amenities ?? []`.
- `Listing` (`lib/mock/types.ts`): `amenities?: Amenity[]`.
- `ListingFilter.amenities?: Amenity[]`; `FilterValues.amenities: Amenity[]`; `FiltersPanelValues.amenities?: Amenity[]`.
- RTK: `CreateListingBody.amenities?: Amenity[]`, `UpdateListingPatch.amenities?: Amenity[]`, `EditListingDetail.amenities: Amenity[]`.
- **НЕ** добавлять `amenities` в `ApiSearchItem`/`PropertyCard`/`specs()`.

- [ ] **Step 2: buildSearchParams — append (повторяющийся), зеркало parking**

В `buildSearchParams` (`lib/api/listings.ts`) после блока `parking_type`:

```ts
  filter.amenities?.forEach((a) => params.append('amenities', a));
```

- [ ] **Step 3: search/page.tsx — парсинг массива + noindex**

Зеркаль парсинг `parking_type`: `const amenities = searchParams.getAll?.('amenities') ?? toArray(searchParams.amenities)` (используй тот же хелпер, что и для `types`/`parking_type` в этом файле). Прокинуть в `FilterValues.amenities` (строки) и `ListingFilter.amenities`. Добавить `amenities` в условие noindex long-tail (как parking).

- [ ] **Step 4: AmenitiesMultiSelect + секция в FiltersPanel**

Создать `AmenitiesMultiSelect.tsx` (зеркало `ParkingMultiSelect.tsx`, но **мультивыбор** — toggle в массиве, не single). Рендерит `AMENITIES.map` с лейблом `tEnum('amenities', a)` (или `t('enums.amenities.' + a)`).
В `FiltersPanel.tsx` — секция «Удобства» (заголовок `search.filters.amenitiesTitle`) с этим компонентом → пишет `draft.amenities`.

- [ ] **Step 5: FilterBar — apply/reset/active (единый router.replace-билдер)**

- `extraActive` учитывает `amenities.length > 0`.
- `handlePanelApply` (уже единый `router.replace`-билдер после парковки): `params.delete('amenities'); panel.amenities?.forEach((a) => params.append('amenities', a));`
- `handlePanelReset`: `params.delete('amenities')` (снимает все повторы).
- `buildFilters` сериализует `amenities`.

- [ ] **Step 6: ActiveFilters — чип `__amenities`**

Чип `__amenities` (зеркало `__parking`): подпись `search.filters.amenitiesTitle` (+ count), × → прямой `params.delete('amenities')` через `URLSearchParams` + `router.replace`. Включить в reset-all.

- [ ] **Step 7: Деталь — секция «Удобства» бейджами**

В detail-фиче — секция (заголовок `listing.amenities.title`), показывается если `listing.amenities?.length`. Рендер: `listing.amenities.map((a) => <Badge icon={AMENITY_ICON[a]}>{t('enums.amenities.' + a)}</Badge>)`. Карта иконок lucide: `AIR_CONDITIONING→Snowflake, FURNITURE→Sofa, APPLIANCES→WashingMachine, INTERNET→Wifi, ELEVATOR→ArrowUpDown, BALCONY→Building2, HEATING→Flame, SECURITY→ShieldCheck`. **Карточку (`PropertyCard`) не трогать.**

- [ ] **Step 8: Визард create + edit — мультивыбор**

В шаге «Параметры» listing-new и listing-edit — блок «Удобства» (`listingNew.fields.amenities.label`) с мультивыбор-чекбоксами (переиспользуй `AmenitiesMultiSelect` или его форму). Опционально, **без гейта по типу недвижимости**. `body.amenities = f.amenities`. Edit — пред-заполнение `amenities: d.amenities ?? []`.

- [ ] **Step 9: i18n (все 3 файла)**

В `apps/client/messages/ru.json`, `uz.json`, `en.json` добавить:
- `enums.amenities`: `{ AIR_CONDITIONING, FURNITURE, APPLIANCES, INTERNET, ELEVATOR, BALCONY, HEATING, SECURITY }` —
  ru: «Кондиционер, Мебель, Бытовая техника, Интернет, Лифт, Балкон, Отопление, Видеонаблюдение»;
  uz: «Konditsioner, Mebel, Maishiy texnika, Internet, Lift, Balkon, Isitish, Videokuzatuv»;
  en: «Air conditioning, Furniture, Appliances, Internet, Elevator, Balcony, Heating, Security».
- `search.filters.amenitiesTitle` = «Удобства» / «Qulayliklar» / «Amenities».
- `listing.amenities.title` = «Удобства» / «Qulayliklar» / «Amenities».
- `listingNew.fields.amenities.label` = «Удобства» / «Qulayliklar» / «Amenities».

> ⚠️ Mocked next-intl в тестах скрывает отсутствующие ключи — после правки **вручную** проверить, что все 8 enum-ключей и 3 заголовка есть во ВСЕХ трёх файлах ([[avino-client-test-i18n-eslint-gotchas]]).

- [ ] **Step 10: Тесты + проверка ключей**

- `lib/api/listings.test.ts`: в фикстуру detail добавить `amenities: ['ELEVATOR']`, проверить `mapListing` → `amenities` проброшен; фикстура searchItem — БЕЗ amenities (карточка не содержит).
- Компонент-тест: панель рендерит секцию «Удобства», выбор → `amenities` в URL (повторяющийся); чип снимает.
- Ручная проверка i18n-ключей (grep по 3 файлам).

Run: `pnpm --filter @avino/client test`
Expected: зелёно, кроме 2 предсуществующих `LoginModal`-фейлов ([[avino-loginmodal-test-preexisting-fail]]) — это НЕ регресс.

- [ ] **Step 11: lint/build, отдать контроллеру**

Run: `pnpm --filter @avino/client lint && pnpm --filter @avino/client build`
Expected: чисто. (eslint client не ловит unused imports — глазами проверить орфаны.) Затем СТОП. **Контроллер** заводит `feat/listing-amenities-web` (или `-client`), коммитит только файлы `apps/client`, открывает PR #2.

---

## Task 3: apps/web — удобства в детали модерации (PR #3)

> Параллельно Task 2 (разные папки). Донор — показ `parking_type`/`lot_area` в детали модерации (#246/#249).

**Files:**
- Modify: `apps/web/src/store/api/adminTypes.ts` (`amenities: string[]` в `ListingDetail`)
- Modify: `apps/web/src/app/admin/listings/[id]/page.tsx` (секция «Удобства» бейджами; hardcode-маппинг лейблов RU)

**Interfaces:**
- Consumes (из Task 1): detail-ответ `amenities: Amenity[]`.

- [ ] **Step 1: Тип в adminTypes**

В `apps/web/src/store/api/adminTypes.ts`, в `ListingDetail` добавить: `amenities: string[];` (web без enum-импорта из prisma — строковый литерал-union или `string[]` как у parking).

- [ ] **Step 2: Маппинг лейблов + рендер в детали модерации**

В `apps/web/src/app/admin/listings/[id]/page.tsx` добавить hardcode-карту (зеркало parking-лейблов):

```ts
const AMENITY_LABELS: Record<string, string> = {
  AIR_CONDITIONING: 'Кондиционер',
  FURNITURE: 'Мебель',
  APPLIANCES: 'Бытовая техника',
  INTERNET: 'Интернет',
  ELEVATOR: 'Лифт',
  BALCONY: 'Балкон',
  HEATING: 'Отопление',
  SECURITY: 'Видеонаблюдение',
};
```

Секция «Удобства» (показывать если `listing.amenities?.length`): `listing.amenities.map((a) => <span class="badge">{AMENITY_LABELS[a] ?? a}</span>)`. Список-таблицу `admin/listings` НЕ трогать.

- [ ] **Step 3: lint/build, отдать контроллеру**

Run: `pnpm --filter @avino/web lint && pnpm --filter @avino/web build`
Expected: чисто. Затем СТОП. **Контроллер** заводит `feat/listing-amenities-moderation`, коммитит только файлы `apps/web`, открывает PR #3.

---

## Порядок выполнения и git-хореография (контроллер)

1. **Task 1 (api)** — один `avino-impl`. Контроллер: ветка `feat/listing-amenities-api` от свежего `main` → коммит файлов `apps/api` + ADR + DONE → PR #1 → пользователь мёржит.
2. После мёржа: `git checkout main && git pull --ff-only` ([[avino-git-mutation-single-commands]]).
3. **Task 2 (client)** + **Task 3 (web)** — два `avino-impl` параллельно (разные папки, [[avino-parallel-client-batch-partition]]). Контроллер ведёт обе ветки последовательно в git (ветка→коммит файлов папки→`checkout main`→другая ветка), открывает PR #2 и #3.
4. Спек/план — untracked на диске (не коммитим в эти PR).

## Self-Review (выполнено при написании плана)

- **Покрытие спека:** A (enum/колонка/миграция/DTO/сервис/фильтр/тесты/openapi/ADR) → Task 1; B (визард/деталь/фильтр/i18n/тесты) → Task 2; C (модерация) → Task 3. ✔
- **Плейсхолдеры:** нет TBD/TODO; «сверить пути» — намеренная инструкция мирроринга донора, не пропуск. ✔
- **Консистентность типов:** `Amenity` (8 UPPERCASE) одинаков в api/client/web; detail-поле `amenities: Amenity[]` сквозное; карточка/список НЕ содержат — единообразно во всех трёх задачах. ✔
- **Анти-гоча:** amenities намеренно вне search-карточки → card-shape тесты (`search.service.spec`/`findMine`/client `listings.test` searchItem) не правятся (Step 11 Task 1 это проверяет). ✔
