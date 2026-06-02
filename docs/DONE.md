# DONE.md — Avino

Human-readable history of completed (merged) work.

Rules (see `docs/CLAUDE.md` → "Task tracking, DONE.md and ADR rules"):

- A task is added here **only after its PR is merged**.
- When a task is completed and merged, it is moved from `docs/TASKS.md` to this file.
- This log does **not** replace git history, Pull Requests, or ADR files.

Entry format:

```markdown
## YYYY-MM-DD

### TASK-XXX — Task title

Status: DONE
Branch: <branch-name>
PR: <PR link or PR number>

Files changed:
- <file-1>
- <file-2>

Summary:
- What was implemented
- Why it was needed
- Important notes

Commit messages:
- <commit message>

Related ADR:
- docs/adr/ADR-XXXX-short-title.md
```

---

## 2026-06-02

### TASK-DOCS-INIT — Initial project tracking documents (DONE.md + ADR)

Status: DONE
Branch: docs/initial-done-and-adr
PR: #12

Files changed:
- docs/DONE.md
- docs/adr/ADR-0001-project-stack.md
- docs/adr/ADR-0002-api-versioning-v1.md
- docs/adr/ADR-0003-postgis-prisma.md
- docs/adr/ADR-0004-vip-top-promotion-model.md

Summary:
- Initialized DONE.md as the human-readable log of merged work, with the entry format.
- Added 4 ADR records: project stack, API versioning v1, PostGIS via Prisma, VIP/TOP promotion model.
- Records existing decisions before coding starts — restates ARCHITECTURE.md §28, no architecture changed.

Commit messages:
- docs(adr): add initial architecture decisions

Related ADR:
- docs/adr/ADR-0001-project-stack.md
- docs/adr/ADR-0002-api-versioning-v1.md
- docs/adr/ADR-0003-postgis-prisma.md
- docs/adr/ADR-0004-vip-top-promotion-model.md

### TASK-010 — Initialize monorepo structure

Status: DONE
Branch: chore/monorepo-setup
PR: #14

Files changed:
- packages/config/package.json
- packages/config/tsconfig.base.json
- packages/config/prettier-preset.cjs
- packages/config/README.md
- packages/shared/package.json
- packages/shared/tsconfig.json
- pnpm-lock.yaml

Summary:
- Completed the M1 monorepo structure. The scaffold (apps/api, apps/web, packages/shared, root package.json, pnpm-workspace.yaml, docker-compose.yml, .env.example, .gitignore, README.md, docs/) already existed; the only acceptance-criteria gap was the missing packages/config package.
- Added @avino/config: a business-logic-free shared configuration package with a base tsconfig (tsconfig.base.json) and a Prettier preset (prettier-preset.cjs).
- Wired packages/shared to extend @avino/config/tsconfig.base.json and added @avino/config as a workspace:* devDependency, removing duplicated compiler options and proving the config package is consumed within the pnpm workspace.
- Verified: pnpm install links @avino/config; pnpm --filter @avino/shared build passes; prettier --check on new files passes. Note: apps/api lint failure (missing ESLint config) is pre-existing from the scaffold and out of scope.

Commit messages:
- chore(repo): add packages/config shared configuration package
- chore(shared): extend @avino/config base tsconfig

Related ADR:
- docs/adr/ADR-0001-project-stack.md (monorepo / pnpm / stack decision; mechanical structure completion, no new ADR required per TASKS.md Rule 4)

### TASK-011 — Add Docker infrastructure

Status: DONE
Branch: chore/docker-infrastructure
PR: #16

Files changed:
- docs/adr/ADR-0005-docker-infrastructure.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- All physical deliverables of TASK-011 (docker-compose.yml with postgis/postgis:16-3.4 and redis:7-alpine, .env.example with DATABASE_URL and REDIS_URL, README.md `pnpm infra:up` startup command, and the infra:up/infra:down scripts in package.json) already existed in main — they were added by the TASK-010 monorepo scaffold (commit 9d0ca01). All five acceptance criteria were therefore already met.
- The only outstanding gap was the missing decision record: added docs/adr/ADR-0005-docker-infrastructure.md formalizing the local Docker infrastructure (PostgreSQL/PostGIS + Redis, healthchecks, named volumes, env-driven ports/credentials, local-dev scope).
- No code or compose/env changes were made — the infrastructure was already present and verified against each acceptance criterion.

