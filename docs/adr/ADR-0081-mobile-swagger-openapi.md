# ADR-0081 — Swagger/OpenAPI for mobile app integration (two gated documents)

## Status

Accepted

## Date

2026-06-15

## Context

A mobile app team needs to integrate with the Avino API. The backend is NestJS 10
(Express adapter) with `class-validator` DTOs, URI versioning (`/api/v1/...`), a
global `ValidationPipe`, a unified error envelope (`AllExceptionsFilter`), and JWT
auth (OTP + Google + refresh). The API must stay client-neutral and compatible with
a future Flutter client (CLAUDE.md §3).

We needed a way to "hand over Swagger" that (a) does not drift from the code, (b)
gives the mobile team both an interactive UI and a machine-readable artifact for
typed-client codegen, and (c) does not expose the admin API surface publicly while
the API runs in production.

This is complementary to TASK-170 (`docs/MOBILE_API_GUIDE.md`, a human-readable
flow guide): this ADR covers the machine-readable contract, not the narrative guide.

## Decision

Generate OpenAPI from the existing controllers/DTOs with **`@nestjs/swagger`** (CLI
plugin enabled in `nest-cli.json`) — no hand-written YAML. Expose **two documents**:

- **Public** (`GET /api/docs`, `GET /api/docs-json`) — for the mobile app. Built with
  module `include` of public modules AND pruned to an explicit path allowlist
  (`PUBLIC_PATH_PREFIXES`), so `admin/*` and `roles` can never leak even if Swagger
  traverses an imported module.
- **Internal** (`GET /api/docs/internal`, `GET /api/docs/internal-json`) — all
  controllers; always behind HTTP Basic-auth (`express-basic-auth`).

Exposure is gated: `SWAGGER_ENABLED` (default `true` outside production, `false` in
production) controls mounting; internal docs mount only when both `SWAGGER_USER` and
`SWAGGER_PASS` are set (fail-closed, no secret defaults). The bearer scheme is defined
globally; the error envelope is published as a reusable `ErrorResponseDto` schema via
`extraModels`.

A standalone script (`pnpm --filter @avino/api openapi:export`, NestFactory preview
mode — no DB/Redis connections) regenerates committed `openapi.public.json` and
`openapi.internal.json`; CI fails on drift. The public artifact is what the mobile
team feeds into client codegen.

Phase 1 (this change) intentionally touches **zero controllers**. Per-route
`@ApiBearerAuth()` accuracy and fully-typed response DTOs are deferred to Phase 2.

## Consequences

Positive:
- Spec is generated from code and guarded against drift by a CI check.
- Admin/roles routes are double-excluded from the public document (module include +
  path allowlist), verified by a contract test against the generated artifact.
- Internal docs never exposed without explicit Basic-auth credentials.
- Mobile team gets both an interactive UI and a codegen-ready `openapi.public.json`.
- No controller/business-logic changes — low merge-conflict footprint.

Negative / trade-offs:
- Until Phase 2, response bodies are loosely typed and endpoints are not individually
  marked as secured (the global bearer scheme still powers the "Authorize" button).
- Two committed JSON artifacts must be regenerated when the API surface changes
  (enforced by CI, excluded from prettier).
- The export script requires the four `@IsNotEmpty` env vars to be *set* (not live):
  `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`.

## Related files

- `apps/api/src/common/openapi/` (gating, documents, error DTOs, setup, barrel)
- `apps/api/src/scripts/export-openapi.ts`
- `apps/api/openapi.public.json`, `apps/api/openapi.internal.json`
- `apps/api/src/main.ts`, `apps/api/nest-cli.json`
- `apps/api/src/config/configuration.ts`, `apps/api/src/config/env.validation.ts`
- `.github/workflows/ci.yml`, `docs/ENV.md`, `.prettierignore`
- Spec: `docs/superpowers/specs/2026-06-15-mobile-swagger-api-design.md`
- Plan: `docs/superpowers/plans/2026-06-15-mobile-swagger-api.md`

## Related task

- Complements TASK-170 (mobile API guide). No dedicated TASKS.md entry; originated
  from a direct request.
