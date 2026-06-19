# ADR-0096 — Saved-search алерты по нарисованной территории (полигон, ST_Within)

## Status
Accepted

## Date
2026-06-19

## Context
Сохранённый поиск (`saved_searches`) уже умеет слать алерты при появлении новых
ACTIVE-объявлений (polling-матчер `check_saved_searches`, ADR-0031/TASK-102):
in-app уведомление + email-дайджест. Но матчер `SearchService.matchNewlyActiveListings`
**намеренно игнорировал любые гео-фильтры** — в MVP saved-search оперировал только
скалярами (`transaction_type`, `property_type`, `currency`, `city_id`, `district_id`,
`price_min/max`, `rooms`, `q`).

При этом на `/search` пользователь может **нарисовать произвольную территорию**
(freehand-лассо, `/search/polygon`, ADR-0072/TASK-193) и фильтровать выдачу по
контуру через PostGIS `ST_Within`. Возникло требование (CLAUDE.md §11 «saved search
rule»): если пользователь сохранил поиск с нарисованной территорией, алерты должны
приходить только по объявлениям **внутри этого контура**, а не по всему городу.

Дополнительно команда зафиксировала продуктовое решение по объёму MVP: территорию
можно **сохранить** и она участвует в алертах, но клик по сохранённому поиску
**не перерисовывает** контур на карте (перезапуск идёт по скалярам). Это снимает
самую дорогую часть клиентской работы (восстановление map-стейта) без потери
ценности (ценность — сами алерты).

## Decision
1. **Хранение.** Полигон хранится в `filters_json.filters.points` той же
   сериализованной строкой `lat,lng;lat,lng;…`, что уже использует живой
   `/search/polygon` (`serializePolygonRing` на клиенте ↔ `parsePolygonRing` на
   бэке — единственный источник истины). `schemaVersion` **НЕ меняется** (остаётся
   `1`): `points` — опциональный ключ внутри `filters`; старые сохранённые поиски
   остаются валидны.
2. **Матч.** `matchNewlyActiveListings` извлекает кольцо через новый чистый хелпер
   `polygonVerticesFromFilters(filters)` (тройной исход: `undefined` — нет
   территории; `null` — кольцо битое; `PolygonVertex[]` — валидно) и при валидном
   кольце дописывает `AND location IS NOT NULL AND location && <poly>::geography AND
   ST_Within(location::geometry, <poly>)` — зеркало `/search/polygon`, переиспользуя
   приватный `polygonSql`. **Общий `buildWhereSql` НЕ трогается** — ни один живой
   эндпоинт поиска (`/search`, `/search/radius`, `/search/bounds`, `/search/polygon`)
   не задет.
3. **Битое кольцо → пропуск прогона.** Если `points` есть, но кольцо невалидно
   (`< 3` вершин / координаты вне WGS84), матчер возвращает `[]` и логирует warning —
   осознанно НЕ рассылаем алерты по всему городу (safe-fail).
4. **Клиент: save-only, без redraw.** `FilterBar.buildFilters` кладёт нарисованный
   полигон (через Redux-слайс `territory`, зеркалящий контур из `SearchResults`) в
   сохранённый поиск. `filtersToSearchHref` **намеренно не мапит `points`** в URL —
   по клику территория заново не рисуется (выдача перезапускается по скалярам).
   Страница `/map` в объём не входит (там нет кнопки «Сохранить поиск»).

## Consequences

Positive:
- Алерты по сохранённому поиску теперь уважают нарисованную территорию.
- Изменение изолировано в `matchNewlyActiveListings`; живые эндпоинты поиска и
  существующее поведение saved-search (фильтры без территории) не затронуты.
- Формат полигона и валидация единые с `/search/polygon` — расхождение невозможно.
- Перф приемлем: матчер бьёт только по узкому окну `published_at` (новые за прогон),
  `ST_Within` идёт по горстке кандидатов с GIST-индексом `idx_listings_location`.
- Без миграции БД и без бампа `schemaVersion` — обратная совместимость.

Negative / trade-offs:
- **Список по клику шире зоны алертов.** Поскольку `filtersToSearchHref` игнорирует
  `points`, открытый по клику список показывает совпадения по скалярам по всему
  городу, тогда как алерты — только внутри контура. Осознанный MVP-компромисс;
  бейдж «территория» в списке сохранённых помечает такие поиски.
- Перерисовка/редактирование сохранённой территории — отдельная будущая работа
  (round-trip), как и сохранение территории со страницы `/map` и push-канал.

## Related files
- `apps/api/src/search/dto/polygon-ring.util.ts` — `polygonVerticesFromFilters`
- `apps/api/src/search/dto/polygon-ring.spec.ts` — тесты хелпера
- `apps/api/src/search/search.service.ts` — `matchNewlyActiveListings` (ST_Within)
- `apps/api/src/search/search.service.match.spec.ts` — тесты матчера
- `apps/client/src/store/territorySlice.ts` — шаринг контура (PR #2)
- `apps/client/src/features/search/FilterBar.tsx` — сохранение `points` (PR #2)
- `apps/client/src/lib/savedSearch.ts` — бейдж «территория», no-redraw (PR #2)

## Related task
- TASK saved-search-polygon-alerts (backend = PR #1, client = PR #2)