Commit messages:
- docs(adr): record local Docker infrastructure decision (TASK-011)

Related ADR:
- docs/adr/ADR-0005-docker-infrastructure.md

### TASK-012 — Add shared constants package

Status: DONE
Branch: chore/shared-constants (feature), chore/finalize-task-012 (DONE/ADR)
PR: #18 (feature), #19 (DONE/ADR finalization)

Files changed:
- packages/shared/src/enums.ts
- packages/shared/src/constants.ts
- packages/shared/src/index.ts
- docs/adr/ADR-0004-vip-top-promotion-model.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added `PromotionType` enum and a new `constants.ts` module to the shared package (`@avino/shared`) so backend (apps/api) and frontend (apps/web) consume one source of enum-like codes: roles, languages, listing statuses, property/deal types, currencies, and promotion types.
- `enums.ts` now holds only enum definitions; derived collections (`USER_ROLES`, `SUPPORTED_LANGUAGES`, `LISTING_STATUSES`, `MVP_LISTING_STATUSES`, `PROPERTY_TYPES`, `DEAL_TYPES`, `SUPPORTED_CURRENCIES`, `PROMOTION_TYPES`, `PAID_PROMOTION_TYPES`) and defaults (`DEFAULT_LANGUAGE`, `DEFAULT_CURRENCY`, `DEFAULT_PROMOTION_TYPE`) live in `constants.ts`.
- Aligned `PromotionType` with ADR-0004 by including `NORMAL` (priority VIP > TOP > NORMAL); the merged feature PR initially shipped only VIP/TOP. No backend logic — data only.

Commit messages:
- chore(shared): add common constants and enums
- chore(shared): align PromotionType with ADR-0004 (add NORMAL)

Related ADR:
- docs/adr/ADR-0004-vip-top-promotion-model.md (updated: linked shared enum/constants and TASK-012)

### TASK-020 — Initialize NestJS API app

Status: DONE
Branch: feat/api-foundation
PR: #21

Files changed:
- apps/api/src/app.controller.ts
- apps/api/src/app.service.ts
- apps/api/src/app.module.ts
- docs/TASKS.md
- docs/DONE.md

Summary:
- The bootable NestJS app (apps/api/package.json, src/main.ts, src/app.module.ts, nest-cli.json, tsconfig.json) already existed in main — it was added by the TASK-010 monorepo scaffold (commit 9d0ca01). The app already starts, uses TypeScript, and has no business modules, satisfying all three acceptance criteria.
- The only gap versus TASK-020's expected files was the standard root controller/service: added src/app.controller.ts (`@Controller()` → GET /api/v1) and src/app.service.ts (returns service/status/apiVersion), and registered both in app.module.ts (AppController in controllers, AppService in providers).
- Verified: `pnpm --filter @avino/api build` passes; the app starts and `GET /api/v1` returns `{service:"avino-api",status:"ok",apiVersion:"v1"}`, `GET /api/v1/health` returns ok, and unversioned `GET /health` returns 404.
- No new ADR required — the NestJS stack decision is already recorded in ADR-0001 (project stack). Versioning groundwork present in main.ts predates this task and is finalized under TASK-021.
- Note: `pnpm lint` fails repo-wide because no ESLint config exists yet (pre-existing gap, not introduced here); deferred to a dedicated tooling task.

Commit messages:
- feat(api): add root AppController and AppService

Related ADR:
- docs/adr/ADR-0001-project-stack.md

### TASK-021 — Add API versioning and global prefix

Status: DONE
Branch: feat/api-versioning
PR: #22

Files changed:
- apps/api/src/health/health.controller.ts (moved from apps/api/src/health.controller.ts)
- apps/api/src/health/health.module.ts
- apps/api/src/app.module.ts
- docs/adr/ADR-0002-api-versioning-v1.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Global `api` prefix and URI-based versioning (`defaultVersion: '1'`) already existed in `main.ts` from the TASK-010 scaffold (commit 9d0ca01), so two of the four acceptance criteria were already met. `main.ts` was left unchanged.
- Refactored the placeholder root `health.controller.ts` into a proper `health/` module: moved the controller into `apps/api/src/health/health.controller.ts` (via `git mv`, preserving history) and added `apps/api/src/health/health.module.ts`, matching the task's expected file layout.
- Made the version explicit on the health controller (`@Controller({ path: 'health', version: '1' })`) per CLAUDE.md §14, and registered `HealthModule` in `app.module.ts` (removed the direct `HealthController` registration).
- Verified: `pnpm --filter @avino/api build` passes; `GET /api/v1/health` → `{status:"ok",service:"avino-api"}`; `GET /api/v1` → ok; both routes log `version: 1`; unversioned `GET /health` and `GET /api/health` return 404 — no unversioned routes exist.
- No new ADR — ADR-0002 already records the versioning decision; updated it to link the implementation files and TASK-021.

