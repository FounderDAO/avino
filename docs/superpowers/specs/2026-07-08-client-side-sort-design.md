# Клиентская сортировка /search без запросов к API

**Дата:** 2026-07-08
**Область:** `apps/client` (бэкенд не трогаем)

## Проблема

Смена сорта на /search шла через `router.replace(?sort=)` → полная RSC-навигация →
сервер пересортировывал и вся страница ре-рендерилась (в т.ч. тяжёлое перестроение
пинов Yandex-карты → фриз 5-10 с). Плюс в режимах карта/территория сервер сорт
**игнорирует** (`searchBounds`/`searchByPolygon` всегда `date_desc`), так что там
сорт сегодня и медленный, и не работает вовсе.

Замеры: API все сорты ~35-55 мс, RSC-рендер ~56-85 мс, весь не-карточный путь ~250 мс.
Значит фриз давало только перестроение маркеров карты.

## Решение

Сорт — чисто клиентское состояние и переупорядочивание уже загруженного списка.
Запрос к API идёт **только** при смене города/района/региона, границ карты,
территории или прочих фильтров. Смена сорта — 0 запросов.

Решение по режиму >60 (выбор владельца): **всегда только клиент, без запросов на
сорт**. Список сортирует загруженный набор; «Показать ещё» домешивает и пере-сортирует.

| Режим | На сорт |
|---|---|
| Список ≤60 (весь набор загружен) | клиент, 0 запросов, глобально верно |
| Карта / территория (≤100) | клиент, 0 запросов — чинит сломанное сегодня |
| Список >60 | сортируем загруженные; догрузка домешивается и пере-сортируется |

## Компоненты

### 1. `lib/sortListings.ts` (новый, чистая функция + тест)
`sortListings(list: Listing[], sort: SortOption, rate?: number): Listing[]`
Реплика гибрида ADR-0117 на клиенте:
- `tierRank(promo)`: VIP=2, TOP=1, NORMAL=0. Клиент получает `effective_tier` →
  промо уже с учётом истечения, отдельная обработка expiry не нужна.
- `promotion` (дефолт): полный промо-приоритет — `tier desc, createdAt desc, id desc`.
- `price_asc`/`price_desc`: топ-3 промо закреплены (`tier desc, createdAt desc, id desc`),
  остальное строго по цене, **нормализованной в USD** через `convertPrice()` из
  `format.ts` и курс из `useGetExchangeRateQuery`; при `rate` undefined — сырая цена.
- `area_desc` (и `area_asc`): топ-3 промо + площадь `Number(area)` desc/asc,
  пустая/NULL площадь — в конец.
- `date_desc`: топ-3 промо + `createdAt desc`.
- Tie-break везде `id desc` (паритет с сервером).
- Чистая, детерминированная, без сайд-эффектов → покрывается юнит-тестами.

### 2. `store/sortSlice.ts` (новый)
По образцу `resultPricesSlice`. `{ sort: SortOption }`, дефолт `'promotion'`.
Экшены `setSort`, `hydrateSort` (из URL при заходе). Селектор `selectSort`.
Регистрируется в `store.ts` как `sort: sortReducer`.

### 3. `SortControl.tsx` (правка)
- Убрать `router.replace`. Читать текущий сорт из Redux (`selectSort`).
- `onChange`: `dispatch(setSort(next))` + **shallow** `history.replaceState` с `?sort=`
  (для шаринга/saved-search; без навигации и рефетча). `promotion` → удаляем параметр.
- На маунте — `hydrateSort` из `?sort=` (шареная ссылка / restore saved-search).

### 4. `SearchResults.tsx` (правка)
- Читать `sort` из Redux.
- `fetchFilter` = фильтр **без** `sort` (питает `useViewportSearch`, полигон-запрос,
  `loadMore`, `filterKey`) → смена сорта больше не триггерит рефетч и не сбрасывает
  пагинацию.
- Курс: `useGetExchangeRateQuery` → `rate`.
- `sortedForDisplay = useMemo(() => sortListings(displayed, sort, rate), [displayed, sort, rate])`
  — отдаётся и в список, и в `MapView`, и в `setResultPrices`.
- `MapView`-фикс из прошлого шага (порядко-независимый `listingsKey` + кэш layout)
  остаётся — нужен для смены набора/фильтров.

### 5. Бэкенд: `area` на карточке поиска (обнаружено при верификации)
`GET /search` возвращал `lot_area`, но НЕ `area` — клиент не имел данных для
`area_desc` (сорт вырождался в id-desc tie-break). Это ровно репорт-кейс
«Largest area first», поэтому данные обязательны. Добавлено (обратносовместимо,
3 строки в `search.service.ts`): `area` в `SearchListItem`, `area: true` в
`SEARCH_SELECT`, `area: listing.area?.toFixed(2) ?? null` в маппере. Клиент:
`area` в `ApiSearchItem`, маппинг `area` из карточки (не только из detail).
Openapi regen НЕ нужен — карточка поиска = interface, не декорированный DTO,
в спеке её нет (drift-check не сработает).

## Не трогаем
- Прочий бэкенд.
- `page.tsx` SSR: продолжает передавать `sort` в `searchListingsPage`. На SSR
  Redux sort = дефолт `promotion`, поэтому первый paint = промо-порядок, затем
  клиент пере-сортирует под `?sort=` (мелкий флеш только на шареных sort-ссылках;
  интерактивная смена сорта — без флеша).

## Верификация (выполнена)
- Юнит: `sortListings` 10 тестов, `SortControl` 7 тестов (реальный store), клиент 459 зелёных, tsc чист.
- Headless Chrome (extension-free, т.к. Dark Reader ломает гидратацию в обычной вкладке):
  default-порядок = API promotion точь-в-точь; `?sort=area_desc` = API area_desc точь-в-точь.
- Репликация `sortListings` с реальным курсом воспроизводит порядок API для `price_asc`
  и `area_desc` полностью (43 позиции). Divergence price в headless — из-за незагруженного
  курса (fallback на сырую цену, юнит-тест покрывает).

## Проверка
- Юнит-тесты `sortListings` (все режимы, промо-закрепление, FX, null-площадь, tie-break).
- `pnpm --filter @avino/client test`, `tsc --noEmit`.
- Браузер: смена сорта = 0 сетевых запросов (кроме курса), мгновенный ре-ордер;
  карта/территория сортируются; «Показать ещё» сохраняет сорт.
