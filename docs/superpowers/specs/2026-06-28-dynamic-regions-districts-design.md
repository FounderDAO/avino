# Динамические районы: иерархия Регион → Район

**Дата:** 2026-06-28
**Статус:** дизайн утверждён, готов к плану
**Источник данных:** `github.com/FounderDAO/uzbekistan-regions-data` (14 регионов, 210 районов; trilingual: latin / cyrillic / ru; JSON/SQL/CSV)

## Проблема

В фильтре поиска (`/search`, `/map`) дропдаун «Район» **всегда показывает 12 районов Ташкента**, независимо от выбранной локации. Если пользователь ищет в Намангане — он всё равно видит ташкентские районы.

Корень — архитектурный, не баг отрисовки:
- `District` (`apps/api/prisma/schema.prisma:880`) — автономный плоский справочник **без привязки к городу/региону**; засижено только 12 районов Ташкента (фиксированные UUID `d0000000-…-0001 … 0012`).
- Таблицы `cities`/`regions` нет; `cityId` на листинге — скалярная UUID-колонка без FK и без данных.
- Дропдаун «Район» рендерит ответ `GET /api/v1/geo/districts` (весь справочник = Ташкент) и ни от чего не зависит.

Дополнительно: визард создания объявления (`ListingNew.tsx`) задаёт локацию только адресом + точкой на карте и **не пишет `district_id`** → реальные пользовательские объявления невидимы для фильтра по району даже в Ташкенте. Фильтр сегодня матчит только засиженный каталог.

## Цель

1. Каскадный выбор локации **Регион → Район** в фильтре поиска: выбран регион → «Район» показывает только районы этого региона.
2. Полный справочник Узбекистана (14 регионов + 210 районов), trilingual.
3. Продавец из любого региона может указать Регион+Район при создании/редактировании объявления → фильтр реально работает.

## Решение (Подход A: регион — родитель района)

Регион хранится только как родитель района. Листинг по-прежнему ссылается на `district_id`; фильтр по региону раскрывается в набор районов региона. Аддитивно, не ломает существующие листинги, переиспользует фильтр по району. Колонку региона на листинг **не вводим**.

Отвергнутые альтернативы:
- **B** (+`region_id` на листинге) — лишняя колонка и синхронизация; не нужно, т.к. визард всегда задаёт район.
- **C** (резолв из координат через геокодер) — тяжело, недетерминированно, у датасета нет геометрии границ; оверкилл.

---

## 1. Модель данных и миграция (`apps/api`)

### Схема (`schema.prisma`)

Новая модель `Region`:
```prisma
model Region {
  id        String     @id @default(uuid()) @db.Uuid
  code      String     @unique @db.VarChar(40)   // latin-slug: andijon, namangan, toshkent-shahri, …
  nameUz    String     @map("name_uz") @db.VarChar(120)  // latin
  nameRu    String     @map("name_ru") @db.VarChar(120)
  nameEn    String     @map("name_en") @db.VarChar(120)
  sortOrder Int        @map("sort_order")
  districts District[]
  createdAt DateTime   @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime   @updatedAt @map("updated_at") @db.Timestamptz(6)
  @@map("regions")
}
```

`District` получает связь с регионом:
```prisma
regionId String?  @map("region_id") @db.Uuid
region   Region?  @relation(fields: [regionId], references: [id])
@@index([regionId])
```
`regionId` nullable (graceful degradation), но сид заполняет его для всех строк.

### Миграция SQL (по образцу `20260613130000_add_districts/migration.sql`)

Один файл, генерируется детерминированным скриптом из `regions.json`/`districts.json`:

1. `CREATE TABLE regions (...)`.
2. INSERT 14 регионов с детерминированными UUID `c0000000-0000-4000-8000-{12-знач. region_id датасета}`, `code` = latin-slug, `sort_order` по алфавиту RU.
3. `ALTER TABLE districts ADD COLUMN region_id uuid` + FK на `regions(id)` + `CREATE INDEX`.
4. `UPDATE districts SET region_id = '<UUID город Ташкент>' WHERE code IN ('bektemir','chilonzor','mirobod','mirzo-ulugbek','olmazor','sergeli','shayxontohur','uchtepa','yakkasaroy','yashnobod','yangihayot','yunusobod')` — наши 12 UUID `d0000000-*` и имена **сохраняются**, листинги/сиды не ломаются.
5. INSERT остальных ~197 районов с детерминированными UUID `e0000000-0000-4000-8000-{12-знач. district_id датасета}` и `region_id`.
   - **Пропускаем** районы датасета с `region_id = 11` (город Ташкент — дублируют наши 12) и мусорную строку `id = 2993` (`name_ru = null`).

