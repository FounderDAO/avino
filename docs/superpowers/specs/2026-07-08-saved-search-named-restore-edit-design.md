# Именованные сохранённые фильтры: точное восстановление + EDIT/DELETE

**Дата:** 2026-07-08
**Область:** `apps/client` (backend не трогаем)
**Референс:** Zillow «Name your search» модалка

## Проблема

Фича сохранённых поисков (`SavedSearch`) уже реализована end-to-end (модель `name` + `filters_json`, полный backend CRUD, клиентский api-слайс, список в аккаунте). Не хватает четырёх вещей из запроса:

1. **Несколько именованных фильтров** — ✅ уже работает (N записей на юзера, каждая с именем).
2. **Открывать в том же состоянии, как сохранил** — ⚠️ частично: скаляры восстанавливаются, но теряются нарисованный полигон территории, мультивыбор типа недвижимости, сортировка и валюта.
3. **Дать имя при сохранении (Zillow-модалка)** — ❌ имя генерится авто, модалки ввода нет.
4. **EDIT / DELETE в списке** — ⚠️ DELETE есть, EDIT (переименование) нет.

## Решения (согласованы с владельцем)

- **Частота алертов:** НЕ добавляем. Оставляем текущий вкл/выкл алерта (`is_active`, колокольчик). Модалка = только поле имени. Без миграции БД.
- **Восстановление:** полное, включая нарисованный полигон территории.
- **EDIT:** только переименование (не пересохранение фильтров, не inline-редактор значений).

## Архитектура

Backend не меняется: модель `SavedSearch` уже хранит `name VARCHAR(150)` + `filters_json JSON` (envelope `{schemaVersion:1, filters:{...}}`), маршруты `POST/GET/PATCH/DELETE /api/v1/saved-searches` работают, `PATCH` принимает `name`. Клиентские хуки `useCreate/Update/Delete/GetSavedSearchesQuery` тоже есть.

Вся работа — в `apps/client`. Три блока.

### Блок 1. Модалка именования — новый `SaveSearchModal`

`apps/client/src/features/search/SaveSearchModal.tsx` — переиспользуемый Radix Dialog (портал в body: правило `.fade-up`+`position:fixed`; Radix Dialog порталит сам).

«Тупой» компонент, пропы:
- `open: boolean`
- `initialName: string`
- `onSubmit: (name: string) => Promise<void> | void`
- `onClose: () => void`
- (опц.) `title`, `submitLabel`, `isSubmitting`

Содержимое:
- Поле «Название поиска», префилл = `initialName`, `maxLength=150` (лимит backend). Пустое имя → кнопка disabled.
- Primary «Сохранить» → `onSubmit(name)`; успех → toast «Поиск сохранён» (sonner уже подключён) + `onClose`.
- Cancel/закрытие.

Родитель подключает `onSubmit` к `create` (в FilterBar) либо `update` (в списке аккаунта) — **одна модалка на оба сценария**.

Изменение флоу в `FilterBar.tsx` (`handleSaveSearch` / `doSave`, стр. 395–419):
- Авторизован → открыть модалку с `initialName = describeFilters(filters, t)` (вместо мгновенного авто-сейва).
- Гость → LoginModal + `pendingSave`; после входа открыть модалку (не авто-сейв).
- `onSubmit(name)` → `createSavedSearch({ name, filters })`.

### Блок 2. Точное восстановление (round-trip)

**Сохранение** — `buildFilters` в `FilterBar.tsx` (стр. 351–388), добавить:
- `sort` — из `values.sort` (`SortOption`, уже есть, стр. 75). `if (values.sort) filters.sort = values.sort`.
- `currency` — из `useCurrencyPreference()` (display-валюта из Redux), чтобы `price_min/max` интерпретировались в той же валюте.

**Восстановление** — `filtersToSearchHref` в `lib/savedSearch.ts` (стр. 132–178), добавить/починить:
- `set('sort', asString(filters.sort))`.
- `set('currency', asString(filters.currency))` (search-страница парсит `currency`).
- **Мультивыбор типа:** сейчас эмитит один `type` из `property_type`. Починить: если есть `property_types[]` — повторять `params.append('type', t)` для каждого; иначе fallback на одиночный `property_type`. Search-страница читает повторяемый `type` → `types[]`.
- **`points` (полигон):** `set('points', asString(filters.points))` (убрать текущий намеренный skip, стр. 174–175).

