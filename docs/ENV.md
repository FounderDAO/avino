# ENV.md — Avino

## 1. Purpose

This document is the authoritative registry of environment variables for Avino.
It is the companion to the repository `.env.example` and to `ARCHITECTURE.md`
(§24 Security, §25 Environment variables). Every variable consumed by
`apps/api` or `apps/web` must be listed here with its group, whether it is
required, and whether it is exposed to the browser.

```text
Source of truth order:
- ENV.md (this file)  -> what each variable means and whether it is required.
- .env.example        -> copy/paste template with safe placeholders.
- .env (local) / platform secrets (prod) -> real values, NEVER committed.
```

## 2. Conventions

```text
- Secrets are NEVER committed. .env is gitignored; .env.example holds only
  placeholders / non-secret defaults (CLAUDE.md §3 code style).
- No hardcoded defaults for secrets in config code. A missing required secret
  must fail fast at startup (validate env on boot).
- Browser exposure: in apps/web, ONLY variables prefixed NEXT_PUBLIC_ are sent
  to the client bundle. Never put a secret behind NEXT_PUBLIC_.
- Naming: UPPER_SNAKE_CASE. Group-prefixed where it aids clarity
  (POSTGRES_*, REDIS_*, S3_*, JWT_*, SMTP_*, ESKIZ_*).
- Timestamps/locale are app concerns, not env. Money/keys are env.
- Each service (api, web) reads only the variables it needs.
```

Legend for the tables below:

```text
Req?   yes = required to boot the service that uses it
       no  = optional / has a safe non-secret default
Secret yes = must come from a secret store / .env, never .env.example value
Client yes = exposed to the browser (apps/web, NEXT_PUBLIC_ prefix)
```

## 3. APP / Node

| Variable   | Req? | Secret | Client | Example         | Description                          |
|------------|------|--------|--------|-----------------|--------------------------------------|
| NODE_ENV   | yes  | no     | no     | development     | development \| production \| test    |
| API_PORT   | yes  | no     | no     | 4000            | Port the NestJS API listens on       |

## 4. API

| Variable     | Req? | Secret | Client | Example                  | Description                                   |
|--------------|------|--------|--------|--------------------------|-----------------------------------------------|
| API_BASE_URL | no   | no     | no     | http://localhost:4000    | Absolute base used for building links/webhooks |

All API routes are served under `/api/v1` (see `ARCHITECTURE.md` §5). The
prefix is applied in code, not via env.

## 5. Database (PostgreSQL + PostGIS)

| Variable          | Req? | Secret | Client | Example                                                        | Description                   |
|-------------------|------|--------|--------|----------------------------------------------------------------|-------------------------------|
| POSTGRES_USER     | yes  | yes    | no     | avino                                                          | DB user                       |
| POSTGRES_PASSWORD | yes  | yes    | no     | (set in .env)                                                  | DB password                   |
| POSTGRES_DB       | yes  | no     | no     | avino                                                          | Database name                 |
| POSTGRES_HOST     | yes  | no     | no     | localhost                                                      | DB host                       |
| POSTGRES_PORT     | yes  | no     | no     | 5432                                                           | DB port                       |
| DATABASE_URL      | yes  | yes    | no     | postgresql://avino:avino@localhost:5432/avino?schema=public    | Prisma connection string      |

```text
Notes:
- The DB must have the PostGIS extension (CREATE EXTENSION postgis) — see
  DB_SCHEMA §14. PostGIS comes from the postgis/postgis docker image.
- DATABASE_URL is the single source Prisma uses; the POSTGRES_* parts feed
  docker-compose and the URL must stay consistent with them.
```

## 6. Redis (cache + BullMQ)

| Variable   | Req? | Secret | Client | Example                 | Description                          |
|------------|------|--------|--------|-------------------------|--------------------------------------|
| REDIS_HOST | yes  | no     | no     | localhost               | Redis host                           |
| REDIS_PORT | yes  | no     | no     | 6379                    | Redis port                           |
| REDIS_URL  | yes  | no*    | no     | redis://localhost:6379  | Connection URL (cache + all queues)  |

`*` Secret if the managed Redis requires a password (`redis://:pass@host:port`).

### 6.1 Exchange rate (cbu.uz daily cron)

Daily USD→UZS refresh is a BullMQ repeatable job (`refresh_exchange_rate`) — its
schedule lives here; the rate source is the Central Bank of Uzbekistan (no key).

