# ADR-0010 — Auth token schema: OTP codes and refresh tokens

## Status

Accepted

## Date

2026-06-03

## Context

TASK-034 вводит хранилище для OTP-логина Avino — таблицы `otp_codes` и
`refresh_tokens` (DB_SCHEMA.md §4). У `users` нет колонки пароля: авторизация
строится на одноразовых кодах (SMS/EMAIL), которые обмениваются на сессию из
access/refresh-токенов (ARCHITECTURE §6, ADR-0009).

Это требует зафиксировать несколько решений по безопасности и моделированию, а
не оставлять их на усмотрение реализации сервиса:

1. **Секреты нельзя хранить в открытом виде.** И OTP-код, и refresh-токен — это
   секреты предъявителя (bearer). Утечка дампа БД не должна позволять войти за
   пользователя, поэтому хранятся только хеши, а не значения.
2. **Refresh-токены должны выдерживать кражу.** Нужен механизм обнаружения
   повторного использования украденного токена и отзыва всей сессии.
3. **OTP-код может понадобиться до создания пользователя.** Логин по OTP — это
   одновременно и регистрация: при первом входе пользователя ещё нет, значит
   `otp_codes.user_id` обязан быть nullable.

## Decision

1. **Две модели в `schema.prisma`** строго по DB_SCHEMA §4: `OtpCode`
   (`otp_codes`) и `RefreshToken` (`refresh_tokens`), плюс два enum-типа
   `OtpChannel` (SMS | EMAIL) и `OtpPurpose` (LOGIN). В MVP `OtpPurpose`
   содержит только `LOGIN`; добавление значений non-breaking (ADR-0002).
2. **Хранится только хеш.** `otp_codes.code_hash` и `refresh_tokens.token_hash` —
   `VARCHAR(255)`, содержат хеш, не plaintext. Колонок `code`/`token` нет —
   значение не материализуется в БД вообще.
3. **Ротация и reuse-detection через `family_id`.** Refresh-токены одной сессии
   группируются `family_id`; токен ротируется при использовании, а предъявление
   уже ротированного токена отзывает всю family. Сам механизм ротации/отзыва —
   в сервисном слое; схема даёт хранилище и индекс по `family_id`.
4. **`otp_codes.user_id` nullable, `ON DELETE CASCADE`.** Код может быть выписан
   до регистрации (pre-signup login). `refresh_tokens.user_id` — NOT NULL,
   `ON DELETE CASCADE`: токены без пользователя не имеют смысла.
5. **Счётчик `attempts SMALLINT DEFAULT 0`** на `otp_codes` для локаута после N
   неудачных проверок; запрос и верификация OTP rate-limited (per destination,
   per IP) на уровне сервиса — БД хранит только счётчик.
6. **Индексы под реальные lookup-запросы** (DB_SCHEMA §4): `otp_codes` —
   `(destination, purpose)` (поиск активного кода) и `(expires_at)` (очистка
   просроченных); `refresh_tokens` — `(user_id)`, `(token_hash)` (проверка
   предъявленного токена), `(family_id)` (отзыв сессии).
7. **Все временные поля — `@db.Timestamptz(6)`** (`expires_at`, `consumed_at`,
   `revoked_at`, `created_at`) в UTC, как и в ADR-0009 (DB_SCHEMA §2).
8. **enum-типы создаются этой миграцией** — это первая миграция, ссылающаяся на
   `OtpChannel`/`OtpPurpose`; базовые enum'ы (TASK-032) уже созданы миграцией
   users/roles и не пересоздаются.

## Consequences

Positive:

- Дамп БД не раскрывает ни OTP-коды, ни refresh-токены — только их хеши.
- Кража refresh-токена детектируется при повторном использовании и обрывает всю
  сессию (`family_id`), а не один токен.
- Логин-как-регистрация поддержан на уровне схемы (nullable `user_id` у OTP).
- Lookup-поля проиндексированы под фактические запросы сервиса аутентификации.

Negative / trade-offs:

- Ключевая логика безопасности (ротация, reuse-detection, rate-limit, выбор
  алгоритма хеширования) живёт в сервисном слое, а не в схеме — схема лишь
  обеспечивает хранилище и не может её гарантировать сама по себе.
- `token_hash` проиндексирован обычным btree; это требует, чтобы хеш был
  детерминированным для поиска (соль — не на строку, а на уровне схемы хеша).

## Related files

- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260603140000_add_auth_tokens/migration.sql
- docs/DB_SCHEMA.md

## Related task

- TASK-034
