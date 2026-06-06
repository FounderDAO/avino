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

## Обновление (ADMIN-08, 2026-06-06)

Первая фича-задача (очередь модерации) выполнила обещанную live-сверку DTO против
`apps/api`. `AdminListingRow` приведён к реальной форме `AdminListingListItem`
(`apps/api/src/moderation`): список — компактная карточка, поэтому добавлены
`title`/`original_language`/`published_at`, `city_id` стал nullable, а полей
`area`/`rooms`/`promotion_type`/`promotion_expires_at` в списке нет (они есть
только в `ListingDetail`, §7). Остальные DTO базы пока не трогались — они
сверяются при реализации своих фич (ADMIN-09..15). Решение хранить общие DTO в
одном месте подтвердило себя: правка формы — в одном файле.

## Обновление (ADMIN-09, 2026-06-06)

Карточка модерации (`/admin/listings/[id]`) добавила в `adminListingsApi` три
эндпоинта поверх той же базы: `getAdminListing` (`GET /listings/:id` —
MODERATOR/ADMIN видят непубличные статусы через публичный роут с
`OptionalJwtAuthGuard`), `listingModerationLogs` (`GET /admin/listings/:id/
moderation-logs`) и мутацию `moderateListing` (`PATCH /admin/listings/:id/status`).
Мутация инвалидирует тег `Admin`, поэтому карточка, история и очередь (ADMIN-08)
перечитываются после действия — единая coarse-grained схема тегов оправдала себя.

**Live-сверка DTO (обещание базы) против запущенного стека:**
- `ListingDetail` приведён к реальной форме `ListingDetailResponse`
  (`apps/api/src/listings`): `area` и `city_id` стали nullable, а спекулятивного
  `features: ListingFeature[]` из чернового типа ADMIN-07 в detail-ответе **нет**
  (бэкенд отдаёт только `features_text`) — поле и неиспользуемый интерфейс
  `ListingFeature` удалены.
- Добавлены `ModerateListingRequest`/`ModerationResult` и `ListingModerationLogEntry`.
  Per-listing лог-ответ **без `listing_id`** (в отличие от глобального
  `ModerationLog`, §16) — подтверждено live: ключи `action/old_status/new_status/
  moderator_id/reason/created_at`.

Гейтинг переходов вынесен в `lib/moderation.ts` зеркалом бэкенда
(`MODERATABLE_STATUSES`+`ACTION_TO_STATUS`): недопустимые действия задизейблены в
UI, `422 INVALID_STATUS_TRANSITION` обрабатывается как fallback. Прогон live:
`NEW → SEND_TO_DRAFT` → `{id,status:DRAFT,published_at:null}`, история обновилась,
повтор того же действия → `INVALID_STATUS_TRANSITION`.

## Обновление (ADMIN-10, 2026-06-06)

Страница жалоб (`/admin/complaints`) добавила в `adminApi` отдельный слайс
`adminComplaintsApi` поверх той же базы: `listAdminComplaints`
(`GET /admin/complaints?status&listing_id&page&limit`) и мутацию
`updateComplaintStatus` (`PATCH /admin/complaints/:id` `{ status }`). Мутация
инвалидирует тег `Admin` → список перечитывается после обработки жалобы (та же
coarse-grained схема тегов). Гейтинг переходов вынесен в `lib/complaints.ts`, но,
в отличие от модерации листингов, контракт **не накладывает ограничений переходов**
жалоб (в каталоге ошибок §17 нет complaint-specific transition-кода) — допустим
любой статус, кроме текущего (no-op гейтится в UI). DTO `Complaint`/`ComplaintStatus`
/`ComplaintFilters` использованы как есть из базы ADMIN-07.

**Live-сверка DTO НЕ выполнена — намеренно.** В отличие от ADMIN-08/09, бэкенд
жалоб **не реализован**: нет модели `Complaint` в `apps/api/prisma/schema.prisma`,
нет миграции/модуля; `apps/api/src/admin/admin.module.ts` помечает complaints как
future-флоу. Эндпоинты есть только в `docs/API.md §16` и `docs/DB_SCHEMA.md`. По
решению Team Lead веб-страница мёрджится contract-only (по образцу базы ADMIN-07:
типы по докам, live-verify отложен), а бэкенд заведён отдельной задачей
**`TASK-132 — Complaints backend`** (`docs/TASKS.md`). Полный E2E ADMIN-10 и
live-сверка `Complaint` — после TASK-132.

## Обновление (ADMIN-11, 2026-06-06)

Страницы пользователей (`/admin/users`, `/admin/users/[id]`) добавили в `adminApi`
слайс `adminUsersApi` поверх той же базы: `listAdminUsers`
(`GET /admin/users?status&role&q&page&limit`), `getAdminUser`
(`GET /admin/users/:id`) и `listRoles` (`GET /roles` — источник опций фильтра по
роли). Все три помечены тегом `Admin`, поэтому ADMIN-12 (смена статуса /
управление ролями) сможет инвалидировать список и карточку после мутаций. Этот PR
— **read-only**; мутации (`PATCH /admin/users/:id`, `POST|DELETE .../roles`) —
ADMIN-12. RU-подписи/badge статусов и подписи ролей/языков вынесены в
`lib/users.ts`.

**Live-сверка DTO выполнена** (как ADMIN-08/09, в отличие от отложенной ADMIN-10):
спекулятивные типы ADMIN-07 приведены 1:1 к живому контракту (`apps/api/src/admin`,
`apps/api/src/roles`, `apps/api/src/profiles`):
- `AdminUserRow` — добавлены `is_phone_verified`, `is_email_verified`,
  `last_login_at` (бэкенд-`AdminUserListItem` богаче исходного черновика);
- `AdminUserDetail` теперь `extends AdminUserRow` + `deleted_at` и **nullable**
  `profile` (профиль может быть не заполнен), `updated_at` — non-null;
- `AdminUserProfile.preferred_language` стал nullable (зеркало `ProfileResponse`);
- `RoleDict` потерял `id` — `GET /roles` (`RoleResponse`) отдаёт только
  `{ code, description }`.

Проверено against стека (docker compose) с ADMIN-OTP токеном: формы строки/карточки/
справочника совпали 1:1; фильтры `status`/`role`/`q` работают (`role=ADMIN`→1,
`q=e2e`→1, `status=BLOCKED`→0); невалидный `status` → `400`, без токена → `401`,
битый uuid → `400`.

## Related files

- apps/web/src/store/api/pagination.ts
- apps/web/src/store/api/adminTypes.ts
- apps/web/src/store/api/adminApi.ts
- apps/web/src/store/api/adminListingsApi.ts
- apps/web/src/store/api/adminComplaintsApi.ts
- apps/web/src/store/api/adminUsersApi.ts
- apps/web/src/lib/table.ts
- apps/web/src/lib/moderation.ts
- apps/web/src/lib/complaints.ts
- apps/web/src/lib/users.ts
- apps/web/src/app/(admin)/admin/listings/[id]/page.tsx
- apps/web/src/app/(admin)/admin/complaints/page.tsx
- apps/web/src/app/(admin)/admin/users/page.tsx
- apps/web/src/app/(admin)/admin/users/[id]/page.tsx

## Related task

- ADMIN-07 / ADMIN-08 / ADMIN-09 / ADMIN-10 / ADMIN-11 (docs/TASK_ADMIN_PANEL.md)
- TASK-132 (complaints backend, docs/TASKS.md) — разблокирует ADMIN-10 E2E
