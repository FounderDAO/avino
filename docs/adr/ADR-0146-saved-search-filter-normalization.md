# ADR-0146 — Нормализация legacy-фильтров saved-search на границе воркера алертов

## Status

Accepted

## Date

2026-07-13

## Context

`SavedSearchAlertService` (polling-матчер алертов, TASK-102) передаёт сырой
`filters_json` в `SearchService.matchNewlyActiveListings` в обход DTO-слоя —
`@Transform(toArray)` из `SearchListingsQueryDto` не применяется. При этом
клиент (`FilterBar.buildFilters`, apps/client) исторически пишет в
`filters_json`:

- `property_type` **строкой** (`"HOUSE"`) — legacy single-select; при
  мультивыборе дополнительно пишется `property_types` (массив), а в
  `property_type` кладётся только ПЕРВЫЙ выбранный тип;
- `parking_types` (plural) — вместо канонического `parking_type`, который
  читает `buildWhereSql`.

Последствия (наблюдались в проде/dev каждые 5 минут, TASK-253):

- `buildWhereSql` проверяет `query.property_type.length > 0` (у строки
  `.length` тоже истинно) и зовёт `Prisma.join(строка)` →
  `TypeError: r.reduce is not a function`; алерты по таким поискам не
  отправляются вовсе, watermark `last_checked_at` не двигается (ошибка до
  транзакции);
- фильтр парковки в матчере молча игнорировался (ключ `parking_types` никем
  не читается).

## Decision

Нормализовать legacy-формы **на границе воркера** — в
`SavedSearchAlertService.extractFilters` (единственная точка входа сырого
`filters_json` в SQL-слой), а не размазывать толерантность по `buildWhereSql`:

- `property_types` / `parking_types` (plural, массив) → канонический ключ
  `property_type` / `parking_type`; plural-ключ удаляется, приоритет у
  массива (legacy-скаляр содержит только первый выбор);
- одиночные `property_type` / `parking_type` (скаляр) → обёртка в массив;
- `amenities` / `listing_source` (скаляр) → обёртка в массив (защита).

`buildWhereSql` остаётся строгим к форме (кроме уже принятого исключения для
`rooms: number | number[]`, ADR-0133): HTTP-путь гарантирует форму DTO-слоем,
raw-путь — этой нормализацией.

## Consequences

Positive:

- Воркер алертов снова рабочий для поисков с типом недвижимости; watermark
  двигается, письма/уведомления отправляются.
- Фильтр парковки из сохранённых поисков начинает применяться матчером.
- Одна точка нормализации: новые legacy-расхождения клиентских ключей чинятся
  в `extractFilters`, SQL-слой не трогается.

Negative / trade-offs:

- Дублирование знания о канонических именах ключей между клиентом
  (`buildFilters`) и воркером; целевое решение — писать канонический формат
  на клиенте и/или мигрировать старые `filters_json` (не делалось: объём
  строк мал, нормализация покрывает оба формата).

## Related files

- apps/api/src/saved-searches/saved-search-alert.service.ts
- apps/api/src/saved-searches/saved-search-alert.service.spec.ts

## Related task

- TASK-253