### Имена

- **Импортированные районы** — берутся из датасета **как есть** (`name_ru` = «Андижанский район», `name_uz` = «Andijon tumani»). `name_en` = `name_uz` (латиница; датасет английского не содержит). Без хрупкого стриппинга суффиксов.
- **12 ташкентских районов** — без изменений (короткая форма `Чиланзар`). Внутри каждого региона стиль консистентен; небольшое расхождение Ташкент↔остальные — осознанное, обратимое.
- **Регионы** — из датасета как есть (`Наманганская область`, `город Ташкент`, …). `name_en` = `name_uz`.

Справочные данные едут **внутри миграции** — отдельный сид не нужен (как у `add_districts`). Сиды `seed-catalog/demo/pagination` менять не требуется (ссылаются на сохранённые UUID `d0000000-*`).

---

## 2. API (`apps/api`)

### Гео-справочник (`src/geo`)

- **`GET /api/v1/geo/regions`** (public, версия 1) → `[{ id, code, name_uz, name_ru, name_en }]`, сортировка по `sort_order`. Новый `RegionsService.listAll()` (зеркало `DistrictsService`).
- **`GET /api/v1/geo/districts?region_id=<uuid>`** — `DistrictsService.listAll(regionId?)` получает опциональный фильтр (`where: { regionId }`). **Без параметра — прежнее поведение** (весь список) → обратносовместимо.
- В `DistrictListItem` добавляется поле **`region_id`** (аддитивно) — клиенту для каскада.

### Поиск (`src/search`)

- `SearchListingsDto` (`dto/search-listings.dto.ts`) получает `region_id?: string` (`@IsUUID`, `@IsOptional`, `@ApiPropertyOptional`). Базовый DTO → поле наследуется в `geo-search.dto` (`/map`, полигон) → каскад работает и на карте.
- В построении `WHERE` (`search.service.ts`, рядом с `:837`, где `district_id = …::uuid`):
  ```ts
  if (query.region_id !== undefined)
    conds.push(Prisma.sql`district_id IN (SELECT id FROM districts WHERE region_id = ${query.region_id}::uuid)`);
  ```
- Если переданы оба (`region_id` + `district_id`) — `district_id` сужает (AND). Листинг без района под фильтр региона не попадает (визард район требует — §4).

### Документы и тесты

- Регенерация `openapi.public.json` / `openapi.internal.json` через `pnpm openapi:export` (новый роут + новый query-параметр; иначе CI drift-check красный).
- Юнит/инт-тесты: `RegionsService.listAll`, `DistrictsService.listAll(regionId)`, ветка `region_id` в `search.service.spec`.
- **ADR-0113** — иерархия регион→район, выбор Подхода A, источник данных.

---

## 3. Клиент: поиск (`apps/client`)

### Гео-слой (`lib/api/geo.ts`)

- Новый `getRegions(lang)` → `GET /geo/regions`; UI-тип `Region { id, name, code }`.
- `getDistricts(lang)` отдаёт **все** районы (210, `revalidate: 3600`); `mapDistrict` добавляет `regionId` (из нового `region_id`). Каскад фильтруется на клиенте — без рефетча при смене региона.
- UI-тип `District` (`lib/mock/types.ts`) получает `regionId?: string`.

### `search/page.tsx` (server)

Фетчим `regions` + все `districts`, прокидываем в `FilterBar` (`regions: Region[]`, `districts: District[]`).

### `FilterBar.tsx` — каскад

