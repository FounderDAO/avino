# Owner Listing Status — Hide / Sold / Rented / Reactivate

**Date:** 2026-06-18
**Status:** Design approved (awaiting spec review)
**Scope:** apps/api + apps/client (one app-folder per agent)

## Problem

When an owner sells, rents out, or temporarily wants to hide a listing, there is
**no way to do it today.** `ListingsController` exposes only `create`, `GET /mine`,
`GET /:id`, and `PATCH /:id` (edit). There is no owner status endpoint and no owner
delete. In `apps/client` the `MyListings.tsx` "В архив" / "Продвинуть" buttons are
stubs with no handlers. This design closes that gap.

## What already exists (reused, not rebuilt)

- `ListingStatus` enum already contains the owner-terminal states `ARCHIVED`,
  `SOLD`, `RENTED` (plus moderation states `NEW/ACTIVE/DRAFT/REJECTED/DELETED`).
- Public search hard-filters `status = 'ACTIVE'`; the detail read-path shows
  non-`ACTIVE` statuses only to the owner / MODERATOR / ADMIN. So any of
  `ARCHIVED/SOLD/RENTED` **already** removes a listing from search + map.
- Moderation already refuses to touch `ARCHIVED/SOLD/RENTED` (422) — these states
  are reserved for the owner by contract.
- i18n status labels for all statuses (incl. `SOLD/RENTED/ARCHIVED`) already exist
  in `apps/client/messages/{ru,uz,en}.json` under `account.myListings.status`.
- `TransactionType` is `SALE | RENT` → unambiguous mapping `SALE→SOLD`, `RENT→RENTED`.

## Approved product decisions

1. **Reactivation = smart return.** From `ARCHIVED` → straight to `ACTIVE` if the
   content was **not** edited while hidden; if it **was** edited → `NEW`
   (re-moderation). From `SOLD/RENTED` → **always** `NEW`.
2. **Sold/Rented are fully hidden** from the public (matches current behaviour;
   no "Sold" badge in search). No read-path changes required.
3. **Hide is allowed from any status** (`ACTIVE/NEW/DRAFT/REJECTED`). Hiding a `NEW`
   listing = withdrawing it from the moderation queue.

## State machine (owner-controlled transitions)

```
  NEW / ACTIVE / DRAFT / REJECTED
        │  HIDE                          MARK_SOLD (SALE) / MARK_RENTED (RENT)
        ▼                                from any non-terminal status
     ARCHIVED ───────────────────────────────────► SOLD / RENTED
        │                                                │
        │ REACTIVATE                                     │ REACTIVATE
        │   published & not edited → ACTIVE              │ always → NEW
        │   else (edited / never published) → NEW        │
        ▼                                                ▼
     ACTIVE / NEW                                        NEW
```

Owner actions and allowed source statuses:

| Action        | Target                         | Allowed from                  |
|---------------|--------------------------------|-------------------------------|
| `HIDE`        | `ARCHIVED`                     | `ACTIVE, NEW, DRAFT, REJECTED`|
| `MARK_SOLD`   | `SOLD` (requires `SALE`)       | `ACTIVE, ARCHIVED, NEW, DRAFT, REJECTED` |
| `MARK_RENTED` | `RENTED` (requires `RENT`)     | `ACTIVE, ARCHIVED, NEW, DRAFT, REJECTED` |
| `REACTIVATE`  | `ACTIVE` or `NEW` (see smart)  | `ARCHIVED, SOLD, RENTED`      |

Any other (source, action) pair → `422 INVALID_STATUS_TRANSITION`.
`transactionType` mismatch (`MARK_SOLD` on a `RENT` listing, or vice-versa) → `422`.

## Smart-return mechanism

`update()` currently does **not** change `status` and only bumps `updatedAt`. To make
"edited while hidden" deterministic (not a fuzzy timestamp compare), add one boolean:

- **Schema:** `editedSinceHidden Boolean @default(false) @map("edited_since_hidden")`
  on `Listing`. One Prisma migration.