Commit messages:
- feat(health): move health endpoint into versioned HealthModule

Related ADR:
- docs/adr/ADR-0002-api-versioning-v1.md (updated: linked implementation files and TASK-021)

### TASK-022 — Add config and validation foundation

Status: DONE
Branch: feat/api-config-validation
PR: #23

Files changed:
- apps/api/src/config/config.module.ts
- apps/api/src/config/configuration.ts
- apps/api/src/config/env.validation.ts
- apps/api/src/config/index.ts
- apps/api/src/common/validation/validation.options.ts
- apps/api/src/app.module.ts
- apps/api/src/main.ts
- apps/api/package.json
- .env.example
- docs/adr/ADR-0006-config-and-validation.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added a global config foundation under `apps/api/src/config/`: `AppConfigModule` wraps `ConfigModule.forRoot` (`isGlobal`, `cache`, `envFilePath: ['../../.env', '.env']`), replacing the inline `ConfigModule.forRoot` previously in `app.module.ts`.
- Env validation (`env.validation.ts`) via `class-validator` + `class-transformer` runs on boot (fail-fast): `DATABASE_URL` and `REDIS_URL` are required; S3/Yandex/Eskiz/Translate/SMTP groups are optional until wired in. Numeric vars carry explicit type annotations so `enableImplicitConversion` parses string env values correctly.
- Typed namespaced config (`configuration.ts`) via `registerAs` (`app`, `database`, `redis`, `s3`, `maps`, `sms`, `translate`, `mail`), loaded through `ConfigModule`'s `load`; `main.ts` now reads the port via `ConfigService.get('app.port')`.
- Global `ValidationPipe` enabled in `main.ts` with options centralized in `common/validation/validation.options.ts`: `whitelist`, `forbidNonWhitelisted`, `transform`, `transformOptions.enableImplicitConversion`.
- `.env.example` annotated to mark required vs optional groups, matching the validation contract.
- Added runtime deps `class-validator@^0.14.1` and `class-transformer@^0.5.1` to `@avino/api`.
- Verified: `pnpm --filter @avino/api build` passes; app boots reading port from config, `GET /api/v1/health` → `{status:"ok",service:"avino-api"}`, unversioned `GET /health` → 404; fail-fast confirmed — missing `DATABASE_URL`/`REDIS_URL` or out-of-range `API_PORT` aborts startup with a clear error.
- Note: `pnpm --filter @avino/api lint` still fails repo-wide because no ESLint config exists yet (pre-existing gap from TASK-021, not introduced here).

Commit messages:
- feat(config): add environment configuration and validation
- feat(api): add global validation pipe

Related ADR:
- docs/adr/ADR-0006-config-and-validation.md

---

### TASK-023 — Add response and error format

Status: DONE
Branch: feat/api-error-format
PR: #25

