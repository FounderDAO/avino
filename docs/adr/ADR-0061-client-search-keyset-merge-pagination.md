# ADR-0061 — Поиск листингов на портале: keyset-merge пагинация (apps/client)

## Status

Accepted

## Date

2026-06-08

## Context

`apps/client` (публичный портал) получил RTK Query-фундамент в TASK-141
(ADR-0058). TASK-151 добавляет первую бизнес-страницу — поиск объявлений
(`/sale`, `/rent`). Контракт `GET /api/v1/search` (API.md §9):

- возвращает **только** `status = ACTIVE`;
- по умолчанию сортирует `VIP > TOP > NORMAL → created_at DESC → id DESC`
  (`sort=promotion_priority_desc`, ADR-006/007);
- пагинация — **keyset** (`cursor` → `meta.next_cursor`, `null` на конце),
  envelope `{ data, meta }`.

Нужен паттерн пагинации, который при «Показать ещё» дозагружает страницы в один
список, но при смене фильтров/сортировки начинает заново — без дублей и без
гонок кэша. Этот же паттерн позже переиспользуют favorites, saved searches,
карта (TASK-152/155).

## Decision

`searchApi` (`store/api/searchApi.ts`) инъектируется в общий `baseApi`
(CLAUDE.md §4) и реализует keyset-аккумуляцию средствами RTK Query:

- `serializeQueryArgs` исключает `cursor` и `limit` из кэш-ключа — все страницы
  одного набора фильтров живут в одной записи кэша;
- `merge`: при отсутствии `cursor` (первая страница / смена фильтров) данные
  заменяются, при наличии — дозагружаются (`push`);
- `forceRefetch` срабатывает при изменении `cursor`;
- `sort` по умолчанию `promotion_priority_desc`, `limit` зажимается в [1, 100]
  (`clampLimit`), пустые фильтры отбрасываются (`toQueryParams`).

`SearchPage` владеет применёнными фильтрами, сортировкой и курсором; смена
фильтров/сортировки сбрасывает курсор. `transaction_type` фиксируется маршрутом
(`/sale` → SALE, `/rent` → RENT). Подписи/enum — из `@avino/shared` (без
хардкода кодов). Общие типы пагинации вынесены в `store/api/pagination.ts`
(зеркало `apps/web`).

## Consequences

Positive:
- Бесшовная дозагрузка («Показать ещё») без дублей и без отдельных кэш-записей
  на страницу; переиспользуемый паттерн для favorites/saved-searches/map.
- Promotion-priority сортировка по умолчанию соответствует контракту.
- Доступ к API только через RTK Query и versioned `/api/v1`.

Negative / trade-offs:
- `merge`-аккумуляция держит весь список в памяти кэша до сброса фильтров —
  приемлемо для страничной выдачи MVP.
- `thumbnail_url` рендерится через `<img>` (а не `next/image`), чтобы не
  завязываться на `remotePatterns` для произвольного CDN-хоста.

## Related files

- apps/client/src/store/api/searchApi.ts
- apps/client/src/store/api/pagination.ts
- apps/client/src/features/search/SearchPage.tsx
- apps/client/src/features/search/FilterBar.tsx
- apps/client/src/features/search/SearchResults.tsx
- apps/client/src/features/search/PropertyCard.tsx
- apps/client/src/features/search/format.ts
- apps/client/src/app/sale/page.tsx
- apps/client/src/app/rent/page.tsx

## Related task

- TASK-151
