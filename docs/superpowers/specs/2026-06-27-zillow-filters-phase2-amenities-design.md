# Spec: Zillow-фильтры Фаза 2 — Удобства (`amenities`, enum-массив)

**Дата:** 2026-06-27
**Статус:** approved (дизайн утверждён)
**Затрагивает:** `apps/api`, `apps/client`, `apps/web`
**Дорожная карта:** Фаза 1 §D → санузлы (#241-243) → парковка (#244-246) →
площадь участка (#247-249) → **удобства/amenities (этот спек, последний 🔴)**.
После него §D закрыт.

## Контекст и цель

Четвёртый и **последний** 🔴-фильтр из §D — **удобства** (`amenities`): кондиционер,
мебель, лифт и т.п. Полная вертикаль: enum + колонка-массив + миграция → визард
create/edit (мультивыбор-чекбоксы) → деталь + модерация (бейджи) → мультивыбор-фильтр
в API/мега-панели.

Это снимает давнюю заглушку **M5**: в `listings.service.ts:159` и
`create-listing.dto.ts:76` прямым текстом сказано «структурированный список удобств
(`features`) появится отдельной задачей M5 — модели в БД ещё нет; свободный текст
отдаётся в `features_text`». Этот спек и есть M5 — но в облегчённом enum-варианте, без
reference-таблицы.

## Решения (утверждены брейнштормом)

- **Модель данных — Postgres enum-массив** (НЕ reference-таблица, НЕ JSONB; ADR-0111).
  Новый enum `Amenity` + scalar-list колонка `Listing.amenities Amenity[]`. Зеркалит
  конвенцию `parking_type`/`property_type` (фиксированный UI-словарь = enum). Reference-
  таблицу проект делает только для управляемых данных с trilingual-именами в БД
  (`District`) — у удобств лейблы i18n на клиенте, рантайм-расширяемость не нужна.
- **Аддитивно**: `featuresText` (переводимый free-text на `ListingTranslation`) **НЕ
  трогаем** — остаётся для произвольных пометок; `amenities` = структурированный
  фильтруемый слой поверх.
- **Словарь — 8 значений** (расширяемо позже non-breaking):
  `AIR_CONDITIONING` (Кондиционер), `FURNITURE` (Мебель), `APPLIANCES` (Бытовая
  техника), `INTERNET` (Интернет/Wi-Fi), `ELEVATOR` (Лифт), `BALCONY` (Балкон/лоджия),
  `HEATING` (Отопление), `SECURITY` (Видеонаблюдение/охрана). Парковка НЕ входит —
  отдельный фильтр.
- **Семантика фильтра — AND** («есть ВСЕ выбранные»), реализация — array-containment
  `@>`. Зеркало Zillow «Must have».
- **Колонка** `amenities Amenity[]`, NOT NULL DEFAULT `'{}'` (пустой массив, не nullable).
  GIN-индекс для `@>`.
- **Визард — опционально**, мультивыбор-чекбоксы. Применимо ко всем типам недвижимости
  (не гейтим по property_type — у любого объекта могут быть удобства).
- **Отображение** — деталь (секция «Удобства», бейджи) + модерация (web); **на карточке
  НЕ показываем** (карточка остаётся чистой; это также избавляет от гочи card-shape
  тестов — см. §D).
- **Миграция** — raw-SQL `CREATE TYPE` + `ADD COLUMN` (DEFAULT `'{}'`, без бэкфилла,
  non-breaking) + `CREATE INDEX ... USING GIN`.
- Реализация — **3 PR по app-папкам**: `apps/api` → `apps/client` + `apps/web`.

---

## A. apps/api — enum, колонка, миграция, фильтр (PR #1)

Файлы: `prisma/schema.prisma`,
`prisma/migrations/<ts>_add_listing_amenities/migration.sql`,
`src/listings/dto/{create,update}-listing.dto.ts`, `src/listings/listings.service.ts`,
`src/search/dto/search-listings.dto.ts`, `src/search/search.service.ts` (+ spec/int-spec),
`openapi.{public,internal}.json` (regen).

### A.1 Enum + колонка + миграция
- В `schema.prisma` — новый enum рядом с `ParkingType`:
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
- В модели `Listing` рядом с `parkingType`:
  ```prisma
  amenities          Amenity[]
  ```
  и в блок `@@index(...)`:
  ```prisma
  @@index([amenities], type: Gin)
  ```
- Миграция (raw SQL):
  ```sql
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
  (Сверь точное имя индекса с тем, что генерит `prisma migrate diff` для
  `@@index([amenities], type: Gin)` — Prisma назовёт `listings_amenities_idx`.)
- `prisma generate` после правки схемы (иначе stale-клиент, см.
  [[avino-prisma-client-stale-after-branch-switch]]).

### A.2 DTO
- `create-listing.dto.ts` / `update-listing.dto.ts` — body-массив (НЕ query, поэтому
  **без** `@Transform(toArray)`):
  ```ts
  @IsOptional()
  @IsArray()
  @IsEnum(Amenity, { each: true })
  amenities?: Amenity[];
  ```
  Импорт `Amenity` из `@prisma/client`. (При желании `@ArrayMaxSize(8)` — но не
  обязательно; `@IsEnum each` уже отбивает мусор.) Убрать/уточнить устаревший
  комментарий про `feature_ids`/M5 в шапке `CreateListingDto`.
- `search-listings.dto.ts` (в `SearchListingsQueryDto`) — **зеркало `parking_type`**
  (повторяющийся query-параметр):
  ```ts
  /** Удобства — мультивыбор (AND-containment), Zillow Phase 2. */
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(Amenity, { each: true })
  amenities?: Amenity[];
  ```

### A.3 Сервисы
- `listings.service.ts`:
  - `ListingScalarInput` (snake): `amenities?: Amenity[]`; `ListingScalarData` (camel):
    `amenities?: Amenity[]`.
  - `toScalarData` (или эквивалент): create — `amenities: dto.amenities ?? []`;
    update — `if (dto.amenities !== undefined) data.amenities = dto.amenities;`.
    (Сверь, как именно собирается create-data: парковка/lot_area — образец.)
  - `ListingDetailResponse`: добавить `amenities: Amenity[];`. В `LISTING_DETAIL_SELECT`
    — `amenities: true`. Маппинг в detail-ответе: `amenities: listing.amenities` (массив
    как есть — Prisma вернёт `Amenity[]`).
  - **`ListingListItem` (list `/mine`) — НЕ добавляем** `amenities` (списку владельца не
    нужно; экономит и тесты card-shape).
- `search.service.ts`:
  - В `buildWhereSql` (рядом с `parking_type`), AND-containment через `::text[]` (без
    зависимости от имени PG-типа):
    ```ts
    // Zillow Phase 2: удобства (AND — есть все выбранные; NULL/пустой массив исключается)
    if (query.amenities !== undefined && query.amenities.length > 0)
      conds.push(
        Prisma.sql`amenities::text[] @> ARRAY[${Prisma.join(query.amenities)}]::text[]`,
      );
    ```
  - **`SearchListItem` / `SEARCH_SELECT` / `toSearchItem` — НЕ трогаем** (на карточке
    удобства не показываем). Это ключевое решение, которое уводит нас от гочи
    [[avino-zillow-filters-phase2-lot-area]] (поле с `?? null` ломает card-shape тест):
    раз `amenities` не попадает в карточку — `search.service.spec`/`findMine`/клиентский
    card-shape тест НЕ трогаются.

### A.4 Тесты + OpenAPI
- int-spec (`search.service.int-spec.ts`): фикстуры с разными `amenities` (вкл. пустой)
  + кейсы: один выбранный сужает; два выбранных → только объекты со **всеми** двумя
  (проверка AND, не OR); пустой/отсутствующий параметр → без фильтра.
- unit-spec (`listings.service.spec.ts`): create/update прокидывают `amenities`; detail
  отдаёт массив. **Проверить, что добавление `amenities` в detail-select/ответ не
  ломает существующие detail-фикстуры** (в spec ожидаемый объект detail — дополнить
  `amenities: []` или ожидаемым массивом).
- DTO-spec (`search-listings.dto.spec.ts`): валидный массив проходит, мусор → ошибка.
- regen `openapi.{public,internal}.json` (drift-check CI) в этом же PR. (Query-параметр
  enum-array Swagger не авто-документирует — как `parking_type`; в openapi отразятся
  только body-поля Create/Update — это не регресс.)
- ADR-0111 + `DONE.md` — в этом же PR.

---

## B. apps/client — визард, деталь, фильтр (PR #2)

Паттерн-донор — `parking_type`/`ParkingMultiSelect`/`HomeTypeMultiSelect` (мультивыбор
enum), потому что удобства — повторяющийся enum-параметр (как парковка), а не диапазон.

### B.1 Визард (create + edit)
- `ListingNew.tsx` / `ListingEdit.tsx`: блок «Удобства» в шаге «Параметры» — группа
  чекбоксов (новый компонент `AmenitiesMultiSelect`, зеркало `ParkingMultiSelect`, но
  мультивыбор, а не single). Опционально (не в валидацию). Применимо ко всем типам
  (не гейтим по `f.type`). `body.amenities = f.amenities` (массив строк-enum).
  Edit — пред-заполнение `amenities: d.amenities ?? []`.
- RTK-типы: `amenities?: Amenity[]` (или `string[]`) в `CreateListingBody` /
  `UpdateListingPatch`; `amenities: Amenity[]` в `EditListingDetail`. (Тип `Amenity`
  завести в клиентских enum-типах рядом с `ParkingType`.)

### B.2 Отображение
- Деталь — новая секция «Удобства» (`listing.amenities.title`): список бейджей с
  иконками lucide (например `Snowflake`=кондиционер, `Sofa`=мебель,
  `WashingMachine`/`Microwave`=техника, `Wifi`=интернет, `ArrowUpDown`=лифт,
  `Fence`/`Building`=балкон, `Flame`=отопление, `ShieldCheck`=охрана). Показывать только
  если `listing.amenities?.length`. Рендер — `amenities.map(a => <Badge>{tEnum(a)}</Badge>)`.
- UI-модель: `amenities?: Amenity[]` в `Listing` (`lib/mock/types.ts`); `amenities:
  Amenity[]` в `ApiListingDetail`; маппинг `mapListing` (`amenities: api.amenities ?? []`).
  **В `specs()`/карточку (`ApiSearchItem`/`PropertyCard`) НЕ добавляем.**

### B.3 Фильтр — мега-панель
- `FiltersPanel.tsx`: новая секция «Удобства» (`amenitiesTitle`) — группа чекбоксов
  (мультивыбор) → `amenities: Amenity[]` в draft; `FiltersPanelValues.amenities?:
  Amenity[]`.
- `FilterBar.tsx`: `FilterValues.amenities: Amenity[]`; `extraActive` учитывает непустой
  массив; `panelValues` инициализируется из текущих; **`handlePanelApply`** — в уже
  едином `router.replace`-билдере (после парковки): `params.delete('amenities')` +
  `amenities.forEach(a => params.append('amenities', a))` (повторяющийся параметр, как
  `parking_type`); **`handlePanelReset`** — `setParams({ amenities: undefined })` ОК
  (delete снимает все повторы) ИЛИ в общем билдере `params.delete('amenities')`;
  `buildFilters` сериализует.
- Плюмбинг: `ListingFilter.amenities?: Amenity[]`; `buildSearchParams` —
  `amenities.forEach(a => params.append('amenities', a))` (**append**, не set —
  повторяющийся); `search/page.tsx` парсит массив `amenities` из `searchParams` (как
  `parking_type`/`types`: `searchParams.getAll('amenities')` или эквивалент текущего
  парсинга мультизначных) + noindex long-tail (как парковка); `ActiveFilters.tsx` чип
  `__amenities` (× → прямой `URLSearchParams.delete('amenities')`, как `__parking`) +
  reset-all; `savedSearch.ts` describe/href.

### B.4 i18n (ru/uz/en) — `apps/client/messages/`
- `enums.amenities.*` — 8 ключей (`AIR_CONDITIONING`, `FURNITURE`, `APPLIANCES`,
  `INTERNET`, `ELEVATOR`, `BALCONY`, `HEATING`, `SECURITY`):
  - ru: Кондиционер, Мебель, Бытовая техника, Интернет, Лифт, Балкон, Отопление,
    Видеонаблюдение.
  - uz: Konditsioner, Mebel, Maishiy texnika, Internet, Lift, Balkon, Isitish,
    Videokuzatuv.
  - en: Air conditioning, Furniture, Appliances, Internet, Elevator, Balcony, Heating,
    Security.
- `search.filters.amenitiesTitle` («Удобства»/«Qulayliklar»/«Amenities»).
- `listing.amenities.title` («Удобства»/«Qulayliklar»/«Amenities»).
- `listingNew.fields.amenities.label` («Удобства»/«Qulayliklar»/«Amenities»).
- Чип переиспользует `amenitiesTitle`. Все три файла. ⚠️ mocked next-intl в тестах
  скрывает отсутствующие ключи — проверить ключи вручную ([[avino-client-test-i18n-eslint-gotchas]]).

### B.5 Тесты
RTL — секция/чекбоксы/чип `amenities`, плюс маппинг detail в `lib/api/listings.test.ts`
(фикстура detail `+amenities`). `lint`/`build`/`vitest` зелёные (помнить про 2
предсущ. `LoginModal`-фейла — [[avino-loginmodal-test-preexisting-fail]]).

---

## C. apps/web — модерация (PR #3)

Файлы: `src/store/api/adminTypes.ts` (`amenities: Amenity[]` или `string[]` в
`ListingDetail`), `src/app/admin/listings/[id]/page.tsx` (секция «Удобства» в детали —
бейджи; hardcode-маппинг лейблов, i18n в web нет → зеркало parking/lot_area). Список-
таблицу не трогаем.

---

## D. Объём, порядок, ограничения

3 PR: **PR #1 (api) → мёрж → PR #2 (client) + PR #3 (web)**.
- `main` защищён ([[avino-main-branch-protection]]): PR открывает контроллер, мёржит
  пользователь, никогда `--admin`.
- GitHub — токен из `~/.gh_token` (не печатать); git-мутации по одной команде
  ([[avino-git-mutation-single-commands]]).
- Субагенты `avino-impl` пишут код в одной папке, git/PR ведёт контроллер
  ([[avino-subagents-shared-workdir-git-hazard]]).
- ADR-0111 + `DONE.md` — в feature-PR ([[avino-finalize-in-feature-pr]]).
- Гео-DTO наследуют `SearchListingsQueryDto` → фильтр на `/map` (`/search/radius|bounds|
  polygon`) работает автоматически (1 правка `buildWhereSql`).
- **amenities НЕ в search-карточке** → card-shape тесты (`search.service.spec`,
  `findMine`, клиентский `listings.test`) трогать НЕ нужно — осознанно избегаем гочи
  lot_area.
- ⚠️ После мёржа PR #1 код селектит `amenities` → миграцию `migrate deploy` применить
  до выкладки кода. Накапливается к 3 непринятым: санузлы (`…000000`), парковка
  (`…090000`), участок (`…100000`), теперь удобства (`…110000`).

## Критерии готовности (verify)

- **API:** `GET /search?amenities=ELEVATOR&amenities=AIR_CONDITIONING` сужает до
  объектов, где есть **оба** (AND); один параметр — где есть он; пусто → без фильтра;
  create/update сохраняют `amenities`; detail отдаёт массив; невалидное значение → 400;
  int/unit/dto-spec зелёные; openapi drift зелёный; миграция применяется; GIN-индекс
  создан.
- **client:** визард создаёт/редактирует удобства (опц., мультивыбор); деталь показывает
  секцию «Удобства» бейджами; мега-панель «Удобства» (чекбоксы) пишет повторяющийся
  `amenities` и сужает выдачу по AND; чип/сброс/save-search работают; SSR сохраняет;
  lint/build/тесты зелёные.
- **web:** карточка модерации показывает удобства.
- **Live-verify:** объявление с {лифт, кондиционер} → фильтр «Лифт+Кондиционер» на
  `/search` → попадает; фильтр «Лифт+Мебель» → НЕ попадает (AND); URL содержит
  повторяющийся `amenities`; SSR-перезагрузка сохраняет; деталь/модерация показывают.