Files changed:
- apps/api/src/common/dto/error-response.dto.ts
- apps/api/src/common/filters/all-exceptions.filter.ts
- apps/api/src/common/interceptors/request-id.interceptor.ts
- apps/api/src/common/validation/validation.options.ts
- apps/api/src/main.ts
- docs/adr/ADR-0007-api-error-envelope.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added a unified API error envelope foundation under `apps/api/src/common/`, implementing docs/API.md §4 ("Error format") and §17 ("Error catalog"). Error shape is identical for web (RTK Query) and the future Flutter client (CLAUDE.md §3, §18).
- `common/dto/error-response.dto.ts` defines the envelope types (`ApiErrorResponse`, `ApiErrorBody`, `ApiErrorDetail`) and the `ApiErrorCode` enum mirroring the API.md §17 catalog (stable UPPERCASE codes, part of the contract).
- `common/filters/all-exceptions.filter.ts` is a global `@Catch()` filter rendering every exception as `{ error: { code, message, details?, request_id } }`. It uses an explicit `{ code, message, details }` payload when present, otherwise derives `code` from the HTTP status (e.g. `401 → UNAUTHORIZED`, `404 → NOT_FOUND`) with a stable fallback to the status name. Any non-`HttpException` and any `5xx` becomes `500 INTERNAL_ERROR` with a generic message; the real cause is logged server-side only and never leaks.
- `common/validation/validation.options.ts` now sets an `exceptionFactory` that flattens the `class-validator` error tree into `details: [{ field, issue }]` (nested DTO fields become dotted paths, e.g. `address.city`) and throws a structured `VALIDATION_ERROR`, matching API.md §4 exactly.
- `common/interceptors/request-id.interceptor.ts` assigns each request a `request_id` (reuses an incoming `X-Request-Id` header or generates a UUID) and echoes it via the `X-Request-Id` response header; the filter falls back to the incoming header so not-found / guard-rejected paths stay correlated.
- `main.ts` wires the interceptor, the validation pipe, and the filter globally. Success responses are intentionally NOT wrapped (documented bare-object / `{ data, meta }` shapes are produced per-endpoint); only the `X-Request-Id` header is added on success.
- Verified: `pnpm --filter @avino/api build` and `tsc --noEmit` pass; app boots and `GET /api/v1/health` → 200 with `X-Request-Id` header; unknown route → `{"error":{"code":"NOT_FOUND",...,"request_id":...}}`; an incoming `X-Request-Id` is echoed back; `validationPipeOptions.exceptionFactory` produces the documented `VALIDATION_ERROR` + `details` shape (incl. nested `address.city`).
- Note: `pnpm --filter @avino/api lint` still fails repo-wide because no ESLint config exists yet (pre-existing gap from TASK-021, not introduced here).

Commit messages:
- feat(api): add standard error handling
- feat(api): add response formatting foundation

Related ADR:
- docs/adr/ADR-0007-api-error-envelope.md

---

### TASK-030 — Add Prisma foundation

Status: DONE
Branch: feat/prisma-foundation
PR: #26

Files changed:
- apps/api/prisma/schema.prisma
- apps/api/src/prisma/prisma.module.ts
- apps/api/src/prisma/prisma.service.ts
- apps/api/src/prisma/index.ts
- apps/api/src/app.module.ts
- docs/adr/ADR-0003-postgis-prisma.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the Prisma runtime foundation for `apps/api` so future feature modules (users, listings, chat) can inject a database client. `@prisma/client` / `prisma` were already in `package.json` and `schema.prisma` already declared the `postgresqlExtensions` preview feature + `postgis` extension (ADR-0003); this task adds the NestJS integration layer.
- `apps/api/src/prisma/prisma.service.ts` extends `PrismaClient` and owns the connection lifecycle: `onModuleInit` calls `$connect` (fail-fast on startup), `onModuleDestroy` calls `$disconnect`. Logs connect/disconnect via Nest `Logger`.
- `apps/api/src/prisma/prisma.module.ts` is `@Global()` and exports `PrismaService`, mirroring the global `AppConfigModule` (ADR-0006) so it is injectable everywhere without re-import. `index.ts` is a barrel matching the `config/` convention.
- `app.module.ts` imports `PrismaModule` (after `AppConfigModule`, before `HealthModule`).
- `schema.prisma` gained a temporary `HealthCheck` placeholder model. Prisma refuses to generate a client with zero models, and the foundation must be generatable before any domain model exists (acceptance criterion "Prisma client can be generated"). The placeholder is commented for removal in TASK-033 (first real model — users). Decision confirmed by Team Lead per CLAUDE.md §2/§13.
- `DATABASE_URL` is already documented in `.env.example` (`postgresql://avino:avino@localhost:5432/avino?schema=public`) — no change needed there.
- Verified: `pnpm prisma generate` → "Prisma Client generated"; `pnpm build` (`nest build`) passes; `npx eslint` on the new files exits clean.

Commit messages:
- feat(db): add Prisma foundation

Related ADR:
- docs/adr/ADR-0003-postgis-prisma.md

## 2026-06-03

### TASK-033 — Add users and roles schema

Status: DONE
Branch: feat/db-users-roles
PR: #29