| Variable           | Req? | Secret | Client | Example         | Description                                                           |
|--------------------|------|--------|--------|-----------------|----------------------------------------------------------------------|
| EXCHANGE_RATE_CRON | no   | no     | no     | 0 6 * * *       | Cron for the daily rate refresh. Default `0 6 * * *` (06:00).         |
| EXCHANGE_RATE_TZ   | no   | no     | no     | Asia/Tashkent   | Timezone for the refresh cron. Default `Asia/Tashkent`.              |
| CBU_BASE_URL       | no   | no     | no     | https://cbu.uz  | CBU base URL (USD rate source, no API key). Default `https://cbu.uz`. |

- All three have defaults — the feature boots and refreshes without any env set.
  On fetch failure the last rate is kept (no row written); on cold start with an
  empty table the worker fetches once. See `API.md` §19.

### 6.2 Media cleanup (orphan R2 photos)

Background sweep that deletes orphaned listing photos from R2 — objects under
`listings/.../media/` with no live `listing_media` row. A BullMQ repeatable job
(`cleanup_orphan_media`). Destructive → **disabled by default**; both producer and
worker are full NO-OP when off (no Redis connection, no schedule). See ADR-0099.

| Variable                  | Req? | Secret | Client | Example     | Description                                                                                  |
|---------------------------|------|--------|--------|-------------|----------------------------------------------------------------------------------------------|
| MEDIA_CLEANUP_ENABLED     | no   | no     | no     | false       | Master switch. Default `false` (off). Set `true` to activate the sweep (staging/prod).       |
| MEDIA_CLEANUP_CRON        | no   | no     | no     | 0 4 * * *   | Cron for the sweep. Default `0 4 * * *` (04:00 daily).                                        |
| MEDIA_CLEANUP_GRACE_HOURS | no   | no     | no     | 24          | Skip objects younger than N hours (avoids racing a just-uploaded photo). Default `24`.       |
| MEDIA_CLEANUP_BATCH_SIZE  | no   | no     | no     | 500         | Max deletions per run; a large orphan backlog drains over several runs. Default `500`.       |
| MEDIA_CLEANUP_DRY_RUN     | no   | no     | no     | true        | Observe-only: log what WOULD be deleted, delete nothing. **Default `true`** — first activation is observational; set `false` to actually delete after checking the dry-run log. |
| MEDIA_CLEANUP_MAX_DELETE_RATIO | no | no  | no     | 0.5         | Circuit-breaker: if more than this fraction of the inspected batch (≥20 objects) looks orphaned, **abort and log an error** instead of deleting — a wrong/empty DB or missing `S3_KEY_PREFIX` signal. Default `0.5`. |

- Leaving `MEDIA_CLEANUP_ENABLED` unset/`false` is safe everywhere — the feature
  does nothing. Orphans only accumulate slowly (failed best-effort delete, or
  upload-without-create); enable explicitly once verified. See ADR-0099.
- **Shared-bucket safety (important).** Orphan cleanup deletes objects with no
  matching `listing_media` row in the env's OWN database. If two environments
  share one bucket (e.g. local + staging both on `avinodev`), set a distinct
  `S3_KEY_PREFIX` per env (§9) so each sweep is scoped to its own subtree —
  otherwise one env's cleanup would treat the other's live photos as orphans.
- **Safe activation recipe:** (1) set `S3_KEY_PREFIX` per env; (2) enable with
  `MEDIA_CLEANUP_ENABLED=true` while `MEDIA_CLEANUP_DRY_RUN` stays `true`;
  (3) read the `[DRY-RUN] would delete …` log lines and confirm they list only
  genuine orphans; (4) only then set `MEDIA_CLEANUP_DRY_RUN=false`. The
  circuit-breaker is the backstop if a misconfiguration slips through.

## 7. JWT / Auth

> Required by `ARCHITECTURE.md` §6/§23 and `API.md` §3, but NOT yet present in
> `.env.example` — must be added (see §15 Gaps).

