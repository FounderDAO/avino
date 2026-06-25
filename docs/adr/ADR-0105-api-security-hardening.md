# ADR-0105 — API security hardening (throttling, helmet, trust proxy, OTP brute-force lock)

## Status

Accepted

## Date

2026-06-25

## Context

Security-аудит API (2026-06-25, `scratchpad/security-audit.md`) подтвердил, что по
самым опасным осям бэкенд защищён (нет IDOR, нет SQL/PostGIS-инъекций, корректный
`RolesGuard`, серверные UUID-ключи медиа, секреты без дефолтов). Однако нашёл
ряд **гапов харденинга аутентификации и инфраструктуры**:

- **H-1** — `verifyOtp()` не имел rate-limit; per-OTP счётчик `attempts`
  сбрасывался при каждом новом коде, так что бюджет брутфорса обновлялся.
- **M-1** — per-IP лимиты опирались на `@Ip()`, но `trust proxy` не был выставлен →
  за nginx/Cloudflare все клиенты схлопывались в один IP-bucket.
- **M-2** — отсутствовали HTTP security-заголовки (helmet не подключён).
- **M-3** — нет глобального rate-limit; `/auth/google|apple|refresh|logout` без
  лимита; `@nestjs/throttler` не установлен.
- **M-4** — broadcast без cap на число получателей (fat-finger / компрометация
  админ-сессии могли разослать всей базе).
- **M-5** — `TELEGRAM_INCLUDE_OTP_CODE` по умолчанию `true` → коды OTP и IP
  утекали в общий Telegram admin-чат.
- **L-2** — `CreateBroadcastDto.filterRole` был свободной строкой, не enum.

H-2 (account-linking), L-1 (Apple nonce), L-3/L-4 (media) вынесены в отдельные
задачи.

## Decision

Пакет hardening **в `apps/api`**, всё конфигурируемо через env с дефолтами:

1. **Глобальный throttler** (`@nestjs/throttler`, in-memory, одиночный VPS) через
   `APP_GUARD → ConditionalThrottlerGuard` (выключаем в тестах `THROTTLE_DISABLED`).
   Глобальный дефолт **300 req/60s на IP** (щедрый — чтобы нормальный браузинг
   SPA не ловил 429 за CGNAT/корп-NAT), плюс жёсткие `@Throttle`-override на auth
   (20/60s) и OTP (10/60s).
2. **H-1 durable brute-force lock на `verifyOtp`** — `OtpRateLimitService`
   получил `assertCanVerify` (per-IP + per-destination окна, проверка ДО любого
   DB/хеш-доступа) и `recordFailedVerify` (**кумулятивный per-destination счётчик
   в Redis** с TTL, перекрывающим несколько жизней кода → повторный запрос кода
   НЕ сбрасывает бюджет; после порога — лок destination на N секунд).
3. **M-1 trust proxy** — `NestExpressApplication` + `app.set('trust proxy', 1)`
   (один доверенный hop), чтобы `req.ip` отражал клиента.
4. **M-2 helmet** — HSTS (1 год + subdomains), `noSniff`, `frameguard: deny`,
   `referrerPolicy: no-referrer`, строгий CSP для API + ослабленный CSP-override
   для Swagger UI путей.
5. **M-4 broadcast cap** — `BROADCAST_MAX_RECIPIENTS` (дефолт 5000); `create()`
   считает preview-аудиторию и кидает `422` при превышении.
6. **M-5** — `TELEGRAM_INCLUDE_OTP_CODE` default **false** (включается только
   явным `=true` в dev/staging).
7. **L-2** — `filterRole` → `@IsEnum(UserRole)`.

## Consequences

Positive:
- Брутфорс OTP больше не обходится ре-запросом кода; verify-эндпоинт метрифицирован.
- Per-IP лимиты реально работают за прокси; auth-эндпоинты под лимитом.
- Базовые security-заголовки на месте; коды OTP не уходят в Telegram по умолчанию.
- Broadcast защищён от случайной/злонамеренной рассылки всей базе.

Negative / trade-offs:
- Глобальный throttler — **in-memory**, т.е. per-instance: при горизонтальном
  масштабировании API лимит станет «мягче» (на инстанс). Критичный H-1-лок — в
  Redis и переживает рестарт/мультиинстанс. Переход throttler-storage на Redis —
  follow-up при появлении 2+ инстансов.
- Дефолтные лимиты подобраны эвристически; тюнить по реальному трафику (env-кнобы
  есть, код менять не нужно).
- Apple nonce (L-1) требует координации с клиентом → отдельная задача.

## Related files

- apps/api/package.json (helmet, @nestjs/throttler)
- apps/api/src/main.ts (trust proxy, helmet)
- apps/api/src/app.module.ts (ThrottlerModule, APP_GUARD)
- apps/api/src/common/guards/conditional-throttler.guard.ts (new)
- apps/api/src/auth/auth.controller.ts (@Throttle)
- apps/api/src/auth/auth.service.ts (assertCanVerify/recordFailedVerify)
- apps/api/src/auth/otp-rate-limit.service.ts (+ spec)
- apps/api/src/auth/otp.service.ts
- apps/api/src/broadcasts/broadcasts.service.ts
- apps/api/src/broadcasts/dto/create-broadcast.dto.ts
- apps/api/src/config/configuration.ts
- apps/api/.env.example

## Related task

- TASK-SEC-01 (API security hardening)
