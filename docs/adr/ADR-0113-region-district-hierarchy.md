# ADR-0113 — Иерархия Регион → Район (`Region` → `District`)

## Status

Accepted

## Date

2026-06-28

## Context

Справочник районов (`districts`) появился в ADR-0068 как плоская таблица с 12
ташкентскими записями (UUID `d0000000-*`). Портал ориентирован на всей Узбекистан:
14 регионов, ~210 административных районов. Без родительской сущности
невозможно:
- предложить пользователю выбрать регион, а затем сузить список районов;
- фильтровать поиск по региону без N-запросов или client-side join;
- вести единый датасет, а не хранить регион в строке адреса.

Дополнительная проблема: визард создания объявления не задаёт `district_id` —
листинг создаётся без привязки к локации, из-за чего фильтр по локации не
работает.

## Decision

**Подход A: `Region` — отдельная сущность, родитель `District`.**

Ключевые точки решения:

1. **Модель `Region`** (`id UUID PK`, `code TEXT UNIQUE`, `name_uz`, `name_ru`,
   `name_en`, `sort_order INT`) без прямой связи с `Listing` — листинг хранит
   только `district_id` (как и раньше), регион не денормализуется.

2. **`District.region_id UUID FK → Region.id`** (nullable для обратной
   совместимости; все 12 legacy-записей `d0000000-*` получают `region_id`
   Ташкента внутри миграции).

3. **Фильтр поиска по региону** расширяется в подзапрос:
   ```sql
   district_id IN (SELECT id FROM districts WHERE region_id = $1::uuid)
   ```
   Колонка `region_id` в `listings` не вводится (это была бы денормализация).

4. **Источник данных** — репозиторий `FounderDAO/uzbekistan-regions-data`:
   14 регионов + датасет 210 районов Узбекистана (засижено 209 — дубли и мусор
   region-11 исключены). Сид встроен в миграцию `20260628120000_add_regions`
   (одна транзакция). Идемпотентность обеспечивается трекингом Prisma в
   `_prisma_migrations`: `migrate deploy` применяет каждую миграцию ровно один
   раз, поэтому повторный запуск безопасен без `ON CONFLICT`. UUID 12
   ташкентских районов `d0000000-*` сохранены — данные не ломаются при накатке
   на базу с историческими листингами.

5. **`name_en = name_uz`** во всех записях, т.к. исходный датасет содержит только
   uz/ru-варианты; английские названия — TODO Phase C.

6. **Публичный API:**
   - `GET /api/v1/geo/regions` — полный список (сортировка по `sort_order`);
   - `GET /api/v1/geo/districts?region_id=<uuid>` — районы конкретного региона
     (или все при отсутствии параметра);
   - `GET /api/v1/search?region_id=<uuid>` — расширяется в подзапрос (п. 3).

## Consequences

Positive:
- Фронт может строить двухуровневый dropdown регион → район без дополнительных
  запросов.
- Фильтр поиска по региону работает на уровне SQL без client-side логики.
- Non-breaking: листинги без `district_id` не затронуты; новые поля опциональны.
- Сид идемпотентен — безопасен для staging и CI (`migrate deploy` применяет
  миграцию ровно один раз через `_prisma_migrations`, `ON CONFLICT` не нужен).

Negative / trade-offs:
- Визард по-прежнему не задаёт `district_id` — фаза C (отдельная задача).
- Миграция исторических листингов (подвязка к `district_id`/`region_id`) вне
  объёма данной фазы.
- `name_en = name_uz` — временная мера; правильный перевод не заблокирован
  (поле уже есть, достаточно обновить строки).
- Подзапрос `district_id IN (SELECT …)` при большом числе районов (<220) дёшев;
  но если понадобится масштабирование — заменяем на `JOIN`.

## Related files

- `apps/api/prisma/schema.prisma` (модели `Region`, `District.regionId`)
- `apps/api/prisma/migrations/20260628120000_add_regions/migration.sql`
- `apps/api/src/geo/regions.service.ts` (+ `.spec.ts`)
- `apps/api/src/geo/districts.service.ts` (+ `.spec.ts`, `.int-spec.ts`)
- `apps/api/src/geo/geo.controller.ts`
- `apps/api/src/geo/geo.module.ts`
- `apps/api/src/search/dto/search-listings.dto.ts` (`region_id`)
- `apps/api/src/search/search.service.ts` (подзапрос `region_id →
  district_id IN`)
- `apps/api/openapi.public.json`, `apps/api/openapi.internal.json`

## Related task

- Фича «Динамические районы» (Task A1–A6, feat/regions-api).
  Spec: `docs/superpowers/specs/2026-06-28-dynamic-regions-districts-design.md`.
  Plan: `docs/superpowers/plans/2026-06-28-dynamic-regions-districts.md`.
