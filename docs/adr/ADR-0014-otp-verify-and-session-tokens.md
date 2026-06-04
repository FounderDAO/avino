# ADR-0014 — OTP verification, signup-as-login and session token issuance

## Status

Accepted

## Date

2026-06-04

## Context

`ARCHITECTURE.md` §6 и `API.md` §3 определяют второй шаг auth-flow
(`request → verify → refresh → logout`): `POST /api/v1/auth/otp/verify` обменивает
OTP-код на сессию из access + refresh токенов и создаёт пользователя при первом
входе. TASK-041 (ADR-0012) реализовал `request`; TASK-042 реализует `verify`.

Схема хранилища уже зафиксирована ADR-0010 (`otp_codes`, `refresh_tokens`,
hash-only, `family_id`, nullable `otp_codes.user_id`), но логику выпуска токенов
и проверки кода ADR-0010 намеренно оставил сервисному слою. Открытые вопросы:

1. **Маршрут.** Карточка TASK-042 (приёмка) называет `POST /api/v1/auth/verify-otp`,
   но контракт `API.md` §3 — `POST /api/v1/auth/otp/verify` (как и `otp/request`).
   Источник истины по контрактам — `API.md` (CLAUDE.md §2).
2. **Подпись токенов.** В стеке не было JWT-библиотеки. access — короткоживущий
   Bearer на каждый запрос; refresh — долгоживущий, ротируемый. ENV.md §7 требует
   РАЗНЫЕ секреты для access и refresh.
3. **Хранение refresh.** `refresh_tokens.token_hash` индексируется обычным btree
   (ADR-0010) → хеш должен быть детерминированным (в отличие от per-row-salt OTP).
4. **Проверка кода.** Нужны различимые исходы `OTP_INVALID` / `OTP_EXPIRED` /
   `OTP_ATTEMPTS_EXCEEDED` (API.md §17) и локаут по счётчику `attempts`.
5. **Создание пользователя.** Логин по OTP — это и регистрация (ADR-0010):
   при первом успешном verify аккаунта ещё нет.

## Decision

- **Маршрут** — `POST /api/v1/auth/otp/verify` по `API.md` §3 (не `verify-otp` из
  карточки). Версионирование URI обязательно (CLAUDE.md §14).
- **JWT через `@nestjs/jwt`** (HS256). `JwtModule.register({})` без глобального
  секрета — access и refresh подписываются РАЗНЫМИ секретами, передаваемыми
  per-call (`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`). Секреты обязательны и
  валидируются на старте (fail-fast, без дефолтов — CLAUDE.md §3). TTL:
  `JWT_ACCESS_TTL`=900, `JWT_REFRESH_TTL`=2592000 (ENV.md §7).
- **Payload.** access несёт `sub` (id) + `roles` (под будущий RBAC-guard,
  TASK-044). refresh несёт `sub`, `fid` (session family) и `jti`, равный id строки
  `refresh_tokens` — это связывает токен с записью и даёт TASK-043 опору для
  ротации/reuse-detection.
- **Хранение refresh** — детерминированный `HMAC-SHA256(token, JWT_REFRESH_SECRET)`
  в `token_hash` (pepper = серверный секрет). Дамп БД без секрета бесполезен, а
  lookup предъявленного токена — точечное сравнение хеша. Значение токена в БД не
  материализуется.
- **Verify-проверки по порядку:** последний неиспользованный код на контакт →
  иначе `OTP_INVALID`; истёк → гасим, `OTP_EXPIRED`; `attempts ≥ OTP_MAX_ATTEMPTS`
  → `OTP_ATTEMPTS_EXCEEDED` (429); неверный код → инкремент `attempts` и
  `OTP_INVALID` (либо `OTP_ATTEMPTS_EXCEEDED`, если попытка исчерпала лимит);
  успех → код гасится (`consumed_at`) — строго одноразовый.
- **Signup-as-login.** Нет активного (НЕ-DELETED) аккаунта с этим контактом →
  создаём `users` + базовую роль `USER` в одной транзакции, помечаем канал
  verified (`is_phone_verified`/`is_email_verified`). Есть аккаунт: `BLOCKED` →
  `USER_BLOCKED` (403); иначе обновляем verified-флаг и `last_login_at`.
- **Аудит.** Успешный вход пишется в `audit_logs` (`action='LOGIN'`,
  `entity_type='user'`, `metadata.channel`), ip/user-agent сохраняются и в
  refresh-строке, и в аудите (DB_SCHEMA §12).
- **Конфигурация** — namespaced `jwt`-конфиг + переменные `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` (ENV.md §7),
  добавлены в `.env.example` и в env-валидацию.

## Consequences

Positive:

- Второй шаг OTP-flow работает: код обменивается на access+refresh, пользователь
  создаётся при первом входе.
- access и refresh подписаны разными секретами; refresh хранится только хешем.
- `jti = id` строки refresh даёт TASK-043 готовую опору для ротации и
  reuse-detection по `family_id` без доработки схемы.
- Различимые коды ошибок и локаут по `attempts` соответствуют контракту (§17).
- Успешные входы аудируются (`LOGIN`).

Negative / trade-offs:

- Логика ротации/отзыва refresh (reuse-detection по family) ещё не реализована —
  это deliverable TASK-043; `TokenService` экспортируется под него.
- Гонка двух одновременных первых verify на один контакт может упереться в
  partial-unique (ADR-013) и дать 500 вместо `CONTACT_TAKEN`; для MVP приемлемо.
- HS256 на симметричных секретах: проверять токен сможет только сервис, знающий
  секрет (для монолита MVP достаточно; асимметрия — при необходимости позже).
- `attempts` инкрементится отдельным `update` после неуспешной проверки —
  при гонке возможен недосчёт; для anti-bruteforce в MVP приемлемо.

## Related files

- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/token.service.ts`
- `apps/api/src/auth/token.util.ts`
- `apps/api/src/auth/dto/verify-otp.dto.ts`
- `apps/api/src/auth/auth.module.ts`
- `apps/api/src/config/configuration.ts`, `env.validation.ts`
- `apps/api/package.json` (`@nestjs/jwt`)
- `.env.example`

## Related task

- TASK-042
