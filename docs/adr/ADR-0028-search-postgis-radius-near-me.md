# ADR-0028 — Geo search: PostGIS radius (ST_DWithin) & near-me (ST_Distance)

## Status

Accepted

## Date

2026-06-05

## Context

TASK-082 продолжает milestone M8: к публичному поиску (`GET /api/v1/search`,
ADR-0026/0027) добавляются гео-эндпоинты карты (API.md §10, CLAUDE.md §12):

- `GET /api/v1/search/radius` — листинги в радиусе от точки;
- `GET /api/v1/search/near-me` — ближайшие к точке (для mobile).

ADR-0003 уже зафиксировал интеграцию PostGIS с Prisma: `location
geography(Point,4326)` — производная колонка (Prisma `Unsupported`), которую
синхронизирует с `latitude`/`longitude` триггер `listings_sync_location_trg`;
GIST-индекс `idx_listings_location` создан raw-SQL миграцией (TASK-035); все
гео-запросы идут через `prisma.$queryRaw`. Эта задача — application-слой поверх
готовой схемы; новых миграций нет.

Имена маршрутов в карточке TASK-082 (`/search/nearby`) расходятся с API.md
(`/search/radius` + `/search/near-me`). Источник истины — **docs/API.md**:
реализованы два маршрута radius и near-me.

API.md §10 задаёт два правила упорядочивания: все гео-эндпоинты применяют то же
promotion-приоритетное упорядочивание, что `/search`, **кроме** near-me, где
первичный ключ — дистанция (промо — вторичный ключ при равенстве).

## Decision

1. **Маршруты (API versioning, CLAUDE.md §14).** В `SearchController`
   добавлены `@Get('radius')` и `@Get('near-me')` (public, как и `/search`):
   `GET /api/v1/search/radius`, `GET /api/v1/search/near-me`.

2. **Точка запроса.** Строится как
   `ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography` — долгота первой,
   как в sync-триггере `location` (DB_SCHEMA §14). Параметры биндятся через
   `Prisma.sql` (защита от инъекций).

3. **Radius — `ST_DWithin` по GIST-индексу.** В `WHERE` добавляется
   `location IS NOT NULL AND ST_DWithin(location, <point>, ${radius_m})`
   (метры, тип geography). Листинги без координат (NULL `location`) отсекаются.
   Порядок — promotion-приоритетный (`effective_tier DESC, created_at DESC,
   id DESC`) с keyset-пагинацией, идентично `/search` (ADR-0027); используется
   общий time-guarded ранг и общий keyset-курсор.

4. **Near-me — сортировка по `ST_Distance`.** `ORDER BY ST_Distance(location,
   <point>) ASC, <tier_rank> DESC, created_at DESC, id DESC` — дистанция
   первична, промо вторично (API.md §10). Одна страница размером `limit`
   (default 20 / max 100); keyset-курсор не применяется (`next_cursor = null`).

5. **`distance_m` в карточке.** Оба гео-эндпоинта добавляют опциональное
   `distance_m` (метры, `ST_Distance`, округление до целого) к карточке §9.
   В обычном `/search` поле отсутствует — это non-breaking optional field
   (API.md §4). Дистанция считается в том же raw-запросе и пробрасывается в
   карточку при гидратации по `id`.

6. **Переиспользование пайплайна ранжирования.** Гидратация (`findMany` по `id`
   + восстановление порядка) и сборка keyset-envelope вынесены в общие приватные
   методы `hydrateCards` / `buildKeysetEnvelope`; `search`, `searchRadius`,
   `searchNearMe` используют их. Фильтры §9 строятся тем же `buildWhereSql`.

7. **Валидация координат (acceptance criteria, CLAUDE.md §12).**
   `GeoSearchQueryDto`: `lat` (−90..90), `lng` (−180..180) — обязательные,
   `@IsLatitude`/`@IsLongitude` + диапазон. `RadiusSearchQueryDto.radius_m` —
   `1..50000` м (верхняя граница ограничивает стоимость запроса).
   Отсутствующие/невалидные → `400 VALIDATION_ERROR` глобальным ValidationPipe.

## Consequences

Positive:

- Полный radius/near-me-поиск поверх существующей схемы — без новых миграций.
- `ST_DWithin` (radius) использует GIST-индекс `idx_listings_location`.
- Форма ответа §9 не сломана: `distance_m` опционально, `/search` не затронут.
- Логика ранжирования/гидратации переиспользована (`search` ↔ `radius`), DRY.

Negative / trade-offs:

- near-me сортирует через `ST_Distance` (вычисление дистанции на отфильтрованном
  наборе), а не KNN-оператор `<->`; для MVP-объёмов приемлемо, KNN-оптимизация —
  backlog M8 (как и глубокая пагинация в ADR-0026/0027).
- Гео-пути — raw-SQL, вне типобезопасности Prisma; компенсируется юнит-тестами
  на форму SQL и live-PostGIS integration-тестами на фактический результат.
- `radius_m` ограничен 50 км — крупнее радиус потребует пересмотра границы.

## Related files

- apps/api/src/search/search.controller.ts
- apps/api/src/search/search.service.ts
- apps/api/src/search/dto/geo-search.dto.ts
- apps/api/src/search/search.service.spec.ts
- apps/api/src/search/search.service.geo.int-spec.ts (live-PostGIS radius/near-me)
- docs/API.md (§10)

## Related task

- TASK-082

## Related ADR

- ADR-0003 (PostGIS via Prisma — location trigger + GIST index)
- ADR-0026 (public search keyset & basic filters)
- ADR-0027 (search promotion-aware sorting — reused ranking pipeline)