- Новый дропдаун **«Регион»** (зеркало паттерна «Тип жилья»), перед «Район». Выбор → `setParams({ region_id, district_id: undefined })` — район сбрасывается при смене региона.
- **«Район» зависимый:** показывает `districts.filter(d => d.regionId === values.regionId)`. Пока регион не выбран — триггер **задизейблен** с подсказкой «Сначала выберите регион». Это фикс исходного бага.
- `FilterValues` + `values` получают `regionId`; `buildFilters` (saved search) и `buildSearchParams` (`/map`) шлют `region_id`; `ActiveFilters` — чип региона со сбросом; reset очищает регион и район.

### i18n (ru/uz/en)

`filters.region`, `filters.allRegions`, `filters.regionRequired`. Ключи проверяются вручную (мок next-intl скрывает пропуски).

### Тесты

`FilterBar.test`: выбор региона включает «Район»; смена региона сбрасывает район; «Район» задизейблен без региона. `geo` mapping с `regionId`.

---

## 4. Клиент: создание и редактирование (`apps/client`)

### Переиспользуемый каскад

`RegionDistrictSelect` — общий компонент Регион→Район (район зависит от региона), используется визардом, формой редактирования и (по возможности) логикой фильтра, чтобы не дублировать каскад.

### `ListingNew.tsx` (визард)

- В состояние формы — `regionId`, `districtId`.
- На шаге «Адрес» (над `AddressStep`) — `RegionDistrictSelect`.
- Оба поля **обязательны** (валидация шага рядом с проверкой адреса).
- Payload: `body.district_id = districtId` (для фильтра) + `body.city_id = regionId` (поле в DTO уже есть — заполняем для detail/админки). Отдельной колонки региона на листинге нет (Подход A).
- Данные каскада: server-фетч `regions` + `districts` на `/sell/new`, прокидываем в визард.

### `ListingEdit.tsx`

Те же два поля; префилл из `city_id`/`district_id` объявления; та же валидация и payload в `update`. Server-фетч справочников на `/sell/:id/edit`.

### i18n

`listingNew.fields.region` / `.district` (label/placeholder/ошибка) в ru/uz/en.

### Тесты

Валидация (нельзя сабмитить без региона/района), маппинг payload (`district_id` + `city_id`), каскадный сброс района.

---

## 5. Разбивка PR, выкатка

**3 PR** (граница — app-папка):

- **PR1 — `apps/api`** (мёржится первым): `Region` модель + миграция + `RegionsService` + `GET /geo/regions` + `districts ?region_id=` + `region_id` в поиске + OpenAPI regen + ADR-0113 + тесты + DONE.md.
- **PR2 — `apps/client` (поиск)**: `getRegions`/`District.regionId` + дропдаун «Регион» + зависимый «Район» + `ActiveFilters`/saved-search/`buildSearchParams` + i18n + тесты. Зависит от PR1.
- **PR3 — `apps/client` (визард)**: `RegionDistrictSelect` + поля в `ListingNew`/`ListingEdit` + валидация + payload + i18n + тесты.

**Контроль качества:** `pnpm --filter @avino/api test` + `lint` + `tsc`; `pnpm --filter @avino/client test` (база 180 passed / 2 known-fail `LoginModal` — не регресс); ручная сверка i18n-ключей и unused-импортов.

**Выкатка:** staging/prod — `prisma migrate deploy` (не `migrate dev`); `prisma generate` после смены схемы. Справочные данные внутри миграции — отдельного сида нет.

**Git:** ветки `feat/regions-*`; PR открываю, мёржит юзер (main protected, без `--admin`).

## Вне объёма (явно)

- Боковой блок «Районы» на главной (`Districts.tsx`) — остаётся ташкентским.
- Гео-саджест по регионам (распознавание региона в поисковой строке).
- Полигоны границ районов / point-in-polygon.
- Миграция существующих prod-листингов на `district_id` (исторические данные).

## Критерии готовности

- Выбор «Регион» = Наманган → «Район» показывает наманганские районы, не ташкентские.
- `GET /geo/regions` и `GET /geo/districts?region_id=` возвращают корректные данные; поиск с `region_id` фильтрует листинги по районам региона.
- Новое объявление с выбранным Регион+Район находится фильтром по своему региону/району.
- Существующие ташкентские листинги и сиды не сломаны (UUID `d0000000-*` сохранены).
- API-тесты и клиент-тесты зелёные; OpenAPI drift-check зелёный.
