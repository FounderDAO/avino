# ADR-0069 — Owner/agent contact block in listing detail (phone public on ACTIVE)

## Status

Accepted

## Date

2026-06-13

## Context

`GET /api/v1/listings/:id` does not embed the author's contact, so the client
`ContactCard` renders placeholders (name/phone «—»), and a buyer cannot reach
the seller (TASK-210). We must embed the author's public contact (name /
type / phone) in the detail response, which forces a **privacy decision** on how
the phone number is exposed.

Existing data: the listing's author is `Listing.owner → User` (relation, FK
`owner_id`, always present). A `User` has `phone` and a `UserProfile`
(`display_name` / `first_name` / `last_name` / `contact_phone`) and roles
(`User.roles → UserRole → Role.code`, codes like `OWNER` / `AGENT` / `AGENCY`).
There is no `is_pro` / subscription field yet. `agency_id` is a scalar with no
`agencies` table.

Phone-exposure options considered: (A) phone public on ACTIVE listings;
(B) phone only for authenticated requests; (C) reveal-on-action via a separate
endpoint (Avito-style).

## Decision

**Option A — phone is public on the listing detail.** (Product decision,
confirmed by the owner.) Avino is a classifieds portal whose purpose is to let a
buyer/renter contact the seller; this matches the OLX/Uzum norm and immediately
unblocks the client `ContactCard`. Anti-scraping is deferred to rate-limiting,
not phone hiding.

`GET /api/v1/listings/:id` gains an additive `contact` object:

```json
"contact": {
  "display_name": "Алишер",        // profile.display_name, else "first last", else null
  "type": "owner",                  // agency | agent | owner (derived from owner roles)
  "is_pro": false,                  // MVP heuristic: true iff type is agent/agency
  "phone": "+998901234567"          // profile.contact_phone, else user.phone, else null
}
```

Resolution rules:

- **type**: owner roles include `AGENCY` → `agency`; else include `AGENT` →
  `agent`; else `owner`. (`agency_id` / a real agency entity is future work.)
- **is_pro**: MVP heuristic — `true` iff `type ∈ {agent, agency}` (no
  subscription/verification field exists yet; revisit when one lands).
- **phone**: `profile.contact_phone ?? user.phone ?? null` — public.
- **display_name**: `profile.display_name ?? "first_name last_name" ?? null`.

The detail endpoint already gates non-`ACTIVE` statuses to owner / MODERATOR /
ADMIN; the contact block (incl. phone) is returned in all cases the listing is
visible — for `ACTIVE` that is everyone (the public decision), for non-public
statuses only the already-authorised viewers.

## Consequences

Positive:

- Buyers can contact sellers; the client `ContactCard` is unblocked with real
  data. Simplest contract; no extra endpoint or auth wall.

Negative / trade-offs:

- Phone numbers are scrapeable by anonymous clients — accepted; mitigated later
  by rate-limiting, not by hiding (no reveal-on-action endpoint for MVP).
- `is_pro` and `type` are role-derived heuristics until a real agency entity /
  pro-subscription exists; `agency_id` is not yet resolved to an agency name.

## Related files

- apps/api/src/listings/listings.service.ts (contact block + detail select)
- apps/api/src/listings/listings.service.spec.ts / *.int-spec.ts
- docs/API.md (§7 listing detail)

## Related task

- TASK-210
