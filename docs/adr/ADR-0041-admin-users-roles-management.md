# ADR-0041 — Admin users & RBAC role management with audited mutations

## Status

Accepted

## Date

2026-06-06

## Context

TASK-130 (milestone M13 — admin panel backend) добавляет первый блок админ-
управления пользователями. API.md §6 / DB_SCHEMA.md §3–4 / ARCHITECTURE §RBAC:

- `GET /api/v1/admin/users` — пагинированный список (фильтры `status`, `role`,
  `q`, `page`, `limit`);
- `GET /api/v1/admin/users/:id` — карточка пользователя;
- `PATCH /api/v1/admin/users/:id` — смена `status` (`ACTIVE | BLOCKED | DELETED`);
- `POST /api/v1/admin/users/:id/roles` — назначить роль;
- `DELETE /api/v1/admin/users/:id/roles/:role` — снять роль → `204`;
- `GET /api/v1/roles` — справочник ролей.

Это application-слой поверх существующей схемы (`User`/`UserRole`/`Role`/
`AuditLog`, TASK-030/044) — **новых миграций нет**. Зависит от TASK-044 (RBAC-
guards: `JwtAuthGuard`/`RolesGuard`/`@Roles`, ADR-0011) и TASK-040
(`/users/me`-контракт и `toProfileResponse`, переиспользуются для snake_case
ответа).

Расхождение карточки и контракта: `docs/TASKS.md` (TASK-130) формулирует только
`PATCH /admin/users/:id/roles`, но **API.md авторитетен по маршрутам** (как
зафиксировано в ADR-0036/0040). Управление ролями берём из API.md §6 — отдельные
`POST` (назначить) и `DELETE …/:role` (снять), а не `PATCH`.

## Decision

1. **Два контроллера, два слоя доступа.** `AdminUsersController`
   (`@Controller({ path: 'admin/users', version: '1' })`, `JwtAuthGuard` +
   `RolesGuard` + `@Roles(ADMIN)` на классе) — все мутации только ADMIN.
   `RolesController` (`GET /api/v1/roles`) — `@Roles(MODERATOR, ADMIN)`: справочник
   нужен и модератору для UI/фильтров. `:id` валидируется `ParseUUIDPipe`;
   `:role` — `ParseEnumPipe(UserRole)` (невалидный код → `400` до сервиса).

2. **Бизнес-логика пользователей — в `AdminUsersService` (admin-модуль).** По
   образцу `ModerationService` (admin-контроллер ↔ feature-сервис): сервис живёт
   в `admin/`, переиспользует `PaginatedResponse` из moderation и
   `toProfileResponse` из profiles. `PrismaService` глобален (PrismaModule
   `@Global`), отдельный импорт не нужен.

3. **Справочник ролей — `RolesService` в `RolesModule`.** `roles` — сидируемый
   словарь, а не enum (ADR-0011): `RolesService.listRoles()` читает таблицу
   (`orderBy code asc`). `RolesModule` (RBAC-инфраструктура) теперь дополнительно
   обслуживает `GET /api/v1/roles` — словарь логически принадлежит ему; контроллер
   регистрируется один раз, несмотря на то что модуль импортируется многими
   feature-модулями.

4. **Снэпшот-контракт snake_case.** Список (`AdminUserListItem`) повторяет
   базовые поля `/users/me` (id/phone/email/status/default_language/
   is_*_verified/roles) + `created_at`/`last_login_at`, **без** профиля. Карточка
   (`AdminUserDetail`) добавляет `updated_at`/`deleted_at`/`profile`. Админ видит
   всё: список по умолчанию (без `status`) возвращает любые статусы, включая
   `DELETED` (как админ-список объявлений в модерации) — в отличие от self-/
   публичных путей, скрывающих `DELETED`.

5. **Поиск `q` и фильтры комбинируются через AND.** `status` → `where.status`;
   `role` → `where.roles.some.role.code`; `q` → `OR` по `phone`/`email`/
   `profile.{firstName,lastName,displayName}` (`contains`, `insensitive`).
   Сортировка `created_at DESC, id DESC` (детерминированный хвост). `limit`
   default 20 / max 100, page 1-based, обязательный `meta.total` (API.md §4).