**Полигон территории** — три точки:
- `lib/geo.ts`: новый `deserializePolygonRing(str): LatLng[] | null` — обратный к `serializePolygonRing` (формат `lat,lng;lat,lng;…`), с валидацией диапазонов lat∈[-90,90]/lng∈[-180,180] и ≥3 точек (симметрично правилам сериализатора).
- `app/[locale]/search/page.tsx`: распарсить `points` из `searchParams` → `deserializePolygonRing` → передать `initialPolygon?: LatLng[]` в `<SearchResults>` (рядом с `initialBounds`, стр. 331–338).
- `features/search/SearchResults.tsx`: засидить локальный стейт `polygon` из `initialPolygon` один раз на маунте (`useState(() => initialPolygon ?? null)`). Дальше работает существующая машинерия: `points` memo (стр. 104) → polygon-поиск (`useSearchByPolygonQuery`) + зеркало в Redux (`setTerritory`) + `MapView` рисует оверлей (`polygon` проп уже принимается, `MapView.tsx:58`).

**Валюта на восстановлении:** при заходе на search с параметром `currency` — выставить display-префу `setCurrency(currency)` (осознанно перекрывает глобальную префу, чтобы состояние совпало с сохранённым). Точка применения — там же, где search-страница/`SearchResults` читает currency-параметр; уточнить в плане (эффект на клиенте при наличии `?currency=`).

### Блок 3. EDIT/DELETE в списке аккаунта

`features/account/SavedSearches.tsx`, `SavedSearchRow` (стр. 92–146):
- DELETE — уже есть (кнопка X), оставляем.
- EDIT — новая кнопка «карандаш» → открывает `SaveSearchModal` в режиме переименования (`initialName = item.name`, `onSubmit` → `updateSavedSearch({ id, name })`) → toast + инвалидация тега `SavedSearch`.
- Открытие строки (Link `filtersToSearchHref`) теперь восстанавливает точно (см. Блок 2).
- Кластер действий строки: open (Link) + edit (карандаш) + alert (колокольчик) + delete (X). Минимальная перекомпоновка.

## i18n

Новые ключи в `messages/{ru,uz,en}.json`: заголовок модалки, лейбл/placeholder поля имени, «Сохранить»/«Отмена», aria кнопки EDIT, заголовок переименования, toasts. **Гоча:** мокнутый next-intl в тестах прячет пропущенные ключи → проверять вручную во всех трёх локалях. Для uz — риск кириллических двойников, сверять глазами.

## Тестирование

- **unit `geo.ts`:** `deserializePolygonRing` — round-trip с `serializePolygonRing`, невалидные входы (NaN, out-of-range, <3 точек, пустая строка) → `null`.
- **unit `savedSearch.ts`:** `filtersToSearchHref` эмитит `sort`, `currency`, `points`, и повторяемый `type` для `property_types[]`.
- **живой прогон (Chrome, рецепт из памяти):** сохранить поиск с полигоном + сортировкой + валютой + мультитипом → открыть из списка → состояние (карта/чипы/сортировка/валюта) совпадает с сохранённым.

## Основной риск

Восстановление полигона: SSR-страница сперва отрисует скалярную выдачу, затем клиент подхватит `polygon` и переключится на polygon-поиск (ровно как при ручной обводке сейчас). План обязан верифицировать, что `SearchResults` прокидывает локальный `polygon` в `MapView` (для отрисовки восстановленной территории) и что есть аффорданс «сбросить территорию» на восстановленном полигоне.

## Файлы

| Файл | Изменение |
|---|---|
| `features/search/SaveSearchModal.tsx` | **NEW** переиспользуемая модалка |
| `features/search/FilterBar.tsx` | флоу сейва → модалка; `buildFilters` += sort, currency |
| `lib/savedSearch.ts` | `filtersToSearchHref` += sort, currency, points, мультитип |
| `lib/geo.ts` | `deserializePolygonRing` + unit-тест |
| `features/search/SearchResults.tsx` | сид `polygon` из `initialPolygon` |
| `app/[locale]/search/page.tsx` | парсинг `points` → `initialPolygon` проп |
| `features/account/SavedSearches.tsx` | кнопка EDIT + переиспользование модалки |
| `messages/{ru,uz,en}.json` | i18n-ключи |

Backend/миграции: нет. `is_active` (колокольчик) без изменений. Частоты нет.
