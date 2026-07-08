# Spec: Zillow-фильтры Фаза 2 — Площадь участка (`lot_area`, соток)

**Дата:** 2026-06-27
**Статус:** approved (дизайн утверждён)
**Затрагивает:** `apps/api`, `apps/client`, `apps/web`
**Дорожная карта:** Фаза 1 §D → санузлы (#241-243) → парковка (#244-246) →
**площадь участка (этот спек)** → кондиционер/amenities (последний 🔴).

## Контекст и цель

Третий 🔴-фильтр из §D — **площадь участка** (`lot_area`). Полная вертикаль:
колонка + миграция → визард create/edit → деталь + модерация → фильтр-диапазон
в API → секция RangeFields в мега-панели.

Самый простой из Фазы-2: **зеркалит существующий `area`** (Decimal(10,2), фильтр
`area_min/max` через `>= ::numeric`). Отличия: единицы — **соток** (1 сотка = 100 м²),
и поле — отдельное (см. решение об аддитивности).

## Решения (утверждены брейнштормом)

- **Аддитивно**: `lot_area` — НОВОЕ отдельное поле «площадь участка» (соток).
  Существующий `area` (м²) и `landArea`-показ для LAND (`format.ts:144`, i18n
  `units.landArea` = «X м² участок») **НЕ трогаем**. Для дома: `area`=жилая м²,
  `lot_area`=участок соток.
- **Единицы — соток** (Decimal). Колонка `lotArea Decimal? @map("lot_area")
  @db.Decimal(10, 2)`, nullable.
- **Фильтр — диапазон** `lot_area_min`/`lot_area_max` (числа, зеркало `area_min/max`).
- **Визард — опционально**, показывается только для **HOUSE + LAND**.
- **Отображение** — деталь (Fact «X соток») + модерация; **на карточке НЕ показываем**.
- **Миграция** — raw-SQL `ALTER TABLE ADD COLUMN` (nullable, без бэкфилла, non-breaking).
- Реализация — **3 PR по app-папкам**: `apps/api` → `apps/client` + `apps/web`.

---

## A. apps/api — колонка, миграция, фильтр (PR #1)

Файлы: `prisma/schema.prisma`, `prisma/migrations/<ts>_add_listing_lot_area/migration.sql`,
`src/listings/dto/{create,update}-listing.dto.ts`, `src/listings/listings.service.ts`,
`src/search/dto/search-listings.dto.ts`, `src/search/search.service.ts` (+ spec/int-spec),
`openapi.{public,internal}.json` (regen).

### A.1 Колонка + миграция
- В `schema.prisma`, модель `Listing` рядом с `area`:
  ```prisma
  lotArea            Decimal?                               @map("lot_area") @db.Decimal(10, 2)
  ```
- Миграция:
  ```sql
  -- AlterTable
  ALTER TABLE "listings" ADD COLUMN "lot_area" DECIMAL(10,2);
  ```
- `prisma generate` после правки схемы.

### A.2 DTO (зеркало `area`)
- `create`/`update`-listing DTO: `lot_area?: string` со строковым Decimal-валидатором,
  как у `area` (`@IsOptional @Matches(DECIMAL_2)`):
  ```ts
  @IsOptional()
  @Matches(DECIMAL_2, { message: 'lot_area must be a decimal string with up to 2 fraction digits' })
  lot_area?: string;
  ```
- `search-listings.dto.ts` (в `SearchListingsQueryDto`, зеркало `area_min/max` —
  **числа**):
  ```ts
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lot_area_min?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lot_area_max?: number;
  ```
  (Сверь точные декораторы `area_min/max` — зеркаль их.)

### A.3 Сервисы
- `listings.service.ts`: `lot_area` (snake, тип `string`) в `ListingScalarInput`;
  `lotArea` (camel) в `ListingScalarData`; `toScalarData` —
  `if (dto.lot_area !== undefined) data.lotArea = dto.lot_area;`; `lot_area: string | null`
  в `ListingDetailResponse` + `LISTING_DETAIL_SELECT` (`lotArea: true`) + маппинг
  (`lot_area: listing.lotArea?.toFixed(2) ?? null` — как `area`); то же в `ListingListItem`
  + `LISTING_LIST_SELECT` + маппинг.
- `search.service.ts`: `lot_area: string | null` в `SearchListItem`; `lotArea: true` в
  `SEARCH_SELECT`; в `buildWhereSql` (рядом с `area`):
  ```ts
  if (query.lot_area_min !== undefined)
    conds.push(Prisma.sql`lot_area >= ${query.lot_area_min}::numeric`);
  if (query.lot_area_max !== undefined)
    conds.push(Prisma.sql`lot_area <= ${query.lot_area_max}::numeric`);
  ```
  `toSearchItem` — `lot_area: listing.lotArea?.toFixed(2) ?? null`.

### A.4 Тесты + OpenAPI
- int-spec: фикстуры с разными `lotArea` (+ NULL) + кейс `lot_area_min/max` сужает,
  NULL исключается.
- unit-spec: create/update прокидывают `lot_area`.
- regen `openapi.{public,internal}.json` (drift-check) в этом же PR.

---

## B. apps/client — визард, деталь, фильтр (PR #2)

Паттерн-донор — `area`/`area_min/max`/`areaMin/areaMax`/RangeFields.

### B.1 Визард (create + edit)
- `ListingNew.tsx`/`ListingEdit.tsx`: числовое поле «Площадь участка, соток» в шаге
  «Параметры», показывается только при `f.type === 'HOUSE' || f.type === 'LAND'`.
  Опционально (не в валидацию). `body.lot_area = f.lotArea` (строка, как `area`).
  Edit — пред-заполнение `lotArea: d.lot_area ?? ''`.
- RTK-типы: `lot_area?: string` в `CreateListingBody` / `UpdateListingPatch`;
  `lot_area: string | null` в `EditListingDetail` и `FavoriteSearchItem`.

### B.2 Отображение
- `Facts.tsx`: Fact с иконкой `Trees` (lucide) + «X соток» (`units.lotArea`), если
  `listing.lotArea` задано.
- UI-модель: `lotArea?: string` в `Listing` (`lib/mock/types.ts`); `lot_area: string | null`
  в `ApiSearchItem`/`ApiListingDetail`; маппинг `mapListing` (`lotArea: api.lot_area ?? undefined`).
  **В `specs()`/карточку НЕ добавляем.**

### B.3 Фильтр — мега-панель
- `FiltersPanel.tsx`: новая секция «Площадь участка» (`lotAreaTitle`) с `RangeFields`
  (min/max, suffix «соток») → `lotAreaMin`/`lotAreaMax` (строки в draft);
  `FiltersPanelValues.lotAreaMin?: string` / `lotAreaMax?: string`.
- `FilterBar.tsx`: `FilterValues.lotAreaMin/lotAreaMax` (строки); `extraActive` учитывает;
  `panelValues` + `handlePanelApply` (через `setOne`, **скаляры** — отдельный
  `router.replace` уже есть после парковки) + `handlePanelReset` пишут/чистят
  `lot_area_min`/`lot_area_max`; `buildFilters` сериализует.
- Плюмбинг: `ListingFilter.lotAreaMin/lotAreaMax` (числа); `buildSearchParams` —
  `params.set('lot_area_min', String(...))` (зеркало `area_min/max`); `search/page.tsx`
  парсит `lot_area_min/max` (строки в FilterValues, числа `toNum` в ListingFilter,
  как `area`) + noindex long-tail; `ActiveFilters.tsx` чип `__lot_area` (× чистит обе
  границы) + reset-all; `savedSearch.ts` describe/href.

### B.4 i18n (ru/uz/en)
- `units.lotArea` («{value} соток» / «{value} sotix» / «{value} acres»? — для uz/en
  оставить «соток»-эквивалент: ru «соток», uz «sotix», en «sotka»/«ar»),
  `search.filters.lotAreaTitle` («Площадь участка»), `listing.facts.lotArea`
  («Участок»), `listingNew.fields.lotArea.{label,placeholder}` («Площадь участка,
  соток»). Чип — переиспользует title. Все три файла.

### B.5 Тесты
RTL — секция/чип `lot_area` (или smoke на RangeFields в панели). `lint`/`build`/`vitest`
зелёные (помнить про 2 предсущ. `LoginModal`).

---

## C. apps/web — модерация (PR #3)

Файлы: `src/store/api/adminTypes.ts` (`lot_area: string | null` в `ListingDetail`),
`src/app/admin/listings/[id]/page.tsx` («X соток» в спек-строке детали). Список-таблицу
не трогаем.

---

## D. Объём, порядок, ограничения

3 PR: **PR #1 (api) → мёрж → PR #2 (client) + PR #3 (web)**.
- `main` защищён: PR открывает контроллер, мёржит пользователь.
- GitHub — токен из `~/.gh_token` (не печатать); git-мутации по одной команде.
- Субагенты `avino-impl` пишут код в одной папке, git/PR ведёт контроллер.
- ADR-0110 + `DONE.md` — в feature-PR.
- ⚠️ После мёржа PR #1 код селектит `lot_area` → миграцию `migrate deploy` применить
  до выкладки кода.

## Критерии готовности (verify)

- **API:** `GET /search?lot_area_min=5&lot_area_max=10` сужает (`lot_area` BETWEEN),
  NULL исключается; create/update сохраняют `lot_area`; detail/list отдают; невалидное
  → 400; int/unit-spec зелёные; openapi drift зелёный; миграция применяется.
- **client:** визард создаёт/редактирует площадь участка (опц., HOUSE+LAND); деталь
  показывает «X соток»; мега-панель «Площадь участка» (RangeFields) пишет
  `lot_area_min/max` и сужает выдачу; чип/сброс/save-search работают; SSR сохраняет;
  lint/build/тесты зелёные.
- **web:** карточка модерации показывает «X соток».
- **Live-verify:** объявление с участком N соток → фильтр на `/search` → выдача
  сужается; URL содержит `lot_area_min/max`; SSR-перезагрузка сохраняет; деталь/
  модерация показывают.