| Variable             | Req? | Secret | Client | Example | Description                                |
|----------------------|------|--------|--------|---------|--------------------------------------------|
| JWT_ACCESS_SECRET    | yes  | yes    | no     | (set)   | Signing secret for short-lived access token |
| JWT_REFRESH_SECRET   | yes  | yes    | no     | (set)   | Signing secret for long-lived refresh token |
| JWT_ACCESS_TTL       | no   | no     | no     | 900     | Access token TTL, seconds (default 15m)     |
| JWT_REFRESH_TTL      | no   | no     | no     | 2592000 | Refresh token TTL, seconds (default 30d)    |

```text
- Access and refresh use DIFFERENT secrets. Refresh tokens are stored hashed
  and rotated on use (DB_SCHEMA §4 refresh_tokens, ADR/§24).
```

## 8. OTP / rate limiting

> Recommended config for OTP and rate limiting (referenced by `API.md` §3 and
> `ARCHITECTURE.md` §23). Add to `.env.example` when implementing AuthModule.

| Variable            | Req? | Secret | Client | Example | Description                                  |
|---------------------|------|--------|--------|---------|----------------------------------------------|
| OTP_TTL             | no   | no     | no     | 300     | OTP validity, seconds                        |
| OTP_MAX_ATTEMPTS    | no   | no     | no     | 5       | Max verify attempts before invalidation      |
| OTP_RESEND_COOLDOWN | no   | no     | no     | 60      | Seconds between OTP resend requests          |
| OTP_TELEGRAM_DELIVERY | no | no    | no     | false   | Staging only: deliver phone OTP via Telegram admin chat (bypasses Eskiz & the SMS toggle). Requires Telegram notifications enabled. Default OFF — keep OFF in prod. |
| RATE_LIMIT_WINDOW   | no   | no     | no     | 60      | Global rate-limit window, seconds            |
| RATE_LIMIT_MAX      | no   | no     | no     | 100     | Max requests per window per client           |

## 9. S3-compatible storage

| Variable             | Req? | Secret | Client | Example       | Description                       |
|----------------------|------|--------|--------|---------------|-----------------------------------|
| S3_ENDPOINT          | yes  | no     | no     | (provider URL)| S3-compatible endpoint            |
| S3_REGION            | yes  | no     | no     | us-east-1     | Region                            |
| S3_BUCKET            | yes  | no     | no     | avino-media   | Bucket for listing media          |
| S3_ACCESS_KEY_ID     | yes  | yes    | no     | (set)         | Access key                        |
| S3_SECRET_ACCESS_KEY | yes  | yes    | no     | (set)         | Secret key                        |
| S3_KEY_PREFIX        | no   | no     | no     | dev           | Per-env key namespace. Photos write to `{prefix}/listings/...`; **media cleanup sweeps only its own subtree** (§6.2). Empty default → flat `listings/...`. **If several environments SHARE one bucket, give each a distinct prefix** (e.g. local=`dev`, staging=`staging`, prod=`prod` or empty if it has its own bucket) — this is what makes orphan cleanup safe on a shared bucket. See ADR-0099. |

```text
- Listing photos are stored in S3, never on the app FS (DB_SCHEMA §6, ADR-008).
- EXIF/GPS is stripped during processing. Target upload path is presigned PUT.
- Read-path is unaffected by S3_KEY_PREFIX: storage_key stores the full key
  verbatim. Existing pre-prefix objects (`listings/...`) keep working and are
  never swept by a prefixed-environment cleanup (safe).
```

## 10. Yandex Maps

| Variable                       | Req? | Secret | Client | Example | Description                              |
|--------------------------------|------|--------|--------|---------|------------------------------------------|
| YANDEX_MAPS_API_KEY            | yes  | yes    | no     | (set)   | Server-side Yandex Maps / geocoder key   |
| NEXT_PUBLIC_YANDEX_MAPS_API_KEY| yes  | no     | yes    | (set)   | Browser key for the Yandex Maps JS API. Used by apps/client (public portal: `/map` draw-territory search + `/search` map) and apps/web (admin). Empty → map degrades to a hint, page still renders. |

```text
- Geo SEARCH (radius/bounds/near-me/clustering) is PostGIS on the backend
  (ARCHITECTURE §12); Yandex provides the map UI/geocoding only.
- apps/client loads the Yandex Maps JS API 2.1 client-side by this key
  (features/map/useYmaps). Без ключа карта показывает подсказку, не падает.
- YANDEX_MAPS_API_KEY также используется apps/api для серверного HTTP
  Геокодера (https://geocode-maps.yandex.ru/1.x/) — реверс-геокод адреса
  объявления в ru+en по координатам при create/update листинга
  (AddressResolverService, ADR-0147). Тот же ключ, что и для JS Maps API;
  entitlement на Геокодер отдельно от JS API, но у текущего ключа оба scope
  включены. Пустой ключ / недоступный геокодер → best-effort деградация:
  создание/правка объявления не блокируется, `address` заполняется строковым
  фолбэком `normalizeAddress(dto.address)`, `address_en` остаётся `null`.
```