- In `update()`: read current status; if it is `ARCHIVED`, set `editedSinceHidden = true`.
- On `HIDE` (→`ARCHIVED`): set `editedSinceHidden = false` (fresh hide).
- On `REACTIVATE` from `ARCHIVED`: → `ACTIVE` only if the listing was previously published
  (`publishedAt != null`) **and** `editedSinceHidden === false`; otherwise → `NEW`. This
  covers both "edited while hidden" and "hidden before it was ever approved" (e.g. a `NEW`
  listing that was hidden) — neither may bypass moderation. On `→ ACTIVE`, `publishedAt` is
  preserved. Then reset the flag to `false`.
- On `REACTIVATE` from `SOLD/RENTED`: always `NEW` (flag ignored; listing may be stale).

## API

Mirrors the admin pattern `PATCH /admin/listings/:id/status`:

```
PATCH /api/v1/listings/:id/status        (JwtAuthGuard, owner-only)
body: { action: 'HIDE' | 'MARK_SOLD' | 'MARK_RENTED' | 'REACTIVATE' }
→ 200 ListingResponse (краткий, как create/update)
```

- New method `setOwnerStatus(ownerId, listingId, action)` in `listings.service.ts`,
  with an explicit transition-table constant (mirrors `ACTION_TO_STATUS` in
  `moderation.service.ts`).
- Reuse existing error contract: not-owner → `403 FORBIDDEN`; missing/`DELETED` →
  `404 NOT_FOUND`; illegal transition or txn-type mismatch → `422 INVALID_STATUS_TRANSITION`.
- New DTO `dto/owner-status.dto.ts` (enum-validated `action`).
- `GET /listings/mine` and `findOne` already surface non-public statuses to the owner —
  no change needed.

## Public visibility — no changes

`status = 'ACTIVE'` filter in search + owner/privileged-only detail visibility already
deliver "fully hidden" for `ARCHIVED/SOLD/RENTED`. Read-path untouched.

## Client (apps/client)

- `MyListings.tsx`: replace the stub "В архив" button with a **status-contextual action
  set** per card:
  - `ACTIVE/NEW/DRAFT/REJECTED`: **Скрыть** + (**Продано** | **Сдано**, by `transactionType`)
  - `ARCHIVED`: **Вернуть в продажу** + (**Продано** | **Сдано**)
  - `SOLD/RENTED`: **Опубликовать снова**
- Confirmation: modal for `SOLD/RENTED` (significant); light confirm for **Скрыть**
  (reversible).
- RTK Query: `setMyListingStatus` mutation hitting the new endpoint, invalidating the
  `mine` cache tag so the list re-renders.
- i18n: status labels already exist. Add action keys
  `account.myListings.actions.{hide,markSold,markRented,reactivate}` + confirmation copy,
  ru/uz/en parity, single JSON writer.

## Out of scope (deliberate YAGNI for v1)

- **Owner status-change audit log.** `moderation_logs` is moderator-shaped (enum + admin
  UI); extending it would ripple into the admin panel. The listing's `status` + `updatedAt`
  is the record for v1. Future: dedicated `listing_status_history`.
- **Pausing a paid promotion** on hide/sold. Promotion fields untouched in v1.
- **Owner permanent delete.** Does not exist today; it is a separate gap, not one of the
  three user cases. Mental model for the user: *Скрыть* (reversible) vs *Продано/Сдано*
  (closes the deal, re-listable) vs *Удалить* (separate future task).

## Testing

- Unit (api): transition table — every (source-status × action × transactionType) →
  allowed / `422`.
- Smart-return: `ARCHIVED` unedited → `ACTIVE`; `ARCHIVED` edited → `NEW`; `SOLD` → `NEW`.
- Authz: non-owner → `403`; `DELETED` → `404`; `MARK_SOLD` on `RENT` → `422`.
- Integration: hide `ACTIVE` → disappears from `/search`; reactivate → reappears.
- Client (Vitest + RTL): correct buttons per status; mutation invalidates `mine` cache.

## Files touched

| Layer  | Files |
|--------|-------|
| api    | `prisma/schema.prisma` (+1 field + migration), `listings.service.ts` (`setOwnerStatus` + `update` flag), `listings.controller.ts` (route), new `dto/owner-status.dto.ts` |
| client | `features/account/MyListings.tsx`, `lib/api/listings.ts` (mutation), `messages/{ru,uz,en}.json` |
| docs   | ADR, `API.md` §7, `DONE.md` entry (bundled in the same PR, per project convention) |
```