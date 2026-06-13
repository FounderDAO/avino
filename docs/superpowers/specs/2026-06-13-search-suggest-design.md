# Дизайн: подсказки при наборе в поиске (geo-suggest)

_Дата: 2026-06-13 · App: `apps/client` · Поверхность: `/search` (FilterBar)_

## 1. Задача

В строке поиска выдачи («Район, адрес…», `FilterBar.tsx`) при наборе текста
показывать выпадающие подсказки: сверху совпавшие **районы**, ниже реальные
**адреса/улицы** Ташкента. Выбор подсказки должен реально сужать выдачу.

Скриншот-триггер — страница `/search` (заголовок «Покупка жилья · Ташкент»,
«2 объявления»), инпут с плейсхолдером `search.filters.searchPlaceholder`.

## 2. Контекст и ограничения (как есть сейчас)

- **`FilterBar`** рендерится **только на `/search`** (`search/page.tsx:124`),
  уже получает проп `districts: District[]`. Все фильтры — в URL query;
  `setParams()` пишет `router.replace`, серверная страница пересобирает выдачу.
- Текущий инпут — обычный `Field`: `queryDraft` коммитится в `?query=` по
  Enter/blur (`FilterBar.tsx:142–152`).
- **Backend `q` — no-op.** Поле `q` есть в DTO, но `buildWhereSql`
  (`search.service.ts:496`) его не использует (полнотекст отложен на
  TASK-081/082). → Свободный текст сейчас ничего не фильтрует.
- **Таблицы District/City/Region нет.** `district_id` у листинга — висячий UUID.
  Названия районов — статический мок `DISTRICT_NAMES` (8 шт.), проброшен в
  FilterBar как `districts`. Существующий дропдаун района (`?district=<name>`)
  завязан на `district_id` и фактически не фильтрует.
- **PostGIS работает.** `GET /search/radius` (circle) и `/search/bounds` (bbox)
  реальны. Circle живёт в URL как `?clat=&clng=&radius=`
  (`lib/geo.parseCircleParams`, `MIN_RADIUS_M=250`, `MAX_RADIUS_M=50000`),
  `/search` уже вызывает `searchRadiusListings` при наличии circle.
- **Yandex Maps JS API 2.1** уже грузится (`features/map/useYmaps.ts`,
  singleton-лоадер по `NEXT_PUBLIC_YANDEX_MAPS_API_KEY`). У 2.1 есть
  `ymaps.suggest()` (геосаджест без карты) и `ymaps.geocode()`.

## 3. Принятые решения

| # | Вопрос | Решение |
|---|--------|---------|
| 1 | Источник подсказок | **Гибрид**: локальные районы (`districts` prop) + Yandex Suggest для адресов |
| 2 | Что делает выбор района | **Гео-область (bbox → circle)**, без таблицы District |
| 3 | Счётчик у районов | **Нет в v1** |
| 4 | Поведение на `/search` | Остаёмся на странице, гео в URL как circle → `searchRadiusListings` |
| 5 | `/map` | **Вне скоупа v1** — там нет инпута (`MapSearch` не использует FilterBar) |

## 4. Поток данных

```
набор текста в FilterBar
  ├─(debounce 300мс, ≥2 симв.)─ ymaps.suggest("Ташкент, " + q, {results:7})  ┐
  └─ локальный фильтр districts[] по подстроке (case/диакритика-незав.)       ┘
        → объединённый список Suggestion[] (районы сверху, затем адреса)
выбор пункта (мышь/Enter по подсвеченному)
  └─ resolveSuggestion(value):
        ymaps.geocode(value) → первый GeoObject
          → center [lat,lng] + boundedBy (bbox)
          → circleFromBounds(bbox) → { lat, lng, radiusM (clamp 250..50000) }
  └─ setParams({ query: label, clat, clng, radius })
        → router.replace → SSR /search → searchRadiusListings(circle)
очистка инпута / сброс
  └─ setParams({ query: undefined, clat: undefined, clng: undefined, radius: undefined })
```

Точный адрес даёт крошечный bbox → `radiusM` зажимается к `MIN_RADIUS_M` (250 м);
район даёт bbox ~города-района → радиус ~1.5–3 км. Антимеридиан/вырожденность не
актуальны для Ташкента, но `circleFromBounds` валидирует вход и возвращает `null`
при кривом bbox (тогда падаем на `?query=` без гео).

## 5. Дропдаун (макет)

```
┌──────────────────────────────────────┐
│ 🔍  Юнус|                             │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│ РАЙОНЫ                                │
│  ◉  Юнусабадский            (active)  │   ← локально, мгновенно, всегда сверху
│ АДРЕСА                                │
│  📍 Юнусабад, ул. Амира Темура        │   ← Yandex Suggest
│  📍 Юнусабадский район, Ташкент       │
└──────────────────────────────────────┘
```

- Группы-заголовки «Районы»/«Адреса» (i18n) показываются только если в группе
  есть элементы.
- Пустой ответ при ≥2 симв. и не-loading → строка «Ничего не найдено».

