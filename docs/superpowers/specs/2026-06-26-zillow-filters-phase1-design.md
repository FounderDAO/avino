# Spec: фильтры «как у Zillow» — Фаза 1 (вид + фильтры без миграций)

**Дата:** 2026-06-26
**Статус:** approved (дизайн утверждён)
**Затрагивает:** `apps/api`, `apps/client`
**Дорожная карта:** Фаза 1 (этот спек) → Фаза 2+ (🔴-фильтры с миграциями, см. §D)

## Контекст и цель

Клиенту нравится Zillow. Задача — переделать фильтры поиска (`/search` и `/map`)
под раскладку и поведение Zillow. По скриншотам Zillow весь набор фильтров
разложен на нашу модель `Listing` (см. карту в §0). Решено идти **фазами**: Фаза 1
даёт Zillow-вид бара + подключает все фильтры, **по которым колонки в БД уже есть**
(миграции не нужны). 🔴-фильтры, требующие новых колонок и полей в визарде, —
последующие фазы.

Цель Фазы 1: бар вида
`[🔍] · [Купить ▾] · [Цена ▾] · [Комнаты ▾] · [Тип жилья ▾] · [⚙ Фильтры ▾] · [Сохранить поиск]`
+ рабочая фильтрация по: сделка, цена(+валюта), комнаты (N+/точно, до 5+),
мультивыбор типа, площадь м², год постройки, этаж + «не первый/последний»,
этажность, собственник/агентство, «принимает заявки на просмотр», сортировка.

## §0. Карта Zillow → Avino (для контекста)

🟢 уже есть · 🟡 колонка в БД есть, подключаем (без миграции) · 🔴 миграция + поле
в визарде (Фаза 2+) · ⚪️ US-специфика, не делаем.

| Zillow | Вердикт | Фаза |
|---|---|---|
| For sale / For rent | 🟢 `transaction_type` | 1 |
| Sold (вкладка) | ⚪️ публичный поиск только ACTIVE | — |
| Price (List, min/max) | 🟢 `price`+`currency` (тоггл сум/$) | 1 |
| Price-гистограмма | 🟡 нужен endpoint распределения | позже |
| Monthly Payment / BuyAbility | ⚪️ нет ипотеки | — |
| Bedrooms Any/1+…/5+ + exact | 🟢 `rooms` (+ новый `rooms_min`) | 1 |
| Bathrooms (санузлы) | 🔴 новая колонка | 2+ |
| Property type (мультивыбор) | 🟡 `property_type` → массив | 1 |
| Max HOA | ⚪️ нет HOA | — |
| Listing type: Owner / Agent | 🟡 `ownerId`/`agencyId` | 1 |
| Listing type: New construction | 🟢 = тип `NEW_BUILDING` | 1 |
| Foreclosures / Auctions | ⚪️ нет рынка | — |
| Listing status (MLS) | ⚪️ MLS-специфика | — |
| Tours: Must have open house | 🟡 `toursEnabled` | 1 |
| Tours: 3D Tour / Showcase | ⚪️ нет 3D-туров | — |
| Parking / garage | 🔴 новая колонка | 2+ |
| Square feet (min/max) | 🟡 `area` (м²) | 1 |
| Lot size | 🔴 новая колонка | 2+ |
| Year built (min/max) | 🟡 `yearBuilt` | 1 |
| Basement | ⚪️ малорелевантно | — |
| Number of stories (этажность) | 🟡 `totalFloors` + локально `floor` | 1 |
| 55+ Communities | ⚪️ N/A | — |
| Amenities (A/C, pool, waterfront) | 🔴 кондиционер → amenities | 2+ |
| View (City/Mountain/Park/Water) | ⚪️ низкий приоритет | — |
| Commute Time (INRIX) | ⚪️ сторонний US-сервис | — |
| Save search · Draw (полигон) | 🟢 оба есть | 1 |

## Решения (утверждены)

- **Сортировка** переносится к счётчику результатов (`72 результата · Сортировка ▾`),
  как у Zillow; убирается из бара.
- **Купить/Аренда** — дропдаун (`Купить ▾`), а не текущий сегмент.
- **Этаж** — помимо min/max добавляем локальные чекбоксы «не первый» / «не
  последний» (у Zillow нет, для рынка маст).
- Источник истины фильтров — **URL-query** (текущий паттерн `router.replace`);
  SSR-страница перечитывает `searchParams`. Save search сериализует те же
  параметры.
- Все новые query-параметры `GET /search` — **optional** (non-breaking, §14
  CLAUDE.md). Колонки уже в БД → **миграций нет**.
- Реализация — **2 PR** по app-папкам: сначала `apps/api`, затем `apps/client`.

---

## A. apps/api — параметры `GET /search` и `buildWhereSql`

Файлы: `apps/api/src/search/dto/search-listings.dto.ts`,
`apps/api/src/search/dto/geo-search.dto.ts`,
`apps/api/src/search/search.service.ts` (+ spec/int-spec).