## 11. Eskiz.uz (SMS)

| Variable        | Req? | Secret | Client | Example                       | Description                |
|-----------------|------|--------|--------|-------------------------------|----------------------------|
| ESKIZ_EMAIL     | yes  | yes    | no     | (set)                         | Eskiz account login        |
| ESKIZ_PASSWORD  | yes  | yes    | no     | (set)                         | Eskiz account password     |
| ESKIZ_BASE_URL  | no   | no     | no     | https://notify.eskiz.uz/api   | Eskiz API base URL         |
| ESKIZ_FROM      | no   | no     | no     | 4546                          | Sender ID. `4546`=test sender; prod=approved nickname/short-code (see GUIDE_SMS.md §4.2) |
| ESKIZ_ENABLED   | no   | no     | no     | true                          | env-дефолт master-тоггла SMS. Не задан → `true`. Перебивается `app_settings['sms_enabled']` (admin) |

```text
- Без ESKIZ_EMAIL/ESKIZ_PASSWORD SMS не отправляется: в dev код OTP пишется в
  лог, в prod — warn «provider is not configured» (мягкая деградация, ADR-0012).
- Production-отправка требует ОДОБРЕННОГО шаблона текста и sender'а в кабинете
  Eskiz — пошаговый runbook и troubleshooting в docs/GUIDE_SMS.md (ADR-0089).
- Master-тоггл SMS (runtime): app_settings['sms_enabled'] (admin GET/PATCH
  /admin/sms-settings) главнее env-дефолта ESKIZ_ENABLED. Выключен → запрос
  OTP·SMS отвечает 503 AUTH_PROVIDER_UNAVAILABLE (ADR-0090).
```

### 11.1 Google sign-in (TASK-195)

| Variable                    | Req? | Secret | Client | Example          | Description                                                       |
|-----------------------------|------|--------|--------|------------------|-------------------------------------------------------------------|
| GOOGLE_CLIENT_ID            | no   | no     | no     | (set)            | OAuth client id; verifies Google ID-token (`aud`). Empty → /auth/google returns 503 AUTH_PROVIDER_UNAVAILABLE |
| NEXT_PUBLIC_GOOGLE_CLIENT_ID| no   | no     | yes    | (same as above)  | Client-side id for GIS button (apps/client). Empty → button hidden |

```text
- ID-token верифицируется офлайн через google-auth-library; связывание аккаунта
  по верифицированному email (email_verified=true обязателен), логин=signup
  (ADR-0065). Значения опциональны на старте — без GOOGLE_CLIENT_ID вход через
  Google недоступен (503), остальной auth-флоу не затронут.
```

### 11.2 Apple sign-in (ADR-0097)

| Variable                        | Req? | Secret | Client | Example          | Description                                                                                                     |
|---------------------------------|------|--------|--------|------------------|-----------------------------------------------------------------------------------------------------------------|
| APPLE_CLIENT_ID                 | no   | no     | no     | (set)            | CSV Service ID(s) Apple — audience (`aud`) для верификации ID-token. Empty → /auth/apple returns 503 AUTH_PROVIDER_UNAVAILABLE |
| NEXT_PUBLIC_APPLE_CLIENT_ID     | no   | no     | yes    | (same as above)  | Service ID, отдаётся в браузер для Sign in with Apple JS. Пусто → кнопка Apple скрыта                         |
| NEXT_PUBLIC_APPLE_REDIRECT_URI  | no   | no     | yes    | https://avino.uz | HTTPS-origin портала, зарегистрированный в Service ID (return URL)                                             |

Как получить Service ID и куда положить значения — см. `docs/ICLOUD_SETUP.md`.

### 11.3 Telegram admin alerts (TASK-195)

