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

```text
- Listing photos are stored in S3, never on the app FS (DB_SCHEMA §6, ADR-008).
- EXIF/GPS is stripped during processing. Target upload path is presigned PUT.
```

## 10. Yandex Maps

| Variable                       | Req? | Secret | Client | Example | Description                              |
|--------------------------------|------|--------|--------|---------|------------------------------------------|
| YANDEX_MAPS_API_KEY            | yes  | yes    | no     | (set)   | Server-side Yandex Maps / geocoder key   |
| NEXT_PUBLIC_YANDEX_MAPS_API_KEY| yes  | no     | yes    | (set)   | Browser key for the web map (apps/web)   |

```text
- Geo SEARCH (radius/bounds/near-me/clustering) is PostGIS on the backend
  (ARCHITECTURE §12); Yandex provides the map UI/geocoding only.
```

## 11. Eskiz.uz (SMS)

| Variable        | Req? | Secret | Client | Example                       | Description                |
|-----------------|------|--------|--------|-------------------------------|----------------------------|
| ESKIZ_EMAIL     | yes  | yes    | no     | (set)                         | Eskiz account login        |
| ESKIZ_PASSWORD  | yes  | yes    | no     | (set)                         | Eskiz account password     |
| ESKIZ_BASE_URL  | no   | no     | no     | https://notify.eskiz.uz/api   | Eskiz API base URL         |

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

> Required by `ARCHITECTURE.md` §23/§24 but NOT yet in `.env.example` — add it.

| Variable      | Req? | Secret | Client | Example                                      | Description                                  |
|---------------|------|--------|--------|----------------------------------------------|----------------------------------------------|
| CORS_ORIGINS  | yes  | no     | no     | http://localhost:3000,https://www.avino.uz   | Comma-separated allowed origins for the API  |

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

## 18. Gaps vs current .env.example

The current `.env.example` covers Node, API, DB, Redis, S3, Yandex, Eskiz,
Translation, SMTP and Web. The following are referenced by ARCHITECTURE / API
but are NOT yet in `.env.example` and should be added when their module lands:

```text
- JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_TTL, JWT_REFRESH_TTL  (§7)
- OTP_TTL, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN, RATE_LIMIT_*            (§8)
- CORS_ORIGINS                                                            (§15)
- FCM_PROJECT_ID, FCM_SERVICE_ACCOUNT_JSON  (when push is implemented)    (§14)
```

These additions are non-breaking and can be made together with AuthModule and
the CORS/security setup; this document should be updated in lockstep with
`.env.example`.
