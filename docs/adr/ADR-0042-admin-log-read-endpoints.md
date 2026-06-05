# ADR-0042 — Admin read-only log endpoints & dedicated audit module

## Status

Accepted

## Date

2026-06-06

## Context

TASK-131 (milestone M13 — admin panel backend) открывает админу четыре
read-only журнала (API.md §16, acceptance):

- `GET /api/v1/admin/audit-logs` — security audit-лог (`audit_logs`, ADR-004);
- `GET /api/v1/admin/moderation-logs` — глобальный журнал модерации
  (`moderation_logs`, TASK-053);
- `GET /api/v1/admin/promotion-logs` — журнал админских действий над промо
  (`promotion_logs`, TASK-121/122);
- `GET /api/v1/admin/notification-logs` — журнал уведомлений (`notifications`,
  TASK-100..102/111/121).

Это application-слой поверх существующих таблиц — **новых миграций нет**. Зависит
от TASK-044 (RBAC-guards `JwtAuthGuard`/`RolesGuard`/`@Roles`, ADR-0011) и от
доменных таблиц TASK-038/053/121/100.

Ключевое расхождение моделей: три журнала (`moderation_logs`/`promotion_logs`/
`notifications`) принадлежат конкретным доменам, а `audit_logs` — кросс-доменный:
строки в него пишут разные модули (admin-users → `ADMIN_USER_UPDATE`/
`ROLE_CHANGE`, moderation → `LISTING_STATUS_CHANGE`, promotions →
`LISTING_PROMOTION_CHANGE`). Ни один домен им не владеет.

Карточка задачи (`files expected`) называет и `apps/api/src/admin/`, и
`apps/api/src/audit/`; API.md §16 ранее документировал только `audit-logs`. По
ADR-0036 **API.md авторитетен по маршрутам** — три недостающих эндпоинта
зафиксированы в §16 в рамках этой же задачи.

## Decision

1. **Один контроллер, ADMIN-only.** `AdminLogsController`
   (`@Controller({ path: 'admin', version: '1' })`, `JwtAuthGuard` + `RolesGuard`
   + `@Roles(ADMIN)` на классе) отдаёт все четыре `*-logs` под `/api/v1/admin/`.
   В отличие от очереди модерации (MODERATOR/ADMIN), логи — **только ADMIN**: это
   security/audit-поверхность (как `audit-logs` в API.md §16).

2. **`audit_logs` выделен в отдельный `AuditModule`/`AuditService`.** Таблица
   кросс-доменная, поэтому её read-side не привязан к домену; модуль экспортирует
   `AuditService`, который инжектится в `AdminLogsController`. Это также готовит
   место под будущий вынос write-side аудита (сейчас модули пишут
   `prisma.auditLog.create` инлайн). HTTP-слой остаётся в `AdminModule` рядом с
   прочими админ-роутами.

3. **Три доменных журнала — в `AdminLogsService` (admin-модуль).** По образцу
   `AdminUsersService`/`ModerationService` (admin-контроллер ↔ feature-сервис,
   ADR-0040/0041): сервис живёт в `admin/`, читает таблицы напрямую через
   `PrismaService` (глобален, PrismaModule `@Global`) и переиспользует
   `PaginatedResponse` из moderation.

4. **Глобальные срезы, не per-listing.** Новый `moderation-logs` отдаёт журнал по
   всем объявлениям — в отличие от per-listing
   `GET /admin/listings/:id/moderation-logs` (TASK-053), который остаётся.

5. **Единый паттерн пагинации/сортировки/фильтров.** Везде `limit` default 20 /
   max 100, page 1-based, обязательный `meta.total` (API.md §4); сортировка
   `created_at DESC, id DESC` (детерминированный хвост при равных таймстемпах);
   все фильтры опциональны и комбинируются через AND. Фильтры по ключам:
   audit — `action`/`actor_id`/`entity_type`/`entity_id`; moderation —
   `listing_id`/`moderator_id`/`action`; promotion —
   `listing_id`/`admin_id`/`action`; notification —
   `user_id`/`type`/`channel`/`status`.

6. **snake_case-контракт, nullable как null.** Ответы повторяют поля таблиц в
   snake_case; nullable-колонки (actor/moderator/admin, old/new значения,
   `read_at`/`sent_at`, `metadata`/`data_json`) отдаются как `null`. `metadata`
   и `data_json` — произвольный JSON, отдаётся как есть (тип `unknown`, как в
   `NotificationsService`).

## Consequences

Positive:

- Полный набор админ-журналов поверх существующих таблиц — без миграций;
  переиспользует RBAC-guards и `PaginatedResponse`.
- `audit_logs` получил явного владельца чтения (`AuditModule`), не привязанного к
  домену; место под будущий общий write-side аудита подготовлено.
- Единый паттерн (пагинация/сортировка/AND-фильтры/snake_case) согласован с
  admin-users и модерацией; API.md §16 теперь авторитетно описывает все четыре
  эндпоинта.
- ADMIN-only доступ ко всем логам выполняет acceptance «only admin can access».

Negative / trade-offs:

- `AdminLogsController` зависит от двух сервисов (`AdminLogsService` +
  `AuditService`) — небольшое смешение, принято ради владения `audit_logs`
  отдельным модулем.
- `AuditModule` пока содержит только read-метод (одна функция) — выглядит тонким;
  оправдан кросс-доменной природой таблицы и заделом под write-side.
- Курсорной пагинации нет (offset/limit) — для админ-журналов с ростом объёма
  глубокие страницы дороги; пересмотр (keyset) — при необходимости отдельной
  задачей.
- Покрытие — юнит-тесты (Prisma мокается), как у остальных сервисов; live-
  PostgreSQL int-spec для логов не добавлялся.

## Related files

- apps/api/src/audit/audit.service.ts
- apps/api/src/audit/audit.service.spec.ts
- apps/api/src/audit/audit.module.ts
- apps/api/src/audit/index.ts
- apps/api/src/audit/dto/list-audit-logs.dto.ts
- apps/api/src/admin/admin-logs.controller.ts
- apps/api/src/admin/admin-logs.service.ts
- apps/api/src/admin/admin-logs.service.spec.ts
- apps/api/src/admin/dto/list-moderation-logs.dto.ts
- apps/api/src/admin/dto/list-promotion-logs.dto.ts
- apps/api/src/admin/dto/list-notification-logs.dto.ts
- apps/api/src/admin/admin.module.ts
- docs/API.md (§16)

## Related task

- TASK-131

## Related ADR

- ADR-0011 (RBAC — guards `JwtAuthGuard`/`RolesGuard`, роли как словарь)
- ADR-0036 (API.md-авторитетность маршрутов)
- ADR-0040 (admin-контроллер ↔ feature-сервис, переиспользование `PaginatedResponse`)
- ADR-0041 (admin users & RBAC — admin-модуль, паттерн пагинации/snake_case)
- ADR-0004 (audit_logs — security аудит-журнал)