## 6. Компоненты (изолированные юниты)

### 6.1 `circleFromBounds(bounds: LatLngBounds): RadiusCircle | null` — `lib/geo.ts`
Чистая функция: центр = середина bbox, `radiusM` = половина диагонали (haversine,
небольшой локальный helper), затем `clampRadius`. Возвращает `null`, если bbox
не проходит `isValidBounds`. **Тестируется без сети.**

### 6.2 `useGeoSuggest(query: string, opts: { enabled: boolean; districts: District[]; locale: string })` — `features/search/useGeoSuggest.ts`
- Лениво грузит ymaps **по `enabled`** (фокус инпута), чтобы не тянуть SDK в
  бандл `/search` до взаимодействия. Переиспользует лоадер из `useYmaps`
  (вынести singleton-загрузку в экспортируемую функцию, если потребуется).
- Дебаунс 300 мс, порог ≥2 символа.
- Мёрж: `districts` по подстроке (нормализация регистра) → `kind:'district'`;
  результаты `ymaps.suggest` → `kind:'geo'`. Дедуп по `title`.
- Возвращает `{ items: Suggestion[]; loading: boolean }`.
- При недоступном ymaps (no-key/error) — `items:[]`, без исключений.

```ts
type Suggestion =
  | { kind: 'district'; title: string; value: string }   // value = "Ташкент, <район>"
  | { kind: 'geo';      title: string; subtitle?: string; value: string };
```

### 6.3 `resolveSuggestion(ymaps, value: string): Promise<{ label: string; circle: RadiusCircle } | null>` — `features/search/useGeoSuggest.ts` (или сосед)
Обёртка над `ymaps.geocode`: первый GeoObject → координаты + `boundedBy` →
`circleFromBounds`. Пустой ответ/нет bbox → `null`.

### 6.4 `SearchAutocomplete` — `features/search/SearchAutocomplete.tsx`
- Оборачивает существующий `Field` + попап со списком (паттерн как у `Dropdown`,
  но управляемый набором).
- ARIA combobox: `role="combobox"` на инпуте, `role="listbox"`/`option`,
  `aria-activedescendant`, `aria-expanded`.
- Клавиатура: `↑/↓` навигация, `Enter` — выбор подсвеченного (или коммит сырого
  текста, если ничего не подсвечено), `Esc` — закрыть.
- Пропы: `value`, `onChange`, `onSelect(suggestion)`, `onSubmitRaw(text)`,
  `items`, `loading`, плейсхолдер/aria из i18n.

### 6.5 Правки `FilterBar.tsx`
- Свап inline-`Field` (строки ~142–152) на `<SearchAutocomplete>`; `queryDraft`
  остаётся как value.
- `enabled` для `useGeoSuggest` — по фокусу инпута.
- `onSelect`: `resolveSuggestion` → `setParams({ query: label, clat, clng, radius })`.
- `onSubmitRaw` (Enter без выбора): как сейчас — `setParams({ query })` без гео.
- Очистка query → `setParams` также чистит `clat/clng/radius` (чтобы circle не
  «прилипал»).

### 6.6 i18n — `messages/{ru,uz,en}.json`
Ключи под `search.filters`: `suggestGroupDistricts`, `suggestGroupAddresses`,
`suggestEmpty`, `suggestAria`.

## 7. Деградация и edge-cases

- **Нет ключа / SDK упал** → подсказок нет, инпут работает как обычный текст
  (паттерн `no-key/error` из `useYmaps`).
- **Enter по свободному тексту** → `?query=` без гео (поведение как сейчас).
- **Geocode пустой / кривой bbox** → не ломаем; остаёмся на `?query=` без гео.
- **Очистка инпута** → снимаем и `query`, и circle-параметры.

## 8. Честное ограничение

Полнотекстовый backend-`q` остаётся no-op до TASK-081/082. То есть свободный
текст **без выбора подсказки** по-прежнему не фильтрует. Но **выбор подсказки
фильтрует по-настоящему** (circle → PostGIS `searchRadiusListings`). Эта фича
впервые делает строку поиска рабочей, не дожидаясь TASK-081/082, и не зависит от
несуществующей таблицы District.

## 9. Тестирование

- **Unit (Vitest):**
  - `circleFromBounds` — центр/радиус/clamp/невалидный bbox (чистая математика).
  - `useGeoSuggest` — мёрж районов + Yandex, дебаунс, порог 2 символа,
    деградация при недоступном ymaps (мок глобала `ymaps`).
  - `resolveSuggestion` — маппинг GeoObject → circle, пустой ответ → null.
- **Component:** `SearchAutocomplete` — клавиатура (↑/↓/Enter/Esc), выбор пункта
  и коммит сырого текста (мок хука).

## 10. Границы

- Только `apps/client`. Бэкенд не трогаем (PostGIS radius уже есть).
- `/map` geo-suggest, таблица District + честный счётчик/фильтр `district_id`,
  серверный полнотекст `q` — **вне скоупа**, отдельные задачи (счётчик и фильтр
  по району → когда появится таблица District; `/map`-инпут → отдельно).
