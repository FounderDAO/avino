# ADR-0029 — Map bounds search: PostGIS ST_MakeEnvelope / ST_Within

## Status

Accepted

## Date

2026-06-05

## Context

TASK-083 продолжает milestone M8: к публичному поиску (`GET /api/v1/search`,
ADR-0026/0027) и гео-эндпоинтам radius/near-me (ADR-0028) добавляется поиск по
видимой области карты (API.md §10, CLAUDE.md §12):

- `GET /api/v1/search/bounds` — листинги внутри bbox (видимой области карты
  Yandex Maps), маркеры для карты.

ADR-0003 уже зафиксировал интеграцию PostGIS с Prisma: `location
geography(Point,4326)` — производная колонка, синхронизируемая триггером
`listings_sync_location_trg`; GIST-индекс `idx_listings_location` (комментарий
миграции прямо называет «ST_Within (map bounds)») создан raw-SQL (TASK-035). Эта
задача — application-слой поверх готовой схемы; новых миграций нет.

Имена маршрута/параметров в карточке TASK-083 (`/search/map`,
`north/south/east/west`) расходятся с API.md (`/search/bounds`,
`sw_lat/sw_lng/ne_lat/ne_lng`). Источник истины — **docs/API.md**: реализован
маршрут `/search/bounds` с углами bbox `sw_*` (юго-западный) / `ne_*`
(северо-восточный), как и в `/search/clusters`.

API.md §10: все гео-эндпоинты применяют то же promotion-приоритетное
упорядочивание, что `/search`.

## Decision

1. **Маршрут (API versioning, CLAUDE.md §14).** В `SearchController` добавлен
   `@Get('bounds')` (public, как и `/search`): `GET /api/v1/search/bounds`.

2. **bbox-предикат.** Видимая область строится как
   `ST_MakeEnvelope(${sw_lng}, ${sw_lat}, ${ne_lng}, ${ne_lat}, 4326)` —
   порядок аргументов (долгота, широта): `xmin=sw_lng, ymin=sw_lat,
   xmax=ne_lng, ymax=ne_lat`. В `WHERE` добавляется
   `location IS NOT NULL AND location && <envelope>::geography
   AND ST_Within(location::geometry, <envelope>)`. Оператор `&&` — быстрый
   bbox-префильтр по GIST-индексу geography; `ST_Within` — точная проверка
   вхождения (для точечной геометрии по осевому прямоугольнику `&&` уже
   эквивалентен вхождению, но `ST_Within` оставлен явно по контракту API.md §10
   и комментарию миграции). Листинги без координат (NULL `location`) отсекаются.
   Параметры биндятся через `Prisma.sql` (защита от инъекций).

3. **Упорядочивание и пагинация.** Promotion-приоритетный порядок
   (`effective_tier DESC, created_at DESC, id DESC`) с keyset-пагинацией,
   идентично `/search` и `/search/radius` (ADR-0027/0028) — общий time-guarded
   ранг и общий keyset-курсор. `distance_m` не возвращается (центральной точки
   у bbox нет; поле остаётся опциональным и отсутствует — non-breaking).

4. **Переиспользование пайплайна.** Гидратация (`hydrateCards`) и сборка
   keyset-envelope (`buildKeysetEnvelope`), фильтры §9 (`buildWhereSql`) — те же,
   что у `search`/`searchRadius`. Добавлен только приватный `envelopeSql`
   (по аналогии с `pointSql`).

5. **Валидация координат (acceptance criteria, CLAUDE.md §12).**
   `BoundsSearchQueryDto`: `sw_lat`/`ne_lat` (−90..90), `sw_lng`/`ne_lng`
   (−180..180) — обязательные, `@IsLatitude`/`@IsLongitude` + диапазон.
   Отсутствующие/невалидные → `400 VALIDATION_ERROR` глобальным ValidationPipe.

## Consequences

Positive:

- Полный bounds-поиск поверх существующей схемы — без новых миграций.
- `&&` использует GIST-индекс `idx_listings_location` как bbox-префильтр.
- Форма ответа §9 не сломана: `/search` и radius/near-me не затронуты, пайплайн
  ранжирования/гидратации переиспользован (DRY).
- Promotion-поля (`promotion_type`, `promotion_expires_at`, `effective_tier`)
  уже в карточке §9 — маркеры карты получают данные для VIP/TOP-выделения.

Negative / trade-offs:

- bbox через антимеридиан (`sw_lng > ne_lng`) не поддерживается — для рынка
  Узбекистана не требуется; перевёрнутый/вырожденный bbox даёт пустую выдачу,
  а не ошибку.
- Гео-путь — raw-SQL, вне типобезопасности Prisma; компенсируется юнит-тестами
  на форму SQL и live-PostGIS integration-тестами на фактический результат.
- bounds возвращает keyset-страницы (как `/search`), а не «все маркеры разом»;
  агрегация дальнего зума — отдельный `/search/clusters` (backlog M8/M9).

## Extension — TASK-193: arbitrary polygon search (ST_MakePolygon / ST_Within)

`GET /api/v1/search/polygon` generalises bounds from an axis-aligned bbox to an
**arbitrary territory polygon** (replacing the client-side MVP draw-territory of
TASK-152, which sent a bbox to `/search/bounds` and did point-in-polygon in JS).

Decision (extends, does not change, the bounds approach):

- **Same containment family as bounds**: GIST bbox prefilter `location &&
  ${polygon}::geography` + exact `ST_Within(location::geometry, ${polygon})`;
  same `buildWhereSql` filters, `date_desc` promotion-priority keyset and
  hydration pipeline. `location IS NULL` rows are excluded.
- **Input**: a single query param `points` = `lat,lng;lat,lng;…`, parsed by one
  shared helper (`dto/polygon-ring.util.ts → parsePolygonRing`) reused by the
  `@IsPolygonRing()` validator and the service. Validation: ≥ 3 vertices, every
  `lat ∈ [-90,90]` / `lng ∈ [-180,180]`; invalid → `400 VALIDATION_ERROR`.
- **Polygon geometry**: `ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[
  ST_MakePoint(lng,lat), … ]::geometry[])), 4326)` — every coordinate bound via
  `Prisma.sql` (injection-safe), `ST_MakePoint(lng, lat)` longitude-first. The
  ring is **closed on the backend** (first vertex appended if not already equal
  to the last), since `ST_MakePolygon` needs a closed ring (≥ 4 points).
- **Assumption**: the ring is simple (non-self-intersecting), as produced by a
  freehand lasso; `ST_MakeValid` is not applied for MVP.

Consequences: exact territory matching (removes the bbox imprecision and the
single-page limit of the client MVP); no `distance_m` (no centre). Client switch
to `/search/polygon` is a separate small `apps/client` PR (per TASK-193 note).

## Related files

- apps/api/src/search/search.controller.ts
- apps/api/src/search/search.service.ts
- apps/api/src/search/dto/geo-search.dto.ts
- apps/api/src/search/dto/polygon-ring.util.ts (TASK-193 — shared ring parser)
- apps/api/src/search/dto/polygon-ring.spec.ts (TASK-193 — parser unit tests)
- apps/api/src/search/search.service.spec.ts
- apps/api/src/search/search.service.geo.int-spec.ts (live-PostGIS bounds + polygon)
- docs/API.md (§10)

## Related task

- TASK-083
- TASK-193 (arbitrary polygon search — extension above)

## Related ADR

- ADR-0003 (PostGIS via Prisma — location trigger + GIST index)
- ADR-0028 (geo search radius/near-me — reused ranking/hydration pipeline)
- ADR-0026/0027 (public search keyset, filters, promotion sorting)
