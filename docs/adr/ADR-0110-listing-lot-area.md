# ADR-0110 — Площадь участка (`lot_area`) как отдельное Decimal-поле в сотках

## Status

Accepted

## Date

2026-06-27

## Context

Третий 🔴-фильтр дорожной карты Zillow-фильтров (Фаза 1 §D) — **площадь участка**.
Нужно решить: единицы измерения и соотношение с существующим `area` (м²), который
для LAND уже показывается как «X м² участок» (`format.ts`, i18n `units.landArea`).

## Decision

Новое **отдельное** поле `Listing.lotArea Decimal? @map("lot_area") @db.Decimal(10, 2)`
(nullable), единицы — **соток** (1 сотка = 100 м²; конвенция РУз).

- **Аддитивно**: существующий `area` (м²) и `landArea`-показ для LAND **не трогаем**.
  Для дома: `area` = жилая площадь (м²), `lot_area` = участок (соток).
- Зеркалит `area`: create/update DTO — строка-Decimal (`@Matches(DECIMAL_2)`); search —
  числа `lot_area_min`/`lot_area_max` (`@IsNumber @Min(0)`); `buildWhereSql` —
  `lot_area >= / <= ::numeric`. Параметр в `SearchListingsQueryDto` (наследуют все гео-DTO).
- В визарде — опционально, числовой ввод, показывается только для **HOUSE + LAND**.
- Фильтр UI — `RangeFields` (переиспользуем), новый компонент не нужен.

## Consequences

Positive:
- Корректно различает жилую площадь дома и площадь участка.
- Полностью переиспользует паттерн `area` (DTO/сервис/фильтр/RangeFields) — минимум нового кода.
- `optional`/nullable — non-breaking; миграция без бэкфилла.

Negative / trade-offs:
- Для LAND возможна лёгкая избыточность (и «X м² участок» от `area`, и «X соток» от
  `lot_area`) — осознанный компромисс ради аддитивности; чистка landArea-хака — отдельной задачей при желании.
- Деплой: код селектит `lot_area` → миграцию `migrate deploy` применить до выкладки кода.

## Related files

- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260627100000_add_listing_lot_area/`
- `apps/api/src/listings/dto/{create,update}-listing.dto.ts`, `apps/api/src/listings/listings.service.ts`
- `apps/api/src/search/dto/search-listings.dto.ts`, `apps/api/src/search/search.service.ts`
- `apps/api/openapi.{public,internal}.json`

## Related task

- Zillow-фильтры Фаза 2 (площадь участка). PR #1 (API). Spec/plan:
  `docs/superpowers/{specs,plans}/2026-06-27-zillow-filters-phase2-lot-area*`.
- Предыдущие фильтры — санузлы (ADR-0108), парковка (ADR-0109).
