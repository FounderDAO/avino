# ADR-0017 — Users & profile self-service endpoints

## Status

Accepted

## Date

2026-06-04

## Context

TASK-040 вводит первый защищённый feature-модуль поверх auth/RBAC-слоя
(TASK-041–044). `API.md` §5 требует self-service эндпоинты собственного аккаунта:
`GET /api/v1/users/me`, `PATCH /api/v1/users/me`, `PATCH /api/v1/users/me/profile`.
Схема уже есть (TASK-033): `User` 1:1 `UserProfile` (`user_profiles.user_id
@unique`), а уникальность контакта ограничена non-DELETED аккаунтами через partial
unique индексы (ADR-013). OTP-логин создаёт минимального пользователя без профиля
(ADR-0010), поэтому профиль может отсутствовать на момент первого обновления.

Реализация должна:

1. читать «свежие» роли/профиль из БД (а не только из payload токена), оставаясь
   в едином snake_case-контракте (тот же `user`-блок, что в ответе verify, ADR-0014);
2. адресовать только собственную запись пользователя — без `:id` в путях
   (источник — `sub` access-токена через `@CurrentUser('id')`);
3. соблюдать PATCH-семантику (обновлять только переданное подмножество);
4. не вводить контактных flow, под которые нет инфраструктуры.

## Decision

1. **`UsersModule`** (`apps/api/src/users/`) — `UsersController` под
   `@UseGuards(JwtAuthGuard)` (Auth: Bearer, API.md §5). Guard и `JwtModule`
   приходят импортом `RolesModule` (ADR-0016); Prisma — глобальный модуль.
2. **`GET /users/me`** → `UsersService.getMe`: `findFirst` с
   `status != DELETED` + `include` ролей и профиля; маппинг в `UserMeResponse`
   (`roles: string[]`, вложенный `profile` или `null`). Это каноничный ответ
   `auth/me` (API.md §3) — отдельный `GET /auth/me` не дублируется.
3. **`PATCH /users/me`** → `UsersService.updateMe`: в foundation поддержаны
   `email` и `default_language`. Смена `email` (только при реальном изменении
   значения) сбрасывает `is_email_verified=false` (нужен re-verify) и проверяет
   уникальность среди non-DELETED аккаунтов → `409 CONTACT_TAKEN` (ADR-013).
4. **`PATCH /users/me/profile`** → `ProfilesService.updateForUser`: `upsert` по
   `userId` — профиль создаётся при первом обновлении («created if missing»).
   `undefined`-поля Prisma игнорирует, поэтому PATCH не затирает непереданные.
5. **`ProfilesService`** вынесен в `apps/api/src/profiles/` (concern профиля
   отделён от core-user, как предполагает карточка задачи), но провайдится
   `UsersModule` — `/users/me/profile` обслуживает тот же контроллер.
6. **Гранулы контракта**: DTO повторяют snake_case ключи API
   (`default_language`, `first_name`, …); `forbidNonWhitelisted` (ADR-0007)
   отклоняет неизвестные поля. Отсутствующий/DELETED аккаунт по валидному токену →
   `401 UNAUTHORIZED` (а не 404): токен относится к более не существующему субъекту.

### Намеренно вне scope (foundation)

- **Смена `phone`** через `PATCH /users/me`: для неё нужен OTP verify-flow смены
  контакта, а `OtpPurpose` пока только `LOGIN`. Поле не входит в DTO →
  отклоняется валидацией. Будущая задача.
- **`DELETE /users/me`** (soft-delete, API.md §5): не входит в acceptance-критерии
  TASK-040; реализуется отдельно, чтобы PR решал одну задачу (CLAUDE.md §5).

## Consequences

Positive:

- Первый защищённый feature-модуль задаёт шаблон (guard + `@CurrentUser` + Prisma
  + snake_case-маппинг) для listings/chat/admin.
- `/me`-ответ переиспользует контракт `verify` — клиенты (web RTK Query, Flutter)
  видят одинаковую форму пользователя.
- Профиль самосоздаётся — клиенту не нужен отдельный «create profile» шаг.

Negative / trade-offs:

- `email`-uniqueness проверяется отдельным запросом перед `update` (TOCTOU-окно);
  финальную гарантию даёт partial unique индекс БД (ADR-013) — при гонке `update`
  упадёт на constraint. Для MVP приемлемо.
- `getMe` читает БД на каждый вызов (не кэшируется) — осознанно, ради свежих
  ролей/профиля; кэш — при необходимости позже.

## Related files

- apps/api/src/users/users.module.ts
- apps/api/src/users/users.controller.ts
- apps/api/src/users/users.service.ts
- apps/api/src/users/dto/update-user.dto.ts
- apps/api/src/users/users.service.spec.ts
- apps/api/src/profiles/profiles.service.ts
- apps/api/src/profiles/dto/update-profile.dto.ts
- apps/api/src/profiles/index.ts
- apps/api/src/profiles/profiles.service.spec.ts
- apps/api/src/app.module.ts

## Related task

- TASK-040
