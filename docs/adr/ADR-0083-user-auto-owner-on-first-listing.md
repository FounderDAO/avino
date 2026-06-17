# ADR-0083 — Auto-upgrade USER → OWNER on first listing creation

## Status

Accepted

## Date

2026-06-17

## Context

Registration in Avino is "signup-as-login" (ADR-0010): the first OTP/Google login
creates the user and grants exactly one role — `USER` (`auth.service.ts`,
`google-auth.service.ts`).

However, `POST /api/v1/listings` is guarded by `RolesGuard` and required one of the
"seller" roles — `OWNER`, `AGENT`, `AGENCY`, `LANDLORD`, `PROPERTY_MANAGER`
(`listings.controller.ts`). `USER` was **not** in that list. Roles can only be
assigned through the admin endpoint (`admin/assign-role`); there is no self-service
upgrade.

Consequence: a freshly registered person who wants to sell or rent out their home
could not create a listing at all — the API returned `403 FORBIDDEN` before the
handler ran. For a real-estate marketplace this is a hard product blocker: the
default registered user must be able to publish.

## Decision

Adopt the **auto-upgrade on first listing** model: any registered user can publish,
and the seller role is granted automatically the first time they create a listing.

Two coordinated changes:

1. **Controller** — add `UserRole.USER` to `@Roles(...)` on `POST /listings`. Since
   every registered user has `USER`, this makes the endpoint effectively
   "any authenticated user". The other seller roles stay listed explicitly so the
   set of owners remains visible at the call site. `GUEST` (unauthenticated) is
   still blocked by `JwtAuthGuard`.

2. **Service** (`ListingsService.create`) — wrap the role grant and the listing
   insert in a single `$transaction`. Before inserting, `ensureSellerRole`:
   - counts the author's roles intersecting `SELLER_ROLES`;
   - if the author already has any seller role (incl. `AGENT`/`AGENCY`) → no-op;
   - otherwise grants `OWNER` via `upsert` on the composite key `userId_roleId`.

   The grant is **idempotent and race-safe** (composite unique
   `@@unique([userId, roleId])` + `upsert`), and **best-effort**: if the `OWNER`
   role is not seeded, creation still proceeds (the guard already authorized it; the
   role only refines the public contact `type` in the listing detail, ADR-0069).

### Role propagation

The grant is persisted immediately, so:
- `GET /auth/me` returns `OWNER` right away — it reads roles from the DB, not the
  token (`auth.service.ts:getMe`). The frontend can re-fetch to update UI/badges.
- The access **JWT** picks up `OWNER` on the next refresh — `rotateSession` re-reads
  roles from the DB (`token.service.ts`). Default access TTL is 900 s.

We do **not** force-rotate the current session: it is unnecessary, because the
create endpoint now also accepts `USER`, so there is no lockout window.

## Consequences

- Lowest-friction onboarding: register → publish. No admin step, no separate
  "become a seller" flow.
- `RolesGuard` on `POST /listings` is now effectively an authentication gate; the
  meaningful authorization is "is this a real account", which is correct for an
  open marketplace.
- Listing creation now runs in a transaction (one extra `count`, and one `upsert`
  only on the first listing). Negligible cost; subsequent listings short-circuit on
  the `count`.
- The `type` field in the public contact block (ADR-0069) is unaffected: a private
  seller stays `owner`; only admins promote someone to `AGENT`/`AGENCY`.

## Alternatives considered

- **Allow `USER` to create without granting a role** — simplest, but leaves the
  domain inconsistent (a publisher with no owner role) and complicates contact-type
  derivation and future per-role limits. Rejected.
- **Self-service "become a seller" onboarding** (choose private / agent / agency) —
  the right long-term UX when account types start to differ (commissions, limits,
  badges), but heavier than needed now. Deferred; this ADR does not preclude it.
- **Grant `OWNER` at registration** — gives the role to everyone, including users
  who only ever browse/favorite. Tying the upgrade to the first publish keeps the
  role meaningful. Rejected.
