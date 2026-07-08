# Spec: Zillow-фильтры Фаза 2 — Парковка/гараж (`parking_type` enum)

**Дата:** 2026-06-27
**Статус:** approved (дизайн утверждён)
**Затрагивает:** `apps/api`, `apps/client`, `apps/web`
**Дорожная карта:** Фаза 1 (`2026-06-26-zillow-filters-phase1-design.md`) §D →
санузлы (`2026-06-27-zillow-filters-phase2-bathrooms-design.md`, merged #241/#242/#243)
→ **парковка (этот спек)** → площадь участка, кондиционер/amenities.

## Контекст и цель

Второй 🔴-фильтр из §D Фазы 1 — **парковка/гараж**. Полная вертикаль одной
характеристики: enum + миграция → визард create/edit → деталь + модерация →
фильтр в API (`/search` + гео) → UI в мега-панели «Фильтры».

В отличие от санузлов (целое число), парковка — **enum типа** (различает двор,
крытую, гараж, подземную). Это меняет паттерн-донор: фильтр и плюмбинг зеркалят
существующий **`property_type` (мультивыбор enum → `IN`)**, а не `bathrooms`.

## Решения (утверждены брейнштормом)

- **Модель — enum `ParkingType`** (не boolean, не два boolean). Значения:
  `YARD` (Двор) · `COVERED` (Крытая) · `GARAGE` (Гараж) · `UNDERGROUND` (Подземная).
- **Без значения `NONE`**: колонка `parkingType ParkingType?` **nullable**,
  `NULL` = «нет/не указано». «Нет» в визарде = не отправляем (null). Это избегает
  двусмысленности NULL vs NONE.
- **Фильтр — мультивыбор** `parking_type` (повторяющийся параметр → `parking_type
  IN (...)`), зеркало `property_type`. `NULL` под фильтр не попадает.
- **В визарде — опционально**, single-select (Chip-группа «Нет/Двор/Крытая/Гараж/
  Подземная»), показываем для всех типов недвижимости.
- **Отображение** — деталь (Fact с иконкой) + модерация; **на компактной карточке
  НЕ показываем** (парковка вторична).
- **Миграция** — raw-SQL `CREATE TYPE` + `ALTER TABLE ADD COLUMN` (nullable, без
  бэкфилла, non-breaking).
- Реализация — **3 PR по app-папкам**: `apps/api` → `apps/client` + `apps/web`.

---

## A. apps/api — enum, миграция, поле, фильтр (PR #1)

Файлы: `prisma/schema.prisma` (enum + поле в `Listing`),
`prisma/migrations/<ts>_add_listing_parking_type/migration.sql` (новый),
`src/listings/dto/{create,update}-listing.dto.ts`,
`src/listings/listings.service.ts`,
`src/search/dto/search-listings.dto.ts`, `src/search/search.service.ts`
(+ spec/int-spec), `openapi.{public,internal}.json` (regen).

### A.1 Enum, схема, миграция
- В `schema.prisma`: новый enum
  ```prisma
  enum ParkingType {
    YARD
    COVERED
    GARAGE
    UNDERGROUND
  }
  ```
  и поле в модель `Listing` рядом с `bathrooms`/`floor`:
  ```prisma
  parkingType        ParkingType?                           @map("parking_type")
  ```
- Миграция (стиль `20260622100000_admin_broadcast` — `CreateEnum` + `AlterTable`):
  ```sql
  -- CreateEnum
  CREATE TYPE "ParkingType" AS ENUM ('YARD', 'COVERED', 'GARAGE', 'UNDERGROUND');
  -- AlterTable
  ALTER TABLE "listings" ADD COLUMN "parking_type" "ParkingType";
  ```
- После правки схемы — `prisma generate`.

### A.2 DTO
- `create`/`update`-listing DTO: `@IsOptional() @IsEnum(ParkingType) parking_type?: ParkingType;`
- `search-listings.dto.ts` → **в `SearchListingsQueryDto`** (наследуют все гео-DTO),
  **мультивыбор — зеркало `property_type`**: нормализация одиночного значения в
  массив (`@Transform(toArray)`) + `@IsEnum(ParkingType, { each: true })`:
  ```ts
  @IsOptional() @Transform(toArray) @IsEnum(ParkingType, { each: true })
  parking_type?: ParkingType[];
  ```

### A.3 Сервисы
- `listings.service.ts`: `parkingType` в `ListingScalarInput`(snake `parking_type`)/
  `ListingScalarData`(camel `parkingType`), `toScalarData`, **`ListingDetailResponse`
  + `LISTING_DETAIL_SELECT`** + маппинг, **`ListingListItem` + `LISTING_LIST_SELECT`**
  + маппинг (как `bathrooms`/`rooms`). Имя контракта в ответах — `parking_type`.
- `search.service.ts`: `parking_type` в `SearchListItem` + `SEARCH_SELECT`
  (`parkingType: true`) + `toSearchItem` маппинг; в `buildWhereSql` — ветка `IN`
  (зеркало `property_type`):
  ```ts
  if (query.parking_type?.length)
    conds.push(Prisma.sql`parking_type IN (${Prisma.join(query.parking_type)})::"ParkingType"[]`);
  ```
  (точную форму `IN` для enum-массива взять из ветки `property_type` сервиса).

### A.4 Тесты + OpenAPI
- int-spec: фикстуры с разными `parkingType` (+ NULL) + кейс `parking_type=GARAGE`/
  мультивыбор сужает, NULL исключается.
- unit-spec: create/update прокидывают `parking_type`.
- regen `openapi.{public,internal}.json` в этом же PR (drift-check).

---

## B. apps/client — визард, деталь, фильтр (PR #2)

Зависит от PR #1. Паттерн-донор фильтра — `property_type`/`types`/`HomeTypeMultiSelect`.

### B.1 Визард (create + edit)
- `ListingNew.tsx`/`ListingEdit.tsx`: Chip-группа «Нет/Двор/Крытая/Гараж/Подземная»
  в шаге «Параметры», single-select, «Нет» → `''`/не шлём. Опционально (не в
  валидацию). `buildBody`/`buildPatch`: если выбран тип ≠ «Нет» → `body.parking_type
  = <ENUM>`. Edit — пред-заполнение из `detail.parking_type`.
- RTK-типы: `parking_type?` в `CreateListingBody`, `EditListingDetail`
  (`parking_type: ParkingType | null`) + `UpdateListingPatch`.

### B.2 Отображение
- `Facts.tsx`: Fact с иконкой `SquareParking` (lucide) + лейбл типа
  (`enums.parking.<TYPE>`), если `listing.parkingType` задано.
- UI-модель: `parkingType?: ParkingType` в `Listing` (`lib/mock/types.ts`),
  `parking_type` в `ApiSearchItem`/`ApiListingDetail`/`FavoriteSearchItem`, маппинг
  `mapListing`. **В `specs()` (карточка) НЕ добавляем.**

### B.3 Фильтр — мега-панель
- Новый `controls/ParkingMultiSelect.tsx` — мультивыбор-чекбоксы 4 типов (зеркало
  `HomeTypeMultiSelect`), значение `ParkingType[]`.
- `FiltersPanel.tsx`: новая секция «Парковка» (`parkingTypesTitle`) с
  `ParkingMultiSelect`; `FiltersPanelValues.parkingTypes?: ParkingType[]`.
- `FilterBar.tsx`: `FilterValues.parkingTypes`; `extraActive` учитывает;
  `panelValues`/`handlePanelApply`/`handlePanelReset` — передают/пишут/чистят
  повторяющийся `parking_type`; `buildFilters` сериализует `parking_types` (массив,
  для UI-restore — как `property_types`).
- Плюмбинг: `ListingFilter.parkingTypes`; `buildSearchParams` — повторяющийся
  `params.append('parking_type', t)` (как тип жилья); `search/page.tsx` парсит
  массив `parking_type` → `FilterValues.parkingTypes`/`ListingFilter`
  (+ noindex long-tail); `ActiveFilters.tsx` чип (× чистит все `parking_type`) +
  reset-all; `savedSearch.ts` describe/href.

### B.4 i18n (ru/uz/en)
- `enums.parking.{YARD,COVERED,GARAGE,UNDERGROUND}` (Двор/Крытая/Гараж/Подземная),
  `search.filters.parkingTypesTitle` («Парковка»), `search.filters.parkingNone`/чип,
  `listingNew.fields.parking.{label,none}`, `units`/`listing.facts.parking` (лейбл
  Fact). Все три файла `apps/client/messages/{ru,uz,en}.json`.

### B.5 Тесты
RTL `ParkingMultiSelect` (выбор/снятие типа) + чип. `lint`/`build`/`vitest` зелёные
(помнить про 2 предсущ. `LoginModal` фейла).

---

## C. apps/web — модерация (PR #3)

Зависит от PR #1. Файлы: `src/store/api/adminTypes.ts` (`parking_type` в
`ListingDetail`), `src/app/admin/listings/[id]/page.tsx` (тип парковки в спек-строке
детали, hardcode-лейбл по enum). Список-таблицу не трогаем.

