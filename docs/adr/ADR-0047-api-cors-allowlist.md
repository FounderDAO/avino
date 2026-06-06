# ADR-0047 — API CORS: explicit origin allowlist from ENV

## Status

Accepted

## Date

2026-06-06

## Context

`apps/api` (NestFactory + Express) не вызывал `app.enableCors()` в `main.ts`.
Браузерная админка (`apps/web`, RTK Query с `http://localhost:3000`) не может
ходить в API (`http://localhost:4000`) из другого origin: браузер блокирует
preflight/ответы без CORS-заголовков. Проблема обнаружена на live e2e ADMIN-05 —
`curl` CORS не проверяет и скрывает её. CORS обязателен по ARCHITECTURE §24.

Требования: origin-список из ENV без хардкода (ENV.md §15), нейтральность к
будущему Flutter-клиенту (mobile не использует CORS), совместимость с auth по
Bearer-токену (Authorization-заголовок) и потенциально cookie-сессиями.

## Decision

**Включить CORS в `main.ts` через хелпер.** Логика парсинга origin'ов и сборки
опций вынесена в `apps/api/src/common/cors/cors.options.ts` (по аналогии с
`validation.options.ts`), чтобы переиспользовать в тестах и не раздувать
bootstrap:

- `parseCorsOrigins(raw?)` — разбирает `CORS_ORIGINS` (CSV): trim, отброс
  пустых, дедупликация с сохранением порядка. Пусто → `[]` (fail-closed).
- `buildCorsOptions(origins)` — `CorsOptions` с **явным allowlist** (без
  wildcard), `credentials: true`, `exposedHeaders: ['X-Request-Id']`,
  `allowedHeaders: Content-Type/Authorization/Accept/Idempotency-Key`, методы
  включая `OPTIONS`, `maxAge: 86400` (кеш preflight на сутки).

### Дополнение (2026-06-06, TASK-184)

В `allowedHeaders` добавлен `Idempotency-Key`. Активация промо
(`POST /api/v1/admin/listings/:id/promotions`, ADR-0033/§15) — единственное
admin-действие с кастомным request-заголовком; он попадает в список заголовков
preflight'а (`Access-Control-Request-Headers`). Без `Idempotency-Key` в
`Access-Control-Allow-Headers` браузер блокировал сам `POST` ещё до отправки на
сервер, и активация молча падала с generic-ошибкой (cancel/extend без кастомных
заголовков работали). `curl` preflight не проверяет, поэтому баг проявлялся
только в браузерной админке. Будущие кастомные заголовки требуют добавления в
этот же allowlist.

**Origin-список — только из ENV.** Namespace `cors.origins` в `configuration.ts`
читает `CORS_ORIGINS`; при отсутствии — dev-дефолт `http://localhost:3000`
(origin самой админки в dev). В production значение задаётся явно. Переменная
добавлена в `env.validation.ts` (опциональна, non-secret) и в `.env.example`.

**Explicit allowlist + credentials.** Wildcard несовместим с `credentials: true`
и небезопасен; allowlist закрывает оба вопроса и готов к будущим cookie-сессиям.
`X-Request-Id` пробрасывается наружу, чтобы браузерный клиент мог прочитать
request_id из ответа (RequestIdInterceptor, TASK-023).

## Consequences

Positive:
- Браузерный fetch с разрешённого origin проходит без CORS-ошибки.
- Origins конфигурируются по окружению из ENV, без хардкода.
- Mobile (Flutter) не затронут — CORS применяется только к браузеру.
- Логика покрыта unit-тестами (`cors.options.spec.ts`).

Negative / trade-offs:
- Allowlist ведётся вручную в `CORS_ORIGINS`; новый домен админки требует
  обновления переменной окружения (не кода).
- Dev-дефолт `http://localhost:3000` означает: при незаданной `CORS_ORIGINS` в
  production браузерные клиенты с реального домена будут заблокированы (видимый
  фейл, не дыра) — оператор обязан задать переменную.

## Related files

- apps/api/src/main.ts
- apps/api/src/common/cors/cors.options.ts
- apps/api/src/common/cors/cors.options.spec.ts
- apps/api/src/config/configuration.ts
- apps/api/src/config/env.validation.ts
- .env.example
- docs/ENV.md

## Related task

- TASK-024
