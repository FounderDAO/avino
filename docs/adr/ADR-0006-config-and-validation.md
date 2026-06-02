# ADR-0006 — Configuration loading and global validation

## Status

Accepted

## Date

2026-06-02

## Context

The API needs a single, reliable way to load configuration and to validate
incoming request payloads from the first feature onward:

- **Environment configuration.** Avino depends on required infrastructure from
  day one — PostgreSQL/PostGIS (`DATABASE_URL`) and Redis (`REDIS_URL`) — plus
  several integrations that are optional at the start of the project (S3,
  Yandex Maps, Eskiz, Translate, SMTP). Misconfiguration must fail at boot, not
  at the first request, and config access should be typed rather than scattered
  `process.env` reads.
- **Request validation.** The backend must stay client-neutral (web + future
  Flutter app, CLAUDE.md §3). DTO validation has to be consistent and strict
  across every endpoint, and must not silently accept unknown fields.

The TASK-010 scaffold already registered `ConfigModule.forRoot({ isGlobal })`
in `app.module.ts`, but without env validation, typed config, or a global
`ValidationPipe`.

## Decision

1. **Global config module.** Introduce `apps/api/src/config/` with a dedicated
   `AppConfigModule` that wraps `ConfigModule.forRoot` (`isGlobal: true`,
   `cache: true`, `envFilePath: ['../../.env', '.env']`). `ConfigService` is
   available everywhere without re-importing.
2. **Env validation (fail-fast).** A `validate` callback
   (`env.validation.ts`) uses `class-validator` + `class-transformer` to check
   the environment on boot. `DATABASE_URL` and `REDIS_URL` are required; the
   remaining integration groups are optional until their services are wired in.
   Numeric vars carry explicit type annotations so `enableImplicitConversion`
   converts string env values correctly. Invalid configuration throws before
   the app starts listening.
3. **Typed namespaced config.** `configuration.ts` exposes `registerAs`
   namespaces (`app`, `database`, `redis`, `s3`, `maps`, `sms`, `translate`,
   `mail`) loaded via `ConfigModule`'s `load`, so config is read as
   `configService.get('app.port')` instead of raw `process.env`.
4. **Global ValidationPipe.** `main.ts` registers a global `ValidationPipe`
   with options centralized in `apps/api/src/common/validation/validation.options.ts`:
   `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`,
   `transformOptions.enableImplicitConversion: true`. Unknown fields are
   rejected; payloads are transformed to their DTO types.
5. **`.env.example`** documents all variable groups and marks which are required
   vs optional, matching the validation contract.

## Consequences

Positive:

- Misconfiguration is caught at boot with a clear message instead of failing
  later at runtime.
- Config access is typed and centralized; no ad-hoc `process.env` reads.
- Every endpoint inherits strict, consistent input validation, keeping the API
  contract clean for web and the future Flutter client.
- Optional integrations don't block local startup, so the project can grow
  incrementally.

Negative / trade-offs:

- `class-validator` / `class-transformer` are added as runtime dependencies.
- Required vars (`DATABASE_URL`, `REDIS_URL`) must be present for the app to
  boot — intentional, but means a `.env` (copied from `.env.example`) is
  mandatory for local dev.
- Numeric env vars must keep explicit TypeScript type annotations for implicit
  conversion to work; this is a small footgun to remember when adding new vars.

## Related files

- apps/api/src/config/config.module.ts
- apps/api/src/config/configuration.ts
- apps/api/src/config/env.validation.ts
- apps/api/src/config/index.ts
- apps/api/src/common/validation/validation.options.ts
- apps/api/src/app.module.ts
- apps/api/src/main.ts
- apps/api/package.json (class-validator, class-transformer)
- .env.example
- docs/adr/ADR-0005-docker-infrastructure.md

## Related task

- TASK-022 — Add config and validation foundation