| Variable                   | Req? | Secret | Client | Example       | Description                                                              |
|----------------------------|------|--------|--------|---------------|--------------------------------------------------------------------------|
| TELEGRAM_BOT_TOKEN         | no   | yes    | no     | (set)         | Bot API token. Empty → алерты в dev пишутся в лог, в prod не шлются       |
| TELEGRAM_ADMIN_CHAT_ID     | no   | no     | no     | 123456789     | Чат админа (получатель алертов)                                          |
| TELEGRAM_INCLUDE_OTP_CODE  | no   | no     | no     | true          | Включать ли сам OTP-код в алерт запроса (MVP). Default `true`            |
| TELEGRAM_NOTIFICATION_STATE| no   | no     | no     | (unset)       | env-дефолт master-флага. Не задан → **dev=true / prod=false**           |

```text
- TelegramService — config-gated (как sms/email): нет токена/chat_id → dev-лог
  `[DEV Telegram → admin]` (вне prod) / warn (prod). Доставка best-effort, сбой
  Telegram не ломает логин (ADR-0065).
- Master-флаг включённости двухслойный: строка app_settings
  ['telegram_notifications_enabled'] (runtime, через PATCH /admin/telegram-settings,
  ADMIN) главнее env-дефолта TELEGRAM_NOTIFICATION_STATE. Переключается без
  пересборки/редеплоя.
- Алерты: запрос OTP (с кодом, если TELEGRAM_INCLUDE_OTP_CODE), успешный вход
  (OTP/Google), неудачный verify (OTP_INVALID/EXPIRED/ATTEMPTS_EXCEEDED/USER_BLOCKED).
```

## 12. Translation (Google or Yandex)

| Variable           | Req? | Secret | Client | Example | Description                                 |
|--------------------|------|--------|--------|---------|---------------------------------------------|
| TRANSLATE_PROVIDER | yes  | no     | no     | yandex  | google \| yandex                            |
| TRANSLATE_API_KEY  | yes  | yes    | no     | (set)   | API key for the chosen translation provider |

```text
- Auto-translation runs AFTER a listing is ACTIVE and is processed by the
  translation_queue worker (DB_SCHEMA §6 listing_translations, ADR-005).
```

## 13. SMTP / Email

| Variable      | Req? | Secret | Client | Example             | Description                      |
|---------------|------|--------|--------|---------------------|----------------------------------|
| SMTP_HOST     | yes  | no     | no     | (provider host)     | SMTP server host                 |
| SMTP_PORT     | yes  | no     | no     | 587                 | SMTP port                        |
| SMTP_USER     | yes  | yes    | no     | (set)               | SMTP username                    |
| SMTP_PASSWORD | yes  | yes    | no     | (set)               | SMTP password                    |
| SMTP_FROM     | yes  | no     | no     | no-reply@avino.uz   | Default "from" address           |
| EMAIL_QUEUE_ATTEMPTS    | no | no | no | 3 | `email_queue` retry attempts per job (TASK-101) |
| EMAIL_QUEUE_CONCURRENCY | no | no | no | 2 | `email_queue` worker concurrency (TASK-101)     |

```text
- Email delivery is async via BullMQ `email_queue`: the worker performs the SMTP
  send (nodemailer) and logs the result. Without SMTP_HOST, email is logged in
  dev and not sent in production (ADR-0037, ARCHITECTURE §23).
```

### 13.1 Saved-search alerts (TASK-102)

| Variable                       | Req? | Secret | Client | Example       | Description                                              |
|--------------------------------|------|--------|--------|---------------|---------------------------------------------------------|
| SAVED_SEARCH_ALERT_CRON        | no   | no     | no     | `*/5 * * * *` | `check_saved_searches` repeatable cron (default 5 min)  |
| SAVED_SEARCH_ALERT_CONCURRENCY | no   | no     | no     | 1             | `saved_search_queue` worker concurrency                 |
| SAVED_SEARCH_ALERT_BATCH_SIZE  | no   | no     | no     | 100           | Saved searches processed per run                        |
| SAVED_SEARCH_ALERT_MAX_LISTINGS| no   | no     | no     | 50            | Alert cap per saved search per run (remainder next run) |

```text
- MVP matches saved searches via a polling worker (`saved_search_queue` /
  `check_saved_searches`): only ACTIVE listings whose published_at falls in the
  (last_checked_at, now] window trigger alerts; one digest email per search per
  run is queued via email_queue; last_checked_at is advanced each run
  (ADR-0038, ARCHITECTURE §16/§17/§23). All values have defaults.
```

