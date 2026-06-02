# ADR-0002 — API versioning (/api/v1 from day one)

## Status

Accepted

## Date

2026-06-02

## Context

The Avino backend is consumed by multiple long-lived clients: the Next.js web
app and a separately developed Flutter mobile app. Once mobile clients are
released, breaking the API contract is expensive — older app versions stay
installed for a long time and cannot be force-upgraded instantly.

To avoid being forced into a disruptive redesign later, API versioning must be
in place from the very first endpoint, not retrofitted. This ADR records the
versioning policy already mandated by `docs/CLAUDE.md` (§14) and
`docs/ARCHITECTURE.md` (§5).

## Decision

All backend routes use **URI-based versioning** under a global `api` prefix:

```text
/api/v1/<resource>
```

NestJS is configured globally in `main.ts`:

```ts
app.setGlobalPrefix('api');

app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: '1',
});
```

Every controller declares its version explicitly:

```ts
@Controller({
  path: 'listings',
  version: '1',
})
export class ListingsController {}
```

Rules:

- MVP implements only `v1`.
- Unversioned API routes are forbidden.
- `v2` is not created in advance — only when a real breaking change or large
  redesign occurs.
- Breaking changes (removing/renaming response fields, changing enum values,
  request body shape, auth flow, pagination, or error format) go into a new
  version.
- Non-breaking changes (optional fields, optional filters, new endpoints,
  stricter-but-compatible validation, new notification types) stay in the
  current version.
- Web and mobile clients must call only versioned routes.

## Consequences

Positive:

- Clients (web + mobile) can rely on a stable contract; future breaking changes
  are isolated to a new version instead of breaking shipped apps.
- Versioning cost is paid once, up front, instead of as an emergency migration.

Negative / trade-offs:

- Every controller must declare a version, adding minor boilerplate.
- Discipline is required to correctly classify changes as breaking vs.
  non-breaking.

## Related files

- docs/CLAUDE.md (§14)
- docs/ARCHITECTURE.md (§5, §21)
- docs/API.md
- docs/adr/ADR-0001-project-stack.md
- apps/api/src/main.ts (global prefix + URI versioning)
- apps/api/src/health/health.controller.ts (`@Controller({ path: 'health', version: '1' })`)
- apps/api/src/health/health.module.ts

## Related task

- TASK-DOCS-INIT (initial project tracking documents)
- TASK-021 (Add API versioning and global prefix — implementation)
