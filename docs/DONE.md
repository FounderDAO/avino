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