`buildWhereSql` — общий для всех эндпоинтов поиска, включая гео-варианты (полигон).
Новые поля добавить **и** в `search-listings.dto.ts`, **и** в `geo-search.dto.ts`
(или вынести общий базовый DTO), чтобы фильтры работали и в `/map`.

### A.1 Новые / изменённые параметры (все `@IsOptional`)

| Параметр | Тип | Семантика в `WHERE` |
|---|---|---|
| `property_type` | `PropertyType` \| `PropertyType[]` | мультивыбор → `property_type IN (...)`. Одиночное значение остаётся валидным (обратная совместимость) |
| `rooms_min` | int ≥0 | `rooms >= N` (кнопки «N+») |
| `rooms` | int ≥0 | `rooms = N` (режим «Точное совпадение»). Сохранить текущий бэк-компат «4 = 4+» для старых saved searches (см. §A.3) |
| `area_min` / `area_max` | number ≥0 | `area >= / <= N` (уже задекларированы — **подключить** в WHERE) |
| `floor_min` / `floor_max` | int ≥0 | `floor >= / <= N` |
| `not_first_floor` | bool | `floor > 1` (и `floor IS NOT NULL`) |
| `not_last_floor` | bool | `floor < total_floors` (оба `NOT NULL`) |
| `total_floors_min` / `total_floors_max` | int ≥0 | `total_floors >= / <= N` |
| `year_min` / `year_max` | int | `year_built >= / <= N` |
| `listing_source` | `OWNER` \| `AGENCY` (\| оба) | `OWNER` → `agency_id IS NULL`; `AGENCY` → `agency_id IS NOT NULL`; оба/пусто → без фильтра |
| `tours_enabled` | bool | `tours_enabled = true` |

`sort` — уже есть (`SORT_MODES`), не меняем; promotion-тир остаётся первичным ключом.

### A.2 Реализация
- Числа из query приводит глобальный `ValidationPipe` (`enableImplicitConversion`).
  Для `property_type`-массива — `@IsEnum(PropertyType, { each: true })` + нормализация
  одиночного значения в массив (`@Transform`).
- `listing_source` — отдельный enum (`SEARCH_LISTING_SOURCE = ['OWNER','AGENCY']`),
  валидировать `@IsIn`.
- Все ветки добавляются в `buildWhereSql` параметризованными плейсхолдерами
  (никакой конкатенации значений — следуем текущему стилю сервиса).
- Объявления с `NULL` по `floor`/`year_built`/`total_floors`/`area` **не попадают**
  под соответствующий диапазонный фильтр — это ожидаемо и допустимо.

### A.3 Обратная совместимость
- Старый клиент/saved searches шлют `rooms` (с «4 = 4+»). Эту семантику в сервисе
  **сохраняем**. Новый клиент для «N+» шлёт `rooms_min`, для «точно» — `rooms`.
- Цена сравнивается **в пределах валюты** (`currency`), FX не применяем — текущее
  поведение без изменений.

### A.4 OpenAPI
⚠️ `/search` — публичный эндпоинт. Добавление optional-фильтров non-breaking, но
CI drift-check сравнивает с `openapi.public.json` → **регенерировать**
(`pnpm openapi:export` + 4 dummy env) и закоммитить в тот же PR.

---

## B. apps/client — раскладка бара и контролы

Файлы: `apps/client/src/features/search/FilterBar.tsx` (реструктуризация),
`ActiveFilters.tsx` (расширение чипов), `SearchResults.tsx` (сортировка к
счётчику), `app/[locale]/search/page.tsx` и `app/[locale]/map/page.tsx`
(парсинг новых `searchParams` → `FilterValues`), `lib/savedSearch.ts`
(`SavedSearchFilters` + `describeFilters`), клиентский слой построения query
к `GET /search` (`lib/api/listings`), i18n-сообщения (§C).

### B.1 Раскладка бара (на существующих `Pill`/`Dropdown`/`Segment`)
`[🔍 SearchAutocomplete] · [Купить ▾] · [Цена ▾] · [Комнаты ▾] · [Тип жилья ▾] · [⚙ Фильтры ▾] · [Сохранить поиск]`

- **Купить ▾** — `Dropdown` с радио Купить/Аренда (Sold не делаем). Заменяет
  текущий `Segment`.
- **Цена ▾** — min/max + тоггл валюты сум/$ (текущий `useCurrencyPreference`).
  Гистограмму **не делаем** в Фазе 1.
- **Комнаты ▾** — кнопки `Любое / 1+ / 2+ / 3+ / 4+ / 5+` (по умолчанию «N+» →
  `rooms_min`) + чекбокс **«Точное совпадение»** (переключает на `rooms`).
- **Тип жилья ▾** — **мультивыбор** наших 5 типов (чекбоксы) + «Снять все».
  Шлёт повторяющийся `property_type`.
- **⚙ Фильтры ▾** (мега-панель) — см. §B.2.
- **Сохранить поиск** — как есть (расширить сериализацию, §B.3).

Переиспользуемые контролы (новые мелкие компоненты в `features/search/`):
`RangeFields` (пара min/max — цена/площадь/этаж/этажность/год),
`BedroomsControl`, `HomeTypeMultiSelect`, `FiltersPanel`.

