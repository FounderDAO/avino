# ADR-0087 — Owner-controlled listing status (hide / sold / rented / reactivate)

## Status
Accepted

## Date
2026-06-18

## Context
Owners had no way to hide a listing, mark it sold/rented, or take it down when a
deal completes — `ListingsController` exposed only create / mine / detail / edit.
The `ListingStatus` enum already reserved `ARCHIVED/SOLD/RENTED` for the owner, and
moderation already refused to touch them, but no owner-facing transition existed.

## Decision
Add `PATCH /api/v1/listings/:id/status` (Bearer, owner-only) with actions
`HIDE | MARK_SOLD | MARK_RENTED | REACTIVATE`, mapped to existing statuses by a
transition state-machine in `ListingsService.setOwnerStatus`. Sold/rented are derived
from `transaction_type` (SALE→SOLD, RENT→RENTED). Reactivation is a "smart return":
`ARCHIVED → ACTIVE` only when the listing was previously published and not edited while
hidden (tracked by a new `edited_since_hidden` boolean); otherwise → `NEW`. From
SOLD/RENTED reactivation always goes to `NEW`. The public read-path is unchanged —
`status='ACTIVE'` already fully hides the other states.

## Consequences
Positive:
- Reuses existing statuses + read-path; zero changes to search/detail visibility.
- Smart return avoids needless re-moderation of unchanged, already-approved listings.

Negative / trade-offs:
- One new column + migration.
- No owner status-change audit log in v1 (status + updated_at is the record);
  promotion is not paused on hide/sold; owner permanent-delete remains absent.
  All deferred deliberately (see spec).

## Related files
- apps/api/prisma/schema.prisma (Listing.editedSinceHidden)
- apps/api/src/listings/listings.service.ts (setOwnerStatus)
- apps/api/src/listings/listings.controller.ts
- apps/api/src/listings/dto/owner-status.dto.ts

## Related task
- Owner listing status (spec: docs/superpowers/specs/2026-06-18-owner-listing-status-design.md)
