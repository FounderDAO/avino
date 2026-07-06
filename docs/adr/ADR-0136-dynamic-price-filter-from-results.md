# ADR-0136 — Динамический price filter: домен и гистограмма из цен текущей выдачи (клиент), а не из /search/price-distribution

## Status

Accepted

## Date

2026-07-06

## Context

Слайдер цены на `/search` публичного портала (`apps/client`) был статичным
(`$0 – $2M+`). Гистограмма и границы приходили из `GET /api/v1/search/price-distribution`
(ADR-0112), который считает распределение **глобально по всем ACTIVE-объявлениям**
страны для заданного `transaction_type`+`currency` и ничего не знает про текущий
контекст пользователя (выбранный регион/район, область карты, применённые фильтры).

Итог: при выдаче «город Ташкент» (13 объявлений, ~$45k–$132k) весь полезный
диапазон слайдера схлопывался у левого края, а 30 столбцов гистограммы были почти
пустыми — фильтр цены становился бесполезным именно в тех сценариях, где он нужен.

Требование Team Lead: границы слайдера и высота столбцов должны зависеть от
реального min/max **текущей выдачи** и меняться динамически при смене района или
перемещении карты.

## Decision

Домен слайдера и гистограмма считаются **на клиенте из цен уже загруженной
выдачи** — того же списка, что рендерит карточки. Бэкенд не трогаем.

1. **Redux-зеркало цен.** Новый `resultPricesSlice`
   (`setResultPrices`/`clearResultPrices`/`selectResultPrices`) хранит **сырые**
   пары `{ price: number; currency: Currency }` текущей выдачи. `SearchResults`
   зеркалит туда `displayed` в `useEffect` и очищает на unmount — тот же паттерн,
   что уже применён для нарисованной территории (`territorySlice`). Хранение
   именно сырых пар (не конвертированных чисел) обязательно: тоггл `[сум|$]`
   пересчитывает фильтр без повторной загрузки списка.
2. **`displayed` мемоизирован** (`useMemo`). Ветка `polygonData ?? []` создавала
   новый литерал на каждый рендер — без мемоизации эффект-зеркало зациклился бы.
3. **`PriceFilter` считает домен и бакеты из стора**, а не из RTK Query:
   - `toDisplayPrices(pairs, displayCurrency, rate)` конвертирует цены в
     отображаемую валюту курсом ЦБУ (`convertPrice`); при отсутствии курса цены
     другой валюты пропускаются (деградация, как у прежней серверной гистограммы).
   - домен: `min = 0` всегда; `max = niceCeil(maxPrice)` при `maxPrice > 0`, иначе
     `FALLBACK_MAX` (USD `1_000_000` / UZS `12_000_000_000`) — для пустой/ещё не
     загруженной выдачи.
   - `buildPriceHistogram(prices, domain, 30)` — 30 равных интервалов на клиенте.
   - подпись правого края больше без «+» (домен накрывает максимум выдачи).
4. **Клиентский `priceDistributionApi` удалён** (мёртвый после перехода). Тип
   `PriceBucket` переехал в `features/search/controls/priceRange.ts`. Серверный
   эндпоинт `GET /api/v1/search/price-distribution` **сохранён** — может
   использоваться мобильным приложением.
5. Публичные props `PriceFilter` не изменились — `FilterBar` не тронут.

## Consequences

Positive:

- Слайдер и гистограмма всегда соответствуют реальной выдаче; смена района или
  пан карты пересчитывает фильтр автоматически, без новых сетевых запросов.
- Один сетевой запрос меньше при открытии фильтра цены (данные уже в сторе).
- Переиспользован проверенный паттерн зеркала (`territorySlice`), чистые функции
  (`niceCeil`/`toDisplayPrices`/`buildPriceHistogram`) полностью покрыты юнит-тестами.

Negative / trade-offs:

- Домен считается по **загруженной** выдаче: viewport/полигон — до 100
  объявлений, paged-режим растёт с догрузкой «Показать ещё». Для очень крупных
  выдач верхняя граница может быть чуть занижена. Осознанный выбор в пользу
  простоты (по указанию Team Lead).
- Веб и мобилка расходятся по источнику гистограммы: веб — из выдачи (клиент),
  мобилка — из `/search/price-distribution` (сервер). Эндпоинт остаётся живым.
- Нет отдельного компонентного теста `PriceFilter` (fallback/динамический домен);
  логика — тонкий glue над покрытыми pure-функциями. Отложено как follow-up.

## Related files

- `apps/client/src/store/resultPricesSlice.ts` (+ `store.ts` регистрация)
- `apps/client/src/features/search/SearchResults.tsx` (мемо `displayed` + зеркало)
- `apps/client/src/features/search/PriceFilter.tsx` (домен/бакеты из стора)
- `apps/client/src/features/search/controls/priceRange.ts` (`niceCeil`, `toDisplayPrices`, `buildPriceHistogram`, `PriceBucket`)
- `apps/client/src/features/search/controls/PriceRangeControl.tsx` (импорт `PriceBucket`, подпись без «+»)
- удалён: `apps/client/src/store/api/priceDistributionApi.ts`

## Related ADR

- ADR-0112 — Zillow price filter histogram (серверный `/search/price-distribution`, который на вебе больше не используется).
- ADR-0093 — Currency toggle + daily CBU rate (курс для конвертации цен выдачи).
- ADR-0124 — Zillow viewport search (источник `displayed`, который зеркалится).

## Related task

- TASK-251 — Динамический price filter из цен текущей выдачи (client).
