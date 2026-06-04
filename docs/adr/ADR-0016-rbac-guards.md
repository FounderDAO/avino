# ADR-0016 — RBAC guards and decorators

## Status

Accepted

## Date

2026-06-04

## Context

TASK-044 вводит слой авторизации поверх auth-flow (TASK-041–043). `API.md` §3/§6
требует Bearer-аутентификацию на защищённых эндпоинтах (`401 UNAUTHORIZED`) и
проверку прав по ролям (`403 FORBIDDEN`, RBAC — ADR-0009 / CLAUDE.md §9).
Access-токен уже несёт `sub`+`roles` (TASK-042, ADR-0014), а контроллер `logout`
явно отложил Bearer-guard до этой задачи.

Реализация должна:

1. оставаться **клиент-нейтральной** (web RTK Query + будущий Flutter, CLAUDE.md
   §3) и отдавать ошибки в едином error-envelope (ADR-0007);
2. не плодить зависимостей — в стеке уже есть `@nestjs/jwt`, а `@nestjs/passport`
   не используется;
3. не ходить в БД на каждый запрос — роли берутся из подписанного access-токена
   (источник истины на время его жизни; «свежие» роли пере-вшиваются при ротации,
   TASK-043);
4. защищать **точечно** — большинство эндпоинтов MVP публичны (OTP-логин,
   refresh, публичные листинги), поэтому глобальный guard не подходит.

## Decision

1. **`JwtAuthGuard`** (`common/guards/jwt-auth.guard.ts`) — извлекает
   `Authorization: Bearer <token>` (схема case-insensitive), проверяет подпись
   `JWT_ACCESS_SECRET` (per-call секрет, как при выпуске — ADR-0010) и кладёт
   `{ id, roles }` в `request.user`. Маппинг ошибок на стабильные коды (API.md
   §17): нет/не-Bearer → `UNAUTHORIZED`, `TokenExpiredError` → `TOKEN_EXPIRED`,
   иначе → `TOKEN_INVALID`; все — `401` через `HttpException` с payload `{code,
   message}`, который подхватывает `AllExceptionsFilter`.
2. **`RolesGuard`** (`common/guards/roles.guard.ts`) — читает требуемые роли из
   метаданных `@Roles(...)` через `Reflector.getAllAndOverride` (хендлер
   переопределяет класс). Без метаданных → нужна только аутентификация. Семантика
   **OR**: достаточно одной из перечисленных ролей; иначе `403 FORBIDDEN`. Нет
   `request.user` (guard не подключён) → `401 UNAUTHORIZED`. Запускается ПОСЛЕ
   `JwtAuthGuard` (порядок в `@UseGuards(JwtAuthGuard, RolesGuard)`).
3. **`@Roles(...roles: UserRole[])`** (`common/decorators/roles.decorator.ts`) —
   декларативные метаданные (`SetMetadata`, ключ `ROLES_KEY`). `GUEST` не
   используется — это неявное состояние неаутентифицированного запроса (ADR-0008).
4. **`@CurrentUser(field?)`** (`common/decorators/current-user.decorator.ts`) —
   param-декоратор, возвращает весь `AuthenticatedUser` или его поле. Фабрика
   вынесена в `currentUserFactory` ради юнит-тестов. Тип `AuthenticatedUser`
   принадлежит `JwtAuthGuard` (он его producer) — единый контракт для guard'ов и
   декоратора.
5. **`RolesModule`** (`apps/api/src/roles/`) — бандлит `JwtModule.register({})`
   (без глобального секрета) и оба guard'а, экспортирует их + `JwtModule`. Feature-
   модули получают RBAC одним импортом, не регистрируя `JwtModule` у себя.
   `ConfigService` доступен глобально (ADR-0006).
6. **Демонстрация** — `logout` помечен `@UseGuards(JwtAuthGuard)` (API.md §3: Auth
   Bearer): вызвать может только аутентифицированный пользователь, а конкретную
   session family по-прежнему адресует refresh-токен в теле.

## Consequences

Positive:

- Reusable RBAC-инфраструктура: feature-модули (users, listings, admin, …)
  включают защиту через `@UseGuards`/`@Roles` + импорт `RolesModule`.
- Без БД-запросов на запрос — авторизация stateless поверх подписанного токена.
- Ошибки в едином envelope с теми же кодами, что и остальной auth-flow.
- Нет новых зависимостей (переиспользован `@nestjs/jwt`).

Negative / trade-offs:

- Роли в access-токене «застывают» на его TTL (≤15 мин): отзыв роли вступает в
  силу после следующей ротации, а не мгновенно. Приемлемо для MVP при коротком
  access-TTL; мгновенный отзыв (revocation list) — за рамками задачи.
- Guard'ы подключаются точечно — пропуск `@UseGuards` оставит эндпоинт публичным;
  компенсируется код-ревью и явным контрактом «Auth» в API.md.

## Related files

- apps/api/src/common/guards/jwt-auth.guard.ts
- apps/api/src/common/guards/roles.guard.ts
- apps/api/src/common/guards/index.ts
- apps/api/src/common/decorators/roles.decorator.ts
- apps/api/src/common/decorators/current-user.decorator.ts
- apps/api/src/common/decorators/index.ts
- apps/api/src/roles/roles.module.ts
- apps/api/src/roles/index.ts
- apps/api/src/auth/auth.module.ts
- apps/api/src/auth/auth.controller.ts

## Related task

- TASK-044
