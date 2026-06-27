# ADR-0109 — Парковка/гараж как enum `ParkingType`

## Status

Accepted

## Date

2026-06-27

## Context

Второй 🔴-фильтр дорожной карты Zillow-фильтров (Фаза 1 §D) — **парковка/гараж**.
Нужно решить модель данных. Рассматривались: boolean (есть/нет), enum типа, два
boolean (`parking` + `garage`).

## Decision

Выбран **enum `ParkingType`**: `YARD` (Двор) · `COVERED` (Крытая) · `GARAGE` (Гараж)
· `UNDERGROUND` (Подземная). Колонка `Listing.parkingType ParkingType?
@map("parking_type")` — **nullable**, `NULL` = «нет/не указано».

- **Без значения `NONE`**: «Нет» в визарде = null (не отправляем) — иначе NULL vs
  NONE дублируют «нет парковки».
- **Фильтр — мультивыбор** `parking_type` (повторяющийся параметр → `parking_type::text
  IN (...)`), зеркало `property_type`. NULL под фильтр не попадает.
- Параметр в `SearchListingsQueryDto` (наследуют все гео-DTO → `/search` + `/map`).
- В визарде — опционально, single-select (Нет/Двор/Крытая/Гараж/Подземная).

Причина выбора enum (а не boolean): различает гараж и дворовую парковку — клиент
просил эту детализацию.

## Consequences

Positive:
- Богаче boolean: тип виден в детали/модерации, фильтруется по типам.
- `optional` query + nullable колонка — non-breaking; миграция без бэкфилла.
- Один базовый DTO покрывает все search-эндпоинты (мультивыбор как `property_type`).

Negative / trade-offs:
- enum-параметр поиска (массив) не авто-документируется Swagger CLI в openapi
  query-params — идентично существующему `property_type` (известное ограничение).
- Старые объявления `parking_type = NULL` — под фильтр не попадают (ожидаемо).
- Деплой: смёрженный код селектит `parking_type` → миграцию `migrate deploy`
  применить до выкладки кода.

## Related files

- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260627090000_add_listing_parking_type/`
- `apps/api/src/listings/dto/{create,update}-listing.dto.ts`, `apps/api/src/listings/listings.service.ts`
- `apps/api/src/search/dto/search-listings.dto.ts`, `apps/api/src/search/search.service.ts`
- `apps/api/openapi.{public,internal}.json`

## Related task

- Zillow-фильтры Фаза 2 (парковка). PR #1 (API). Spec/plan:
  `docs/superpowers/{specs,plans}/2026-06-27-zillow-filters-phase2-parking*`.
- Предыдущий фильтр — санузлы (ADR-0108).