### B.2 Мега-панель «Фильтры» (= Zillow «More»)
Десктоп — `DropdownContent` (как сейчас); мобайл — полноэкранный sheet.
Содержимое Фазы 1, сверху вниз:
- **Площадь, м²** — `RangeFields` → `area_min`/`area_max`.
- **Год постройки** — `RangeFields` → `year_min`/`year_max`.
- **Этаж** — `RangeFields` (`floor_min`/`floor_max`) + чекбоксы «не первый»
  (`not_first_floor`) / «не последний» (`not_last_floor`).
- **Этажность дома** — `RangeFields` → `total_floors_min`/`total_floors_max`.
- **Тип объявления** — чекбоксы Собственник / Агентство → `listing_source`.
- **Принимает заявки на просмотр** — чекбокс → `tours_enabled`.
- Низ панели: «Сбросить всё» / «Применить».

(Резерв под Фазу 2+ в этой же панели: санузлы, парковка/гараж, площадь участка,
кондиционер/удобства.)

### B.3 Save search и активные чипы
- `lib/savedSearch.ts`: расширить `SavedSearchFilters` и `describeFilters(t)` на
  новые параметры (имена — как в query `GET /search`).
- `ActiveFilters.tsx`: добавить чип на каждый новый активный фильтр (× убирает
  параметр; «Сбросить всё» чистит все, сохраняя `tx`/`view`).

### B.4 Сортировка
- Убрать `<select>` из `FilterBar`; показать `Сортировка ▾` рядом со счётчиком
  результатов в `SearchResults.tsx` (`N результатов · Сортировка ▾`). Значения и
  маппинг (`toApiSort`) не меняются.

---

## C. i18n
Новые ключи в `apps/client/src/messages/{ru,uz,en}.json` под `search.filters.*`:
лейблы бара (`buy/rent`, `rooms`, `homeType`, `moreFilters`), мега-панели
(`areaTitle`, `yearTitle`, `floorTitle`, `notFirstFloor`, `notLastFloor`,
`totalFloorsTitle`, `listingSource.owner/agency`, `toursEnabled`), чипов,
`exactMatch`, `deselectAll`, `apply`, `resetAll`. Все три языка (uz/ru/en).

---

## D. Дорожная карта Фаза 2+ (вне этого спека)
Каждый 🔴 — отдельная фича/спек: миграция БД + поле в **визарде создания**
(`apps/client/src/features/listing-new`) + редактировании + модерации/детали +
фильтр в API/UI + бэкфилл:
1. **Санузлы** (`bathrooms` SmallInt) — кнопки 1+/1.5+/2+/3+/4+ в «Комнаты и санузлы».
2. **Парковка/гараж** (bool/enum) — чекбокс в мега-панели.
3. **Площадь участка** (`lot_area` Decimal) — `RangeFields` (соток).
4. **Кондиционер/удобства** (amenities JSONB или связь features) — чекбоксы.

---

## E. Объём, порядок, ограничения
2 PR по app-папкам (одна папка = один PR, §5 CLAUDE.md):
1. **PR #1 `apps/api`** — новые/изменённые параметры DTO (search + geo) +
   `buildWhereSql` + int-spec на каждый фильтр (мультивыбор, rooms_min/exact,
   area/floor/year/total_floors/listing_source/tours) + regen `openapi.public.json`.
2. **PR #2 `apps/client`** — реструктуризация `FilterBar` под Zillow + контролы +
   мега-панель + сортировка к счётчику + чипы + save search + i18n + RTL-тесты.
   Зависит от PR #1 (новые параметры), мёржится после.

Ограничения:
- `main` защищён: открываю PR, мёржит пользователь (никогда `--admin`).
- GitHub-операции — токеном из `~/.gh_token` (значение не печатать).
- Git-мутации по одной команде (цепочки через `&&` отклоняются правами).
- Каждая app-папка — отдельная ветка/PR; субагенты не трогают git.

## Критерии готовности (verify)
- **API:** `GET /search` и гео-варианты применяют каждый новый фильтр; мультивыбор
  `property_type` даёт `IN`; `rooms_min` = «≥N», `rooms` = «=N» (старый «4=4+» жив);
  `not_first/last_floor` корректны; невалидные значения → 400; int-spec зелёные;
  openapi drift-check зелёный.
- **client:** бар выглядит как Zillow (`Купить ▾ · Цена ▾ · Комнаты ▾ · Тип жилья ▾ ·
    ⚙ Фильтры ▾ · Сохранить поиск`); мега-панель открывается (десктоп-дропдаун /
  мобайл-sheet); каждый фильтр пишет нужный query-параметр и меняет выдачу; чипы и
  «Сбросить всё» работают; сортировка у счётчика; save search сохраняет новые
  фильтры; `lint`+`build` зелёные; RTL-тесты FilterBar/ActiveFilters зелёные.
- **Live-verify** (стенд/локально): выставить площадь/год/этаж/тип(мультивыбор)/
  собственник — выдача сужается ожидаемо; URL содержит параметры; перезагрузка
  страницы (SSR) сохраняет фильтры.
