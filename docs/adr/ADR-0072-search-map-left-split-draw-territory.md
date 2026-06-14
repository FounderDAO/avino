# ADR-0072 — /search и /map: карта слева + «Нарисовать территорию» вместо радиуса

## Status

Accepted

## Date

2026-06-14

## Context

Публичные страницы выдачи (`/search` — Купить/Аренда — и `/map`) использовали
сплит «список + карта», но с разной раскладкой и разными инструментами выбора
области на карте:

- `/search` (`SearchResults`): список слева (~58%), карта справа (~42%); выбор
  области — **радиус** (зажал-потянул, круг в URL `?clat&clng&radius`, SSR
  `searchRadiusListings` → `GET /search/radius`).
- `/map` (`MapSearch`): список слева (~42%), карта справа (~58%); выбор области —
  **«Нарисовать территорию»** (freehand-лассо → `GET /search/polygon`, ST_Within,
  ADR-0070).

Два разных способа выбора области и зеркальные раскладки путали. Запрошено
единообразие: карта слева, карточки справа на обеих страницах, и на `/search`
вместо радиуса — та же «Нарисовать территорию», что на `/map`.

## Decision

- **Раскладка:** на `/search` и `/map` — карта СЛЕВА (~50%), карточки СПРАВА
  (~50%), на десктопе (≥1000px). Мобайл без изменений: тогл «Карта»/«Список».
- **Инструмент области на `/search`:** радиус убран; добавлено «Нарисовать
  территорию» (полигон) — тот же flow, что на `/map`, через RTK Query
  `useSearchByPolygonQuery` (`GET /search/polygon`, ST_Within на сервере).
  Поиск по территории учитывает текущие фильтры из URL; сброс территории
  возвращает SSR-выдачу по фильтрам. Запрос декларативный (`skipToken` без
  территории), смена фильтров при активной территории авто-рефетчит.
- **Sort §9 в RTK-слое:** `searchApi` переиспользует канонический
  `lib/api/listings.toApiSort` (промо-приоритет — серверный дефолт; невалидные
  значения опускаются), устранив дублирующий маппинг, который слал
  `promotion_priority_desc` → 400 при поиске по территории/области с сортировкой
  (ADR-0071).

Радиусная инфраструктура (`searchRadiusListings`, `parseCircleParams`,
MapView `drawMode='radius'`) физически не удалена — остаётся как dormant
capability; из пользовательского flow `/search` она выведена.

## Consequences

Positive:
- единый предсказуемый UX выбора области на `/search` и `/map`;
- одна точка истины серверной геометрии (ST_Within), нет радиусного дубля в UI;
- единый `toApiSort` — нет рассинхрона sort-контракта между SSR и RTK-слоями.

Negative / trade-offs:
- остаётся неиспользуемый радиусный код (`searchRadiusListings`/`parseCircleParams`)
  — кандидат на отдельную уборку;
- `/search` теперь делает клиентский запрос при рисовании территории (как `/map`),
  а не SSR-перерисовку по URL, как было у радиуса.

## Related files

- apps/client/src/features/search/SearchResults.tsx
- apps/client/src/app/[locale]/search/page.tsx
- apps/client/src/features/map/MapSearch.tsx
- apps/client/src/store/api/searchApi.ts
- apps/client/src/lib/api/listings.ts (`toApiSort` экспортирован)

## Related task

- Карта слева / карточки справа + «Нарисовать территорию» на /search (Купить/Аренда) и /map
- Связано с ADR-0070 (polygon search), ADR-0071 (SSR API-base + sort §9)
