# ADR-0012 — OTP request delivery, hashing and rate limiting

## Status

Accepted

## Date

2026-06-04

## Context

`ARCHITECTURE.md` §6 определяет вход в систему по OTP (SMS/Email), а `API.md` §3 —
эндпоинт `POST /api/v1/auth/otp/request`. Нужно реализовать первый шаг auth-flow
(`request → verify → refresh → logout`), не дожидаясь остальных: TASK-041
покрывает только выпуск и доставку кода.

Открытые вопросы, требовавшие решения:

1. **Маршрут.** Карточка TASK-041 (приёмка) называет `POST /api/v1/auth/request-otp`,
   но детальный контракт `API.md` §3 — `POST /api/v1/auth/otp/request`. Источник
   истины по контрактам — `API.md` (CLAUDE.md §2).
2. **Хранение кода.** OTP — низкоэнтропийный секрет (6 цифр ≈ 10^6 комбинаций).
   `DB_SCHEMA.md` §4 требует `code_hash`, не plaintext.
3. **Доставка.** Провайдер SMS для MVP — Eskiz.uz (CLAUDE.md §13, запрещено
   менять без подтверждения). Email-транспорт (SMTP через `email_queue`,
   ARCHITECTURE §23) ещё не подключён.
4. **Rate limiting.** `DB_SCHEMA.md` §15 / `API.md` §3 требуют ограничение
   «per destination + per IP». В стеке нет `@nestjs/throttler`; есть Redis.
5. **Идентификация пользователя.** Код может запрашиваться до регистрации
   (pre-signup login), поэтому `otp_codes.user_id` nullable (DB_SCHEMA §4).

## Decision

- **Маршрут** — `POST /api/v1/auth/otp/request` по `API.md` §3 (не `request-otp`
  из карточки). Версионирование URI обязательно (CLAUDE.md §14).
- **Хеширование** — `scrypt` (`node:crypto`) с уникальной солью на код; строка
  хранится как `<saltHex>:<keyHex>` в `code_hash`. Медленный хеш делает перебор
  10^6 комбинаций при утечке БД дорогим (в отличие от SHA-256). Проверка —
  constant-time (`timingSafeEqual`). Отдельный pepper/секрет не вводится
  (CLAUDE.md §3 «никаких дефолтов для секретов»). Сам код наружу не возвращается.
- **Абстракции доставки** — `SmsService` (Eskiz REST через глобальный `fetch`,
  Bearer-токен кэшируется в памяти, переполучается при 401) и `EmailService`.
  Если провайдер не настроен — в dev код логируется (для прохождения flow
  локально), в production не логируется (ARCHITECTURE §23 «environment secrets»).
  Реальный SMTP-транспорт подключит `email_queue` отдельной задачей; сигнатура
  `EmailService.sendOtp` уже стабильна.
- **Rate limiting на Redis** (новый `RedisModule`, глобальный, по аналогии с
  `PrismaModule`):
  - **per destination** — cooldown `OTP_RESEND_COOLDOWN` между запросами на один
    контакт (anti-bombing конкретного номера/почты);
  - **per IP** — счётчик `INCR`/`EXPIRE` в окне `RATE_LIMIT_WINDOW` /
    `RATE_LIMIT_MAX` (anti-перебор получателей с одного источника).
  Превышение любой оси → `429 RATE_LIMITED` (единый error-envelope, ADR-0007).
- **Инвалидация** прежних неиспользованных кодов на контакт при новом запросе —
  валиден только последний код (упрощает и обезопашивает verify в TASK-042).
- **Привязка к пользователю** — `user_id` ставится, если найден НЕ-DELETED
  аккаунт с этим контактом (ADR-013), иначе `null`.

Конфигурация вынесена в namespaced-конфиги `otp` и `rateLimit` (по ENV.md §8),
с безопасными дефолтами; добавлены `OTP_TTL`, `OTP_MAX_ATTEMPTS`,
`OTP_RESEND_COOLDOWN`, `RATE_LIMIT_WINDOW`, `RATE_LIMIT_MAX`, `ESKIZ_FROM`.

## Consequences

Positive:
- Первый шаг OTP-flow работает и проверяем без остального auth-модуля.
- Коды защищены slow-hash; plaintext не хранится и не возвращается.
- Доставка инкапсулирована — смена/доработка провайдера не трогает вызывающий код.
- Появился переиспользуемый `RedisService` (rate-limit сейчас, BullMQ/кэш далее).
- Rate-limit переживает рестарт API (состояние в Redis, не в памяти).

Negative / trade-offs:
- Нет суточного объёмного cap на один контакт (только cooldown между запросами) —
  отдельная мера hardening; намеренно не вводим недокументированные env-кнобы.
- Email-доставка пока логическая (без реального SMTP) — до подключения
  `email_queue`; в dev код виден в логах.
- `scrypt` синхронно нагружает CPU; при выпуске OTP это один вызов на запрос —
  приемлемо, но при росте нагрузки стоит вынести в воркер.
- Eskiz-токен кэшируется в памяти процесса (не в Redis) — при нескольких инстансах
  каждый логинится сам; для MVP приемлемо.

## Related files

- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/otp.service.ts`
- `apps/api/src/auth/otp-rate-limit.service.ts`
- `apps/api/src/auth/otp-hash.util.ts`
- `apps/api/src/auth/contact.util.ts`
- `apps/api/src/auth/dto/request-otp.dto.ts`
- `apps/api/src/auth/auth.module.ts`
- `apps/api/src/sms/sms.service.ts`
- `apps/api/src/email/email.service.ts`
- `apps/api/src/redis/redis.service.ts`
- `apps/api/src/config/configuration.ts`, `env.validation.ts`
- `.env.example`

## Related task

- TASK-041