6. **Смена статуса атомарна и аудируется.** В одной `prisma.$transaction`:
   `users.status` + запись `audit_logs(ADMIN_USER_UPDATE)` (`metadata`:
   `{ old_status, new_status, reason }`, `actorId = adminId`). Инвариант
   «`DELETED` ⇒ `deleted_at` установлен» (ADR-0013): при переводе в `DELETED`
   ставится `deleted_at = now()`, при любом другом статусе — `deleted_at = null`.
   Освобождение контакта (phone/email) для повторного использования здесь **не**
   делается — это отдельный self-delete flow (ADR-0013); admin-delete пока только
   меняет статус и таймстемп.

7. **Назначение/снятие роли атомарно и аудируется.** Порядок проверок: нет
   пользователя → `404 NOT_FOUND`; неизвестная роль (нет строки в `roles`, напр.
   `GUEST` — не сидируется, ADR-0011) → `400 VALIDATION_ERROR`. `POST`: дубль →
   `409 ROLE_ALREADY_GRANTED`; иначе в `$transaction` создаётся `user_roles`
   (`granted_by = adminId`) + `audit_logs(ROLE_CHANGE, { role, op: 'grant' })`,
   возвращается обновлённая карточка. `DELETE`: роль не назначена →
   `404 NOT_FOUND`; иначе удаление `user_roles` + `audit_logs(ROLE_CHANGE,
   { role, op: 'revoke' })` → `204`.

## Consequences

Positive:

- Полный admin-CRUD пользователей + управление ролями поверх существующей схемы —
  без миграций; переиспользует RBAC-guards, `PaginatedResponse` и
  `toProfileResponse`.
- Все мутации оставляют аудит-след (`ADMIN_USER_UPDATE`/`ROLE_CHANGE`) в той же
  транзакции, что и изменение — частичных состояний нет, acceptance «role changes
  are audited» выполнен на уровне БД.
- Маршруты ролей (`POST`/`DELETE`) и инвариант `DELETED ⇒ deleted_at` согласованы
  с API.md и ADR-0013; авторитетность API.md над карточкой задачи сохранена.
- `GET /api/v1/roles` отдаёт словарь админ-UI без хардкода на фронте.

Negative / trade-offs:

- admin-delete не освобождает контакт (phone/email) — пользователь в `DELETED`
  всё ещё «держит» свой номер/почту; полное освобождение остаётся за self-delete
  flow (ADR-0013). Пересмотр — если продукту понадобится admin-инициированное
  освобождение.
- Нет защиты «нельзя снять последнюю/собственную ADMIN-роль» — для foundation
  опущено; правило добавляется при необходимости отдельной задачей.
- `RolesModule` (инфраструктурный, импортируется почти везде) теперь содержит и
  feature-контроллер словаря ролей — небольшое смешение ответственностей, принято
  ради логической принадлежности словаря RBAC-слою.
- Покрытие — юнит-тесты (Prisma мокается), как у остальных сервисов; отдельный
  live-PostgreSQL int-spec для admin/users не добавлялся.

## Related files

- apps/api/src/admin/admin-users.controller.ts
- apps/api/src/admin/admin-users.service.ts
- apps/api/src/admin/admin-users.service.spec.ts
- apps/api/src/admin/admin.module.ts
- apps/api/src/admin/dto/list-admin-users.dto.ts
- apps/api/src/admin/dto/update-admin-user.dto.ts
- apps/api/src/admin/dto/assign-role.dto.ts
- apps/api/src/roles/roles.controller.ts
- apps/api/src/roles/roles.service.ts
- apps/api/src/roles/roles.service.spec.ts
- apps/api/src/roles/roles.module.ts
- apps/api/src/roles/index.ts
- docs/API.md (§6)

## Related task

- TASK-130

## Related ADR

- ADR-0011 (RBAC — роли как сидируемый словарь, guards `JwtAuthGuard`/`RolesGuard`)
- ADR-0013 (user soft-delete — инвариант `DELETED ⇒ deleted_at`, освобождение контакта)
- ADR-0036 (API.md-авторитетность маршрутов; `POST` для действий)
- ADR-0040 (admin-контроллер ↔ feature-сервис, переиспользование `PaginatedResponse`)
- ADR-0007 (unified error envelope — `NOT_FOUND`/`VALIDATION_ERROR`/`ROLE_ALREADY_GRANTED`)