Files changed:
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260603130000_add_users_and_roles/migration.sql
- apps/api/prisma/seed.ts
- apps/api/package.json
- docs/adr/ADR-0009-users-roles-schema.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the core identity schema (DB_SCHEMA §4) as the first table migration:
  `users`, `user_profiles` (1:1, `user_id` UNIQUE, ON DELETE CASCADE), `roles`
  (seeded dictionary, `code` UNIQUE) and `user_roles` (M:N, `@@unique([userId,
  roleId])`, indexes on `userId`/`roleId`). Removed the temporary `HealthCheck`
  placeholder model (TASK-030).
- `phone`/`email` are intentionally NOT `@unique` in Prisma: uniqueness is scoped
  to non-DELETED accounts via PARTIAL UNIQUE indexes (`uniq_users_phone_active`,
  `uniq_users_email_active`) appended as raw SQL — the same pattern as the future
  PostGIS GIST index (ADR-0003/ADR-0009, Variant A). This lets a soft-deleted
  account free its contact for re-registration while preserving the value on the
  deleted row.
- Two CHECK constraints added as raw SQL (Prisma cannot express them):
  `users_contact_present_check` (phone OR email present) and
  `users_deleted_at_consistency_check` (`deleted_at` set iff status = DELETED).
- All timestamps use `@db.Timestamptz(6)` to honour DB_SCHEMA §2 (timestamptz in
  UTC), departing from Prisma's default `timestamp(3)`.
- The migration does NOT re-create the pgcrypto/postgis/pg_trgm extensions
  (owned by the baseline migration TASK-031) but, as the first table migration,
  it creates all declared enum types (incl. not-yet-used ListingStatus,
  PromotionType, Currency) so schema and migration history stay in sync.
- `prisma/seed.ts` (idempotent `upsert` by `code`) seeds the 8 roles from
  DB_SCHEMA §3 (USER, OWNER, AGENT, AGENCY, LANDLORD, PROPERTY_MANAGER,
  MODERATOR, ADMIN); GUEST is intentionally not seeded (ADR-0008). Role codes are
  sourced from `@avino/shared` `UserRole` to avoid drift. Seed wired via
  `prisma.seed` in `apps/api/package.json`.
