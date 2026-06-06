# ADR-0050 — Web adminApi base + shared admin types & pagination

## Status

Accepted

## Date

2026-06-06

## Context

Веб-админка (`apps/web`) реализуется серией задач ADMIN-08..15 (очередь
модерации, карточка листинга, жалобы, пользователи, роли, промо, логи). Все они
ходят в одни и те же админ-эндпоинты (`docs/API.md` §6/§7/§15/§16) через RTK
Query (CLAUDE.md §4, ADR-0043/0045) и оперируют одними и теми же snake_case DTO и
enum-значениями (`docs/DB_SCHEMA.md` §3 — значения являются частью контракта).

Если каждую задачу типизировать локально, неизбежны: дубли DTO/enum, расхождения
форм ответов, повторная реализация пагинации и сборки query-параметров. Нужна
единая база: точка инъекции RTK Query эндпоинтов админки, переиспользуемые типы и
хелперы пагинации — до того как фичевые задачи начнут их потреблять.

Дополнительная сложность: API использует **два режима пагинации** в одном
envelope (§4) — page-based (`page`+`limit`, `meta.total`; админ-списки) и
keyset/cursor (`cursor`→`meta.next_cursor`; публичный поиск). Тип-обёртка должна
обслуживать оба, не плодя параллельных контрактов.

## Decision

Ввести базовый слой админ-API из четырёх модулей (без бизнес-эндпоинтов — их
добавляют ADMIN-08..15):

1. **`store/api/pagination.ts`** — единый `Paginated<T> = { data, meta }` с
   `PageMeta`, где cursor- и page-поля опциональны, так что один тип покрывает
   оба режима §4. Хелперы: `toQueryParams()` (отбрасывает `undefined`/`null`/
   пустые строки перед отправкой фильтров — forward-compatible §4),
   `clampLimit()` (зажим в `[1,100]`), `totalPages()`. Константы
   `DEFAULT_PAGE/DEFAULT_LIMIT/MAX_LIMIT`.

2. **`store/api/adminTypes.ts`** — enum-юнионы (зеркало DB_SCHEMA §3:
   `ListingStatus`, `PropertyType`, `TransactionType`, `PromotionType/Status`,
   `PaymentStatus`, `ModerationAction`, `PromotionAdminAction`, `ComplaintStatus`,
   `Notification*`, `RoleCode`, …), snake_case DTO (`AdminListingRow`,
   `ListingDetail`, `AdminUserRow/Detail`, `RoleDict`, `ListingPromotion`,
   `Complaint`, `AuditLog`, `ModerationLog`, `PromotionLog`, `NotificationLog`) и
   per-list фильтр-типы, наследующие `PageParams`. `Language`/`UserStatus`
   импортируются из `authApi` (единый источник, без дублей).

3. **`store/api/adminApi.ts`** — `adminApi = baseApi.injectEndpoints({ endpoints:
   () => ({}) })`: точка инъекции, в которую фичевые задачи добавляют эндпоинты
   (`adminApi.injectEndpoints(...)`, тег кэша `Admin` уже в `baseApi.tagTypes`).
   Реэкспортит `pagination`+`adminTypes` как единый импорт-сурфейс. В файле —
   шаблон добавления эндпоинта.

4. **`lib/table.ts`** — структурные UI-примитивы таблиц: `Column<Row>`,
   `SelectOption<T>`, `PaginationState`, `SortDirection`, хелперы
   `optionsFromLabels()`, `hasNextPage()`. Без стилей — контракт данных между
   страницами и TailAdmin-таблицами.

Бизнес-эндпоинты в этой задаче не реализуются (это scope ADMIN-08..15): база
проверяется gates `lint`+`build` (type-check), формы ответов фиксируются по
API.md и сверяются live при реализации соответствующих фич.

## Consequences

Positive:
- Один источник DTO/enum/пагинации → нет расхождений между страницами админки.
- `Paginated<T>` обслуживает оба режима §4 без дублирования контрактов.
- `toQueryParams()` централизует сборку фильтров; компоненты не делают `fetch`
  и не клеят query-строки вручную.
- Фичевым задачам остаётся только описать `query`/`invalidatesTags` — типы готовы.

Negative / trade-offs:
- `adminApi` с пустыми `endpoints` на момент базы — намеренно, наполняется далее.
- DTO зафиксированы по докам и **не прогнаны live против `apps/api`** в этой
  сессии (база не вызывает сеть); расхождение формы вскроется и поправится в
  ADMIN-08..15 при первом реальном запросе.
- `lib/table.ts` фиксирует структуру таблиц до появления самих таблиц — при
  необходимости уточняется в ADMIN-08.

## Related files

- apps/web/src/store/api/pagination.ts
- apps/web/src/store/api/adminTypes.ts
- apps/web/src/store/api/adminApi.ts
- apps/web/src/lib/table.ts

## Related task

- ADMIN-07 (docs/TASK_ADMIN_PANEL.md)