## 14. Push / FCM (notifications)

> Stub for MVP per ADR-010 — wired up when the Flutter app integrates push.
> Add to `.env.example` at that time.

| Variable                  | Req? | Secret | Client | Example | Description                                   |
|---------------------------|------|--------|--------|---------|-----------------------------------------------|
| FCM_PROJECT_ID            | no   | no     | no     | (set)   | Firebase project id                           |
| FCM_SERVICE_ACCOUNT_JSON  | no   | yes    | no     | (path/json) | FCM service-account credential            |

```text
- MVP delivers EMAIL + IN_APP reliably; PUSH (FCM/APNs) is added with the
  mobile client (DB_SCHEMA §11 notification_devices, ADR-010).
```

## 15. CORS

> Enabled in `apps/api/src/main.ts` via `buildCorsOptions` (TASK-024,
> ARCHITECTURE §24). Origins come from `CORS_ORIGINS` only — never hardcoded.

| Variable      | Req? | Secret | Client | Example                                      | Description                                                              |
|---------------|------|--------|--------|----------------------------------------------|-------------------------------------------------------------------------|
| CORS_ORIGINS  | no¹  | no     | no     | http://localhost:3000,https://www.avino.uz   | Comma-separated allowed origins for the API. ¹dev-default http://localhost:3000; set explicitly in production. |

```text
- Empty/unset → dev-default http://localhost:3000 (the web admin's dev origin).
- Explicit allowlist only (no wildcard), required because credentials are
  enabled. The API exposes X-Request-Id and accepts Authorization/Content-Type.
- Parsing: apps/api/src/common/cors/cors.options.ts (parseCorsOrigins).
```

## 16. Payments

> Out of MVP scope (ADR-006 / ARCHITECTURE §10, §26). PaymentsModule is
> architecturally prepared; promotion is activated manually by admin
> (payment_status = NOT_REQUIRED). Add real keys only after a provider is
> confirmed (Phase 1.5).

| Variable         | Req? | Secret | Client | Example | Description                          |
|------------------|------|--------|--------|---------|--------------------------------------|
| PAYMENT_PROVIDER | no   | no     | no     | (none)  | Reserved; unset in MVP               |

## 17. Web (apps/web)

| Variable                        | Req? | Secret | Client | Example                | Description                            |
|---------------------------------|------|--------|--------|------------------------|----------------------------------------|
| NEXT_PUBLIC_API_BASE_URL        | yes  | no     | yes    | http://localhost:4000  | API base the web client calls (RTK Query baseApi) |
| NEXT_PUBLIC_YANDEX_MAPS_API_KEY | yes  | no     | yes    | (set)                  | Browser Yandex Maps key (see §10)      |

```text
- The web client talks to the API ONLY via RTK Query (ARCHITECTURE §20); the
  base URL comes from NEXT_PUBLIC_API_BASE_URL and is suffixed with /api/v1.
```

## 18. Swagger / OpenAPI

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SWAGGER_ENABLED` | no | `true` outside production, else `false` | Master flag. `true`/`false`. When `false`, no docs are mounted. |
| `SWAGGER_USER` | for internal docs | — | HTTP Basic-auth username for `/api/docs/internal*`. No default (secret). |
| `SWAGGER_PASS` | for internal docs | — | HTTP Basic-auth password for `/api/docs/internal*`. No default (secret). |

- Public docs: `GET /api/docs` (UI), `GET /api/docs-json` (raw OpenAPI).
- Internal docs (all controllers incl. `admin/*`): `GET /api/docs/internal`, `GET /api/docs/internal-json` — always behind Basic-auth; mounted only when both `SWAGGER_USER` and `SWAGGER_PASS` are set.
- The mobile team consumes `apps/api/openapi.public.json` for client codegen.

## 19. Gaps vs current .env.example

The current `.env.example` covers Node, API, CORS, DB, Redis, S3, Yandex, Eskiz,
Translation, SMTP, OTP/rate-limit, JWT and Web. The following are referenced by
ARCHITECTURE / API but are NOT yet in `.env.example` and should be added when
their module lands:

```text
- FCM_PROJECT_ID, FCM_SERVICE_ACCOUNT_JSON  (when push is implemented)    (§14)
```

These additions are non-breaking; this document should be updated in lockstep
with `.env.example`.