- Verified against the project's `postgis/postgis:16-3.4` container: `prisma
  validate` passes; `prisma migrate deploy` applies both migrations cleanly;
  drift check shows no table/enum/constraint drift (only the known
  postgresqlExtensions-preview false-positive re-emitting CREATE EXTENSION);
  `prisma db seed` seeds 8 roles; `nest build` passes; `prettier --check` clean.
  Constraint smoke test confirmed: missing-contact INSERT rejected, duplicate
  ACTIVE phone rejected, soft-delete then re-register with the same phone
  succeeds, and DELETED-without-`deleted_at` rejected.

Commit messages:
- feat(db): add users and roles schema
- feat(db): seed default roles

Related ADR:
- docs/adr/ADR-0009-users-roles-schema.md

### TASK-031 — Add PostgreSQL extensions migration

Status: DONE
Branch: feat/db-extensions
PR: #27

Files changed:
- apps/api/prisma/migrations/20260603120000_enable_extensions/migration.sql
- apps/api/prisma/migrations/migration_lock.toml
- apps/api/prisma/schema.prisma
- docs/adr/ADR-0003-postgis-prisma.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the baseline raw SQL migration that enables the three PostgreSQL extensions the schema depends on: `pgcrypto` (gen_random_uuid() for every `id uuid` PK — DB_SCHEMA §2), `postgis` (geography(Point,4326) + GIST geo search — ADR-0003) and `pg_trgm` (GIN trigram ILIKE text search — ARCHITECTURE §12). Each uses `CREATE EXTENSION IF NOT EXISTS`, so the migration is idempotent and safe to re-run.
- This is the first migration directory in the project; it ships with `migration_lock.toml` (`provider = "postgresql"`). It must run before any table migration so the uuid/geo/trgm primitives exist when domain tables land (TASK-032+).
- Declared all three extensions in `schema.prisma` `datasource db.extensions = [pgcrypto, postgis, pg_trgm]` (postgresqlExtensions preview feature) so the declarative schema matches the migration and Prisma reports no drift. Previously only `postgis` was declared.
- Applied with `prisma migrate deploy` rather than `prisma migrate dev`, because the schema still carries the temporary `HealthCheck` placeholder (TASK-030) which must not leak into the first table migration (removed in TASK-033).
- Verified against the project's `postgis/postgis:16-3.4` container: migration applied cleanly (`_prisma_migrations` shows 1 finished migration); `SELECT extname FROM pg_extension` returns pgcrypto, postgis, pg_trgm; smoke test confirms `gen_random_uuid()`, `postgis_version()` and the `%` trigram operator all work; `prisma validate` passes and `prisma generate` succeeds.

Commit messages:
- feat(db): add PostgreSQL extensions

Related ADR:
- docs/adr/ADR-0003-postgis-prisma.md

### TASK-032 — Add core enums to Prisma

Status: DONE
Branch: feat/db-core-enums
PR: #28

Files changed:
- apps/api/prisma/schema.prisma
- packages/shared/src/enums.ts
- packages/shared/src/constants.ts
- docs/adr/ADR-0008-core-domain-enums.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the four core Postgres enums to `apps/api/prisma/schema.prisma` as Prisma `enum` blocks: `ListingStatus` (NEW | ACTIVE | DRAFT | REJECTED | DELETED | ARCHIVED | SOLD | RENTED), `PromotionType` (NORMAL | TOP | VIP), `Currency` (UZS | USD) and `Language` (UZ | RU | EN). Values mirror DB_SCHEMA §3 exactly and are part of the v1 contract (adding a value is non-breaking; rename/remove requires v2 — ADR-0002).
- `Role` is intentionally NOT a Postgres enum: roles are a seeded `roles` dictionary with a many-to-many `user_roles` join (DB_SCHEMA §4), so they extend without a migration. Documented in the schema header and ADR-0008. `GUEST` is the implicit unauthenticated state (not stored, not a role code — ADR-011).
- Fixed lower/upper-case conflicts in `packages/shared/src/enums.ts` so shared enums match the API.md JSON contract: `Language` values `'uz'|'ru'|'en'` → `'UZ'|'RU'|'EN'` (lowercase `uz|ru|en` remains only the `Accept-Language`/`?lang` convention, mapped to the enum); `UserRole` values lowercased → UPPERCASE (`"roles": ["USER"]`). Renamed enum `CURRENCY` → `Currency` for PascalCase consistency and updated all `constants.ts` references.
- Verified: `prisma validate` passes (schema valid against the project schema); `tsc --noEmit` on `packages/shared` passes; `prettier --check` clean on all changed TS/Prisma files. No external consumers of the renamed/recased symbols exist outside `constants.ts`. Postgres enum types are declared now and will be created by migration when the first model references them (listings — TASK-035).

Commit messages:
- feat(db): add core enums
- feat(shared): align shared enums with database

Related ADR:
- docs/adr/ADR-0008-core-domain-enums.md

### TASK-034 — Add auth schema

Status: DONE
Branch: feat/db-auth-schema
PR: #30

Files changed:
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260603140000_add_auth_tokens/migration.sql
- docs/adr/ADR-0010-auth-token-schema.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the auth token storage for OTP-based login (DB_SCHEMA §4): models `OtpCode` (`otp_codes`) and `RefreshToken` (`refresh_tokens`) in `apps/api/prisma/schema.prisma`, plus two new Postgres enums `OtpChannel` (SMS | EMAIL) and `OtpPurpose` (LOGIN). `users` has no password column — auth is OTP → access/refresh session (ARCHITECTURE §6, ADR-0009).
- Secrets are stored HASHED, never plaintext: `otp_codes.code_hash` and `refresh_tokens.token_hash` are `VARCHAR(255)` and there is no `code`/`token` column at all, so a DB dump cannot be replayed to log in. `attempts SMALLINT` supports lockout after N failed verifications; rate limiting (per destination, per IP) lives in the service layer.
- Refresh tokens rotate on use and are grouped by `family_id`; reuse of an already-rotated token is meant to revoke the whole family (reuse detection), with the mechanism in the service layer and the storage + `family_id` index provided here. `otp_codes.user_id` is nullable (a code can be issued pre-signup, since OTP login doubles as registration); `refresh_tokens.user_id` is NOT NULL. Both FKs are `ON DELETE CASCADE`.
- Lookup indexes per DB_SCHEMA §4: `otp_codes` on `(destination, purpose)` and `(expires_at)`; `refresh_tokens` on `(user_id)`, `(token_hash)` and `(family_id)`. All timestamps use `@db.Timestamptz(6)` (UTC), consistent with ADR-0009.
- Migration `20260603140000_add_auth_tokens` creates the two enum types (first migration to reference them), both tables, indexes and FKs; it does not re-create the core enums (owned by the users/roles migration). Verified against the project's `postgis/postgis` container: `prisma validate` and `prisma format` clean, `prisma generate` succeeds, `prisma migrate deploy` applied the migration, and `\d otp_codes` / `\d refresh_tokens` confirm all columns (code_hash/token_hash present, no plaintext column), the five lookup indexes, the cascade FKs, and the `OtpChannel`/`OtpPurpose` enum values.

Commit messages:
- feat(db): add auth token schema

Related ADR:
- docs/adr/ADR-0010-auth-token-schema.md

### TASK-035 — Add listings schema with PostGIS

Status: DONE
Branch: feat/db-listings-postgis
PR: pending

Files changed:
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260603150000_add_listings/migration.sql
- docs/adr/ADR-0003-postgis-prisma.md
- docs/adr/ADR-0008-core-domain-enums.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the `Listing` model (`listings`) — the listing core schema (DB_SCHEMA §6). Non-translatable structured fields live here; translatable text (TASK-036), promotions ledger (TASK-037) and engagement (TASK-038) follow in later M3 tasks. Two new Postgres enums `TransactionType` (SALE | RENT) and `PropertyType` (APARTMENT | HOUSE | NEW_BUILDING | LAND | COMMERCIAL) are introduced here — `listings` is the first model to reference them; the core enums (TASK-032) are not re-created.
- Geo (ADR-0003, DB_SCHEMA §14): `latitude`/`longitude` are editable `Decimal(9,6)` source columns; `location` is `Unsupported("geography(Point, 4326)")` — derived, not written through Prisma. A `BEFORE INSERT/UPDATE OF latitude, longitude` trigger (`listings_sync_location_trg` → `listings_sync_location()`) keeps `location` in sync in the same write so it cannot drift; NULL coords yield NULL location. The `GIST` index `idx_listings_location` is created via raw SQL (Prisma migrate does not emit GIST on `Unsupported` columns). This realizes the trigger option ADR-0003 left open.
- Promotion read-cache fields (`promotion_type` default NORMAL, `promotion_started_at`, `promotion_expires_at`) are a denormalized cache for sort/filter; the source of truth is `listing_promotions` (TASK-037, ADR-0004). `status` defaults to NEW (moderation entry state). `owner_id` → `users` is `ON DELETE RESTRICT` (accounts are soft-deleted — ADR-013 — so a listing always keeps a valid creator). Indexes match §6, including the composite default-search index `(status, promotion_type, created_at DESC, id DESC)`. CHECK constraints `price >= 0` and `area IS NULL OR area >= 0` (DB_SCHEMA §15).
- `agency_id` / `city_id` / `district_id` are FK columns per §6, but the `agencies`/`cities`/`districts` tables do not exist yet. They are created as indexed UUID columns WITHOUT a FK constraint or Prisma relation; the constraints and relation fields will be added when those target tables land in their own tasks. Documented in the model header and ADR-0003.
- Decision flagged for Team Lead: `PropertyType` here follows DB_SCHEMA §3 (5 values incl. `NEW_BUILDING`), but `packages/shared/src/enums.ts` currently has 4 values (no `NEW_BUILDING`) and names the deal enum `DealType` rather than `TransactionType`. The Prisma/DB layer follows the authoritative §3 contract; reconciling the shared TS enums (add `NEW_BUILDING`, align `DealType` → `TransactionType` naming) is left to a separate task to avoid mixing a frontend-contract change into this DB PR (CLAUDE.md §2/§5).
- Verified against the project's `postgis/postgis:16-3.4` container: `prisma validate`, `prisma format` and `prisma generate` clean; `prettier --check` clean on the schema; `prisma migrate deploy` applied `20260603150000_add_listings`; `prisma migrate status` → "up to date". DB introspection confirms all 26 columns with correct types, all 11 btree indexes + the GIST index + the FK + both CHECK constraints + the sync trigger. Smoke test: inserting a listing with lat/lng auto-populated `location` (SRID 4326, exact coords), `ST_DWithin` radius search returned the row, and a negative `price` insert was rejected by the CHECK constraint.

Commit messages:
- feat(db): add listings schema
- feat(db): add PostGIS listing location index

Related ADR:
- docs/adr/ADR-0003-postgis-prisma.md
- docs/adr/ADR-0008-core-domain-enums.md
