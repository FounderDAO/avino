# ADR-0137 — Listing public reference number: separate autoincrement column, not a new PK

## Status

Accepted

## Date

2026-07-12

## Context

The `listings` primary key is a UUID (`listings.id`, `@default(uuid())`, 36
chars). UUIDs are great as opaque, non-guessable keys and they anchor every
foreign key in the schema (`listing_translations`, `listing_media`,
`listing_price_history`, `favorites`, `chat_threads`, `complaints`,
`tour_requests`, `promotions`, …) and every public URL.

But a UUID is impossible to dictate over the phone, quote in a support chat, or
type into an admin search box. Operators (moderators / support) and end users
need a **short, human-readable number** to find a listing quickly ("объявление
№100245"). This is the standard reference-number pattern on real-estate portals.

Two ways to get a numeric id:

1. **Replace the PK with an autoincrement integer.** Rejected: it would break
   every FK and every existing URL, and require rewriting all relations and
   client links — a large, risky migration for a purely cosmetic id.
2. **Add a separate numeric column alongside the UUID PK.** Non-breaking: the PK
   stays a UUID, all FKs/URLs keep working, and lookups can happen by either key.

A sequential number starting at 1 leaks the total listing count (id ≈ count),
which is competitive intel and eases enumeration/scraping. Confirmed with the
Team Lead: start the sequence at an offset.

## Decision

1. New column `listings.reference` — `Int @unique @default(autoincrement())`
   (Prisma), a separate public reference number next to the UUID PK. **The PK is
   not changed.**
2. The backing sequence starts at **100000** (raw-SQL migration, not Prisma —
   Prisma does not model a sequence START). Existing rows are backfilled
   deterministically by `(created_at, id)` starting at 100000; the sequence is
   then advanced past the max so `nextval()` cannot collide with the backfill.
   The offset hides the true listing count.
3. `reference` is exposed in the public read contracts (additive, non-breaking):
   - `GET /api/v1/listings/:id` and `/by-ref/:reference` detail
     (`ListingDetailResponse.reference`);
   - `/api/v1/search` card (`SearchListItem.reference`);
   - `/api/v1/admin/listings` moderation row (`AdminListingListItem.reference`).
4. New public resolver `GET /api/v1/listings/by-ref/:reference` — returns the
   same detail shape as `GET :id`, looked up by the number instead of the UUID.
   Declared before `@Get(':id')` so the two-segment path is not captured by the
   UUID route; identical visibility rules (shared `resolveDetail` tail).
5. Admin moderation list gains an exact `?reference=` filter
   (`ListAdminListingsQueryDto.reference`) so moderators jump straight to a
   listing by its number.

## Consequences

Positive:

- Short, dictatable number for support/admin/end users; find-by-number works
  both publicly (`/by-ref`) and in the moderation queue (`?reference=`).
- Non-breaking: UUID PK, all FKs and existing URLs untouched; all added response
  fields and the new endpoint/filter are additive (stay in API v1, CLAUDE.md §14).
- Offset start (100000) keeps the total listing count private.

Negative / trade-offs:

- Two identifiers per listing (UUID PK + `reference`); readers must know the UUID
  is canonical and `reference` is a human-facing alias.
- `reference` is still monotonic, so the *rate* of new listings is observable by
  polling two numbers over time — acceptable for a public marketplace (listings
  are public anyway); the offset only hides the absolute count.
- Frontends must be wired separately (client shows/searches the №, admin adds a
  search field) — out of scope for this apps/api PR (CLAUDE.md one-folder-one-PR),
  follow-up PRs in `apps/client` and `apps/web`.

## Related files

- `apps/api/prisma/schema.prisma` (`Listing.reference`)
- `apps/api/prisma/migrations/20260712000000_add_listing_reference/migration.sql`
- `apps/api/src/listings/listings.service.ts` (`reference` in detail select/response,
  `findByReference`, shared `resolveDetail`)
- `apps/api/src/listings/listings.controller.ts` (`GET /listings/by-ref/:reference`)
- `apps/api/src/search/search.service.ts` (`reference` in `SearchListItem`)
- `apps/api/src/moderation/moderation.service.ts` (`reference` in list + `?reference=` filter)
- `apps/api/src/moderation/dto/list-admin-listings.dto.ts` (`reference` filter)
- `apps/api/openapi.public.json`, `apps/api/openapi.internal.json` (regenerated)

## Related task

- TASK-249 — Listing incremental public reference number.
