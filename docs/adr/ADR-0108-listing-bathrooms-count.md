# ADR-0108 — Санузлы (`bathrooms`) как целочисленный count

## Status

Accepted

## Date

2026-06-27

## Context

Дорожная карта Zillow-фильтров (Фаза 1, `docs/superpowers/specs/2026-06-26-zillow-filters-phase1-design.md` §D) выделила первый 🔴-фильтр, требующий новой колонки и поля в визарде — **санузлы**. Нужно решить модель данных: как хранить и фильтровать «санузлы».

Рассматривались три варианта:
1. **Целое число (count)** — `bathrooms` SmallInt, фильтр «N+» (Zillow-style).
2. **Тип санузла (enum)** — `совмещённый / раздельный` (как OLX/Uybor.uz), фильтр — чекбоксы типа.
3. **Оба поля** (count + type).

## Decision

Выбран **вариант 1 — целочисленный count**: колонка `Listing.bathrooms Int? @db.SmallInt` (nullable, без бэкфилла).

- Фильтр — **только `bathrooms_min`** (`bathrooms >= N`, кнопки 1+/2+/3+/4+). Exact-match не делаем (в отличие от `rooms` с легаси «4 = 4+»).
- **Обновление 2026-07-04 (PR #308/#309):** набор значений `bathrooms_min` зафиксирован — **только `1 / 1.5 / 2 / 3 / 4`** (`@IsIn(BATHROOMS_MIN_VALUES)` вместо исходного «любой шаг 0.5» через `IsHalfStep`). Промежуточные `2.5`/`3.5` убраны из кнопок клиента и отклоняются API (400); клиентский SSR `/search` санитизирует старые URL с этими значениями (фильтр молча сбрасывается). Само поле `Listing.bathrooms` не меняется — листинги с 2.5 санузлами по-прежнему валидны и попадают под `2+`.
- Параметр `bathrooms_min` добавлен в `SearchListingsQueryDto`; все гео-DTO его наследуют → покрыты `/search` и `/map` (полигон/радиус/bounds/near-me).
- Поле `bathrooms` зеркалит `rooms` на всех слоях (DTO, сервис, detail/list-ответы, поиск).
- В визарде санузлы **опциональны** (не ломают существующий поток, не требуют бэкфилла).

Причины: клиент ориентируется на Zillow-параллель и кнопки «N+»; enum типа санузла отходит от этого UX; «оба поля» — избыточно для Фазы 2 (YAGNI).

## Consequences

Positive:
- Полная Zillow-параллель UX; единообразие с `rooms` упрощает реализацию и поддержку.
- `optional` query-параметр — non-breaking (CLAUDE.md §14); миграция nullable без бэкфилла.
- Один базовый DTO покрывает все эндпоинты поиска.

Negative / trade-offs:
- Для типовой квартиры обычно 1 санузел → сигнал слабее, чем тип (совмещённый/раздельный). При необходимости тип можно добавить отдельной фичей позже.
- Старые объявления имеют `bathrooms = NULL` и не попадают под `bathrooms_min` — ожидаемо (как `floor`/`area` в Фазе 1).

## Related files

- `apps/api/prisma/schema.prisma` (модель `Listing`), `apps/api/prisma/migrations/20260627000000_add_listing_bathrooms/`
- `apps/api/src/listings/dto/{create,update}-listing.dto.ts`, `apps/api/src/listings/listings.service.ts`
- `apps/api/src/search/dto/search-listings.dto.ts`, `apps/api/src/search/search.service.ts`
- `apps/api/openapi.{public,internal}.json`

## Related task

- Zillow-фильтры Фаза 2 (санузлы). PR #241 (API). Spec: `docs/superpowers/specs/2026-06-27-zillow-filters-phase2-bathrooms-design.md`; plan: `docs/superpowers/plans/2026-06-27-zillow-filters-phase2-bathrooms.md`.
