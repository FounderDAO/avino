# ADR-0007 — Unified API error envelope and request correlation

## Status

Accepted

## Date

2026-06-02

## Context

Every endpoint of the Avino API must return errors in one consistent, documented
shape so that both clients — web (RTK Query) and the future Flutter app — can
handle failures identically (CLAUDE.md §3, §18). `docs/API.md` already specifies
the contract:

- **§4 "Error format"** — a single envelope
  `{ "error": { code, message, details?, request_id } }`.
- **§17 "Error catalog"** — a fixed list of stable, machine-readable
  `error.code` values (UPPERCASE) that are part of the API contract: renaming or
  removing a code is a breaking change and would require a new API version
  (CLAUDE.md §14).

Before this task the API had a global `ValidationPipe` (TASK-022) but no error
handling: NestJS returned its default error bodies (`{ statusCode, message,
error }`), validation produced a `message: string[]`, and unhandled exceptions
risked leaking internal details (stack traces, messages) to clients. There was
also no request-correlation identifier to tie a client-visible error to server
logs.

## Decision

Implement error handling as a small, framework-level foundation under
`apps/api/src/common/`, with no domain logic:

1. **Error contract (`common/dto/error-response.dto.ts`).** Define the envelope
   types (`ApiErrorResponse`, `ApiErrorBody`, `ApiErrorDetail`) and an
   `ApiErrorCode` enum mirroring the API.md §17 catalog. The codes live in
   `apps/api` for now (task scope); they may later move to `packages/shared` if
   the frontend needs the same enum.

2. **Global exception filter (`common/filters/all-exceptions.filter.ts`).**
   A `@Catch()` filter renders every exception into the envelope:
   - Domain/validation code may throw an `HttpException` whose payload carries
     `{ code, message, details }`; the filter uses them directly.
   - Otherwise `code` is derived from the HTTP status
     (e.g. `401 → UNAUTHORIZED`, `404 → NOT_FOUND`), with a stable fallback to
     the HTTP status name (e.g. `409 → CONFLICT`).
   - Any non-`HttpException` (and any `5xx`) becomes `500 INTERNAL_ERROR` with a
     generic message; the real cause (stack/text) is written only to the server
     log and never leaks to the client.

3. **Validation shape via `exceptionFactory` (`common/validation/validation.options.ts`).**
   The global `ValidationPipe` is given an `exceptionFactory` that flattens the
   `class-validator` error tree into `details: [{ field, issue }]` (nested DTO
   fields become dotted paths, e.g. `address.city`) and throws a structured
   `VALIDATION_ERROR`. This makes validation failures match API.md §4 exactly.

4. **Request correlation (`common/interceptors/request-id.interceptor.ts`).**
   A global interceptor assigns each request a `request_id` — reusing an
   incoming `X-Request-Id` header (proxy/client) or generating a UUID — stores it
   on the request and echoes it back via the `X-Request-Id` response header. The
   filter reads that id (falling back to the incoming header, then a fresh UUID)
   so even not-found / guard-rejected paths stay correlated.

Success responses are **not** wrapped in a global transform interceptor: the
documented success shapes (bare objects and the `{ data, meta }` pagination
envelope, API.md §4) are produced per-endpoint, so a blanket wrapper would break
the contract. Only the `X-Request-Id` header is added on the success path.

## Consequences

Positive:

- One documented error shape across all current and future endpoints and clients.
- Validation errors are structured and per-field, matching API.md §4.
- Internal errors never leak implementation details; every error is traceable to
  a `request_id` present in both the response and the server log.
- Domain code can raise catalog errors by throwing `HttpException` with a
  `{ code, message, details }` payload — no per-controller error formatting.

Negative / trade-offs:

- The `ApiErrorCode` enum duplicates the API.md §17 catalog and must be kept in
  sync by hand until it is (optionally) extracted to `packages/shared`.
- Status-derived codes for non-catalog statuses are a best-effort fallback;
  precise domain codes still depend on call sites passing an explicit `code`.

## Related files

- apps/api/src/common/dto/error-response.dto.ts
- apps/api/src/common/filters/all-exceptions.filter.ts
- apps/api/src/common/interceptors/request-id.interceptor.ts
- apps/api/src/common/validation/validation.options.ts
- apps/api/src/main.ts
- docs/API.md (§4 Error format, §17 Error catalog)

## Related task

- TASK-023