---

## D. Объём, порядок, ограничения

3 PR (одна папка = один PR): **PR #1 (api) → мёрж → PR #2 (client) + PR #3 (web)**.
- `main` защищён: PR открывает контроллер, мёржит пользователь (никогда `--admin`).
- GitHub — токен из `~/.gh_token` (не печатать); git-мутации по одной команде.
- Субагенты `avino-impl` пишут код в одной папке, git/PR ведёт контроллер.
- ADR-0109 + `DONE.md` — в feature-PR до пуша.
- ⚠️ После мёржа PR #1 код начнёт **селектить `parking_type`** → на стенде/проде
  применить миграцию (`migrate deploy`) до выкладки кода (иначе запросы листингов
  упадут — колонки/типа нет).

## Критерии готовности (verify)

- **API:** `GET /search?parking_type=GARAGE` (и мультивыбор) сужает выдачу
  (`parking_type IN`), NULL исключается; create/update сохраняют `parking_type`;
  detail/list отдают; невалидное значение → 400; int/unit-spec зелёные; openapi
  drift зелёный; миграция применяется.
- **client:** визард создаёт/редактирует тип парковки (опц.); деталь показывает тип;
  мега-панель «Парковка» (мультивыбор) пишет `parking_type` и сужает выдачу; чип/
  сброс/save-search работают; SSR сохраняет; lint/build/тесты зелёные.
- **web:** карточка модерации показывает тип парковки.
- **Live-verify:** объявление с типом парковки → фильтр на `/search` → выдача
  сужается; URL содержит `parking_type`; SSR-перезагрузка сохраняет; деталь/
  модерация показывают тип.
