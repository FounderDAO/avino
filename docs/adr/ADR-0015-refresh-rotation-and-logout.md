# ADR-0015 — Refresh token rotation, reuse detection and logout

## Status

Accepted

## Date

2026-06-04

## Context

`ARCHITECTURE.md` §6 и `API.md` §3 определяют третий и четвёртый шаги auth-flow
(`request → verify → refresh → logout`): `POST /api/v1/auth/refresh` обменивает
действующий refresh-токен на новую пару access+refresh, а
`POST /api/v1/auth/logout` отзывает сессию. TASK-042 (ADR-0014) реализовал
`verify` и заложил опору: refresh-JWT несёт `sub`+`fid`(session family)+`jti`
(= id строки `refresh_tokens`), а в БД хранится только детерминированный хеш
токена. `DB_SCHEMA` §4 фиксирует политику: «rotation on use; reuse of a rotated
token revokes the whole family».

Открытые вопросы, оставленные сервисному слою:

1. **Как находить строку токена.** refresh подписан и несёт `jti` = id строки;
   хеш (`token_hash`) детерминирован (ADR-0014) и индексирован.
2. **Что отзывать при reuse.** Предъявление уже ротированного (отозванного)
   токена — признак компрометации: одной строки недостаточно.
3. **Коды ошибок.** `API.md` §3/§17 различает `TOKEN_INVALID` / `TOKEN_EXPIRED` /
   `TOKEN_REUSED`, все — `401`.
4. **Авторизация logout.** `API.md` помечает logout как `Bearer`, но Bearer-guard
   — deliverable TASK-044; сейчас guard'а нет.
5. **Роли в новом access-токене.** При ротации роли пользователя могли измениться.

## Decision

- **refresh (`rotateSession`).** Порядок: (1) проверка подписи refresh-JWT
  `JWT_REFRESH_SECRET` — `TokenExpiredError` → `TOKEN_EXPIRED`, иначе
  `TOKEN_INVALID`; (2) поиск строки `refresh_tokens` по `jti` и сверка
  `token_hash` + `user_id` + `family_id` (рассинхрон → `TOKEN_INVALID`);
  (3) **reuse-detection** — если строка уже `revoked_at`, отзываем всю family и
  `TOKEN_REUSED`; (4) DB-истечение `expires_at` → `TOKEN_EXPIRED`; (5) ротация в
  одной транзакции — текущая строка `revoked_at`, новая строка в той же family с
  новым `jti`.
- **Свежие роли.** На ротации пользователь перечитывается из БД, роли кладутся в
  новый access-токен; неактивный (`status != ACTIVE`) пользователь → отзыв family
  + `TOKEN_INVALID` (заблокированный аккаунт не продлевает сессию).
- **logout (`revokeSession`).** Идемпотентен и не верифицирует подпись: строка
  ищется по детерминированному `token_hash`. Найдена → отзываем всю family
  (любой её токен далее даст `TOKEN_REUSED`) и пишем `audit_logs`
  (`action='LOGOUT'`); не найдена → no-op. Ответ всегда `204 No Content` — не
  раскрываем существование сессии. Body-based адресация сессии — временно, до
  Bearer-guard (TASK-044).
- **HTTP-коды.** Все ошибки refresh/logout — `401`; logout — `204`.
- **Схема/окружение.** Изменений нет: модель `refresh_tokens` (`revoked_at`,
  `family_id`) и `JWT_*` env (ENV.md §7) заведены в TASK-042; reuse-detection —
  чистая сервисная логика поверх существующих индексов `(token_hash)`/`(family_id)`.

## Consequences

Positive:

- refresh-flow завершён: ротация при каждом использовании, новый access несёт
  актуальные роли, refresh хранится только хешем.
- reuse украденного (уже ротированного) токена обнаруживается и отзывает всю
  session family — кража одного токена не даёт долгого доступа.
- logout идемпотентен, не течёт информацией о существовании сессии, аудируется.
- Никаких изменений схемы/миграций — только сервисный слой.

Negative / trade-offs:

- logout пока не требует Bearer (guard — TASK-044): сессию адресует refresh-токен
  в теле. Поскольку отзыв возможен только при знании токена, риск ограничен.
- Неактивный пользователь на refresh получает `TOKEN_INVALID` (а не отдельный
  `USER_BLOCKED`) — держимся набора кодов, документированных для эндпоинта.
- Гонка двух одновременных refresh одного токена: оба читают строку до отзыва,
  второй создаст вторую активную строку в family; для MVP приемлемо (окно — один
  network round-trip; полноценная защита — `SELECT … FOR UPDATE`/CAS позже).
- HS256 на симметричных секретах (унаследовано из ADR-0014).

## Related files

- `apps/api/src/auth/token.service.ts` (`rotateSession`, `revokeSession`, `revokeFamily`)
- `apps/api/src/auth/auth.service.ts` (`refresh`, `logout`)
- `apps/api/src/auth/auth.controller.ts` (`POST /refresh`, `POST /logout`)
- `apps/api/src/auth/dto/refresh-token.dto.ts`
- `apps/api/src/auth/token.service.spec.ts`

## Related task

- TASK-043
