# ADR-0048 — GET /auth/me contract: DB-sourced roles and always-present profile

## Status

Accepted

## Date

2026-06-06

## Context

TASK-045 реализует `GET /api/v1/auth/me` (API.md §3) — последний недостающий
auth-эндпоинт. Он уже задокументирован в API.md и типизирован на фронте
(`authApi.getMe`, `MeResponse`, ADMIN-03), но в `apps/api` отсутствовал: гард
роли ADMIN (ADMIN-06) зависит от него и был заблокирован.

Эндпоинт аддитивный (новый route под уже принятой стратегией API v1, ADR-0002),
но при реализации возникли решения по контракту, которые нельзя оставлять на
усмотрение кода, потому что от них зависит фронт и будущий Flutter-клиент:

1. **Источник ролей.** `JwtAuthGuard` кладёт в `request.user` роли из access-
   токена (ADR-0010) и в БД на каждый запрос не ходит — это правильно для
   авторизации, но токен «свежеет» только при ротации. Если `/auth/me` отдаст
   роли из токена, UI увидит устаревший набор после смены ролей.
2. **Опциональность профиля.** Строка `user_profiles` создаётся лениво и при
   OTP-signup (ADR-0010) не создаётся вовсе. Контракт же (API.md §3 и фронтовый
   тип `MeResponse`) объявляет `profile` всегда присутствующим объектом, причём
   `preferred_language` — non-null `Language`.
3. **Валидный токен у несуществующего/удалённого субъекта.** Access-токен живёт
   до истечения; за это время аккаунт мог быть удалён (DELETED).

## Decision

1. **Роли в `/auth/me` читаются из БД**, а не из токена: сервис делает
   `user.findFirst(... include roles.role)` и мапит `code`. Так UI получает
   актуальные роли сразу. Авторизация (guard/RBAC) по-прежнему опирается на
   токен — это разные задачи (отображение vs контроль доступа).
2. **`profile` присутствует всегда.** При отсутствии строки `user_profiles` все
   поля профиля = `null`, а `preferred_language` берётся из
   `user.default_language`, чтобы фронтовый non-null тип языка не нарушался.
   Если профиль есть, но `preferred_language` не задан — тот же фолбэк.
3. **DELETED/несуществующий субъект → `401 UNAUTHORIZED`** (envelope §4):
   `findFirst` фильтрует `status != DELETED`; пустой результат трактуется как
   «субъект токена больше не существует». Бизнес-логика отсутствия пользователя
   не маскируется под 404 — для клиента это неаутентифицированное состояние.
4. **Контракт ответа** строго snake_case и совпадает с API.md §3 и
   `MeResponse`: `{ id, phone, email, status, default_language,
   is_phone_verified, is_email_verified, roles, profile }`.

## Consequences

Positive:

- UI видит актуальные роли пользователя без ожидания ротации токена.
- `profile` гарантированно присутствует — фронт не пишет defensive-проверки на
  `profile == null`, а `preferred_language` всегда валидный язык.
- ADMIN-06 (гард роли ADMIN) разблокирован.
- Удалённый аккаунт по «ещё живому» токену не утекает данными — 401.

Negative / trade-offs:

- `/auth/me` делает запрос в БД (с join профиля и ролей) на каждый вызов, в
  отличие от guard'а, который читает роли из токена. Эндпоинт вызывается редко
  (bootstrap сессии), поэтому стоимость приемлема.
- Роли в токене и роли в `/auth/me` могут на короткое время расходиться (токен
  отражает момент выпуска) — это намеренно: контроль доступа консервативен и
  обновляется ротацией, отображение — сразу.

## Related files

- apps/api/src/auth/auth.controller.ts
- apps/api/src/auth/auth.service.ts
- apps/api/src/auth/dto/me-response.dto.ts
- apps/api/src/auth/auth.controller.spec.ts
- apps/api/src/auth/auth.service.spec.ts
- docs/API.md

## Related task

- TASK-045
