# ADR-0004 — VIP/TOP promotion model (ledger + time-guarded ranking)

## Status

Accepted

## Date

2026-06-02

## Context

Avino must support paid listing promotion (VIP / TOP) from the architecture
level so promoted listings rank above normal ones in search and listing pages.
Online payment integration is **not** required for MVP; admins manually
activate VIP/TOP for fixed periods (7/14/30 days).

A promotion model must avoid two classic problems: (a) denormalization drift
between the promotion ledger and the cached columns used for fast sorting, and
(b) stale "top placement" where an expired promotion still ranks high because a
background job has not run yet. This ADR records the model already specified in
`docs/ARCHITECTURE.md` (§10) and `docs/DB_SCHEMA.md`.

## Decision

Promotion types and priority:

```text
Types:    NORMAL | TOP | VIP
Priority: VIP > TOP > NORMAL
Periods:  7 | 14 | 30 days
```

Data model:

- `listing_promotions` is the **source of truth (ledger)**: one row per
  promotion with `type`, `status`, `startsAt`, `expiresAt`, price/currency, and
  payment fields.
- The denormalized columns on `listings`
  (`promotionType`/`promotionStartedAt`/`promotionExpiresAt`) are a **read cache**
  used only for fast sorting. They are updated atomically when a promotion is
  activated, cancelled, extended, or expired.

Integrity rules (binding):

1. **At most one active promotion per listing.** Activating a new promotion
   supersedes the previous one (old row closed, new row becomes active). No
   stacking/overlap.
2. **The effective tier is time-guarded in SQL.** A listing counts as VIP/TOP
   only while `promotionExpiresAt > now()`; search/listing queries apply this
   guard directly (e.g. `CASE WHEN promotionExpiresAt > now() THEN promotionType
   ELSE 'NORMAL'`). The expire job is for cache cleanup/notifications, not for
   ordering correctness.
3. **Promotion is independent of moderation.** Only `ACTIVE` listings are ranked
   by tier; a promoted listing that is not `ACTIVE` is not shown.
4. Deterministic ranking sort key:
   `(effective_tier DESC, createdAt DESC, id DESC)`; keyset pagination preferred.

Operations:

- Background expiration via `promotion_queue` → `expire_listing_promotions`.
- Admin actions: `activate_vip`, `activate_top`, `cancel_promotion`,
  `extend_promotion` — all logged to `promotion_logs`.
- Online payment is **not** required for MVP; it can be added in Phase 1.5 after
  a provider is confirmed (promotion activation/payment callbacks must be
  idempotent).

## Consequences

Positive:

- Single source of truth (the ledger) with a fast, synced sort cache.
- No stale top placement: expired promotions drop to NORMAL immediately in
  query results, regardless of job timing.
- Manual admin activation lets MVP ship without a payment integration.

Negative / trade-offs:

- The cached `listings.*` columns must be kept in sync atomically on every
  promotion change — a sync bug causes ranking drift.
- The time guard must be present in every ranking query, adding SQL complexity.
- Payment-related fields exist in the schema before payments are implemented
  (`NOT_REQUIRED` payment status for MVP).

## Related files

- docs/ARCHITECTURE.md (§8, §10, §12, §19)
- docs/DB_SCHEMA.md
- docs/API.md
- docs/adr/ADR-0001-project-stack.md

## Related task

- TASK-DOCS-INIT (initial project tracking documents)
