# ADR-0111 — Удобства объявления (`amenities`) как Postgres enum-массив

## Status

Accepted

## Date

2026-06-27

## Context

Четвёртый (последний) 🔴-фильтр дорожной карты Zillow-фильтров (Фаза 2 §D) — **удобства**
(`amenities`): кондиционер, мебель, лифт и т.п. Снимает давнюю заглушку M5 в
`listings.service.ts` и `create-listing.dto.ts` («структурированный список удобств появится
отдельной задачей M5 — модели в БД ещё нет»).

Нужно было выбрать модель данных для фиксированного UI-словаря удобств с поддержкой:
- мультивыбора при создании/редактировании;
- AND-фильтрации в поиске («есть ВСЕ выбранные»);
- отображения бейджами в детали и панели модерации.

Рассматривались три варианта:
- **Postgres enum-массив** (`Amenity[]`) — GIN-индекс, нативный `@>`-containment.
- **Reference-таблица** (`listing_features` M:N) — runtime-расширяемость, i18n в БД.
- **JSONB** — гибкость, но без типобезопасности и без нативного типа в Prisma.

## Decision

Новый enum `Amenity` (8 значений: `AIR_CONDITIONING`, `FURNITURE`, `APPLIANCES`,
`INTERNET`, `ELEVATOR`, `BALCONY`, `HEATING`, `SECURITY`) + scalar-list колонка
`Listing.amenities Amenity[]` (NOT NULL DEFAULT `'{}'`) + GIN-индекс + AND-containment
фильтр `amenities @> ARRAY[...]::"Amenity"[]` в `buildWhereSql`.

- **Reference-таблица отвергнута**: она нужна только для управляемых данных с
  trilingual-именами в БД (`District`). У удобств лейблы i18n живут на клиенте, рантайм-
  расширяемость не нужна — enum полностью достаточен.
- **JSONB отвергнут**: нет типобезопасности на уровне Prisma/TS, нет нативного типа в
  Prisma client, сложнее индексировать.
- **Аддитивно**: переводимый `featuresText` (`ListingTranslation`) не трогается — остаётся
  для произвольных текстовых пометок.
- Удобства **намеренно не включены** в `SearchListItem`/`SEARCH_SELECT` и
  `ListingListItem`/`LISTING_LIST_SELECT` (карточка остаётся чистой; card-shape тесты не
  затрагиваются). Только в `ListingDetailResponse`/`LISTING_DETAIL_SELECT`.
- Миграция — raw-SQL `CREATE TYPE "Amenity" AS ENUM` + `ADD COLUMN ... NOT NULL DEFAULT '{}'`
  + `CREATE INDEX ... USING GIN` (no local shadow DB, как у всех предыдущих фаз Zillow).
- Параметр поиска — повторяющийся (`?amenities=ELEVATOR&amenities=HEATING`), коэрсируется
  `@Transform(toArray)` как `parking_type` — тот же паттерн.
- Биндинг через `Prisma.sql` + `Prisma.join`. Запрос использует **нативный** тип
  `::"Amenity"[]` (не `::text[]`), чтобы GIN-индекс `listings_amenities_idx` реально
  задействовался планировщиком — каст колонки к `text[]` сбил бы индекс на seq-scan.
  Это сознательное отступление от конвенции `::text`-сравнения скаляров ради
  работающего индекса на array-containment; имя типа `"Amenity"` стабильно (задано
  миграцией).
- Добавление нового значения enum — non-breaking (ADR-0008).

## Consequences

Positive:
- Консистентно с `ParkingType`/`PropertyType` (фиксированный UI-словарь = enum).
- Нет JOIN, нет дополнительной таблицы, type-safe в TypeScript.
- GIN ускоряет `@>`-containment, AND-семантика выразительна.
- Аддитивно: не ломает существующие card-shape тесты (amenities не в карточке).
- Non-breaking для клиентов: поле `amenities` в detail-ответе появляется как опциональное
  (клиенты, не знающие его, просто игнорируют); `DEFAULT '{}'` не требует бэкфилла.

Negative / trade-offs:
- Добавление нового значения enum требует миграции + деплоя всего стека (как у ParkingType).
- Удобства не показываются в карточке поиска — осознанный компромисс ради чистоты
  карточки и card-shape тестов.
- Прод-деплой: накопились 4 непринятые миграции (санузлы/парковка/участок/удобства) —
  все четыре `migrate deploy` нужно применить до выкладки кода.

## Related files

- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260627110000_add_listing_amenities/`
- `apps/api/src/listings/dto/{create,update}-listing.dto.ts`, `apps/api/src/listings/listings.service.ts`
- `apps/api/src/search/dto/search-listings.dto.ts`, `apps/api/src/search/search.service.ts`
- `apps/api/src/search/search.service.int-spec.ts`, `apps/api/src/listings/listings.service.spec.ts`
- `apps/api/openapi.{public,internal}.json`

## Related task

- Zillow-фильтры Фаза 2 (удобства, последний 🔴-фильтр). PR #1 (API). Spec/plan:
  `docs/superpowers/{specs,plans}/2026-06-27-zillow-filters-phase2-amenities*`.
- Предыдущие фильтры — санузлы (ADR-0108), парковка (ADR-0109), участок (ADR-0110).
