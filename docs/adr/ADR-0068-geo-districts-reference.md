# ADR-0068 — Districts reference table + district_name in listing responses

## Status

Accepted

## Date

2026-06-13

## Context

There is no geo-reference endpoint, so the client cannot resolve a listing's
`district_id` (a bare UUID) into a human name — district fields on cards and the
detail page render empty (TASK-209). We need (a) a districts reference the
client can fetch for dropdowns / resolution, and (b) a readable `district_name`
(per Accept-Language) embedded into `/search` items and `/listings/:id`.

Constraints / existing state:

- `listings.district_id` already exists as an **indexed UUID scalar with no FK**
  (the `districts`/`cities` tables were deferred — see the `add_listings`
  migration header). Existing demo/seed listings carry arbitrary `district_id`
  values that do **not** correspond to any real district id.
- Listings are trilingual (UZ/RU/EN); the API resolves display language via
  `TranslationsService`.
- For MVP the market is **Tashkent only**.

## Decision

1. **`districts` reference table** with trilingual NOT NULL names
   (`name_uz`, `name_ru`, `name_en`) and a `code` slug; a standalone Prisma
   model `District` (`@@map("districts")`), **no relation/FK to `listings`**.
2. **No FK `listings.district_id → districts.id`.** Adding one would fail against
   existing listings whose `district_id` is arbitrary. `district_name` is
   resolved by a **lookup** (batch query districts by the ids on the current
   page/detail); an unmatched `district_id` yields `district_name = null`
   (non-breaking, no crash). The FK can be introduced later once listing data is
   migrated onto real district ids.
3. **Reference data seeded inside the migration** (idempotent
   `INSERT … ON CONFLICT (id) DO NOTHING`, fixed UUIDs) — the 12 Tashkent
   districts exist in every environment as soon as `migrate deploy` runs, no
   dependency on the demo seed. MVP is a **flat** list (no city scoping / no
   polygon geometry yet).
4. **Endpoint** `GET /api/v1/geo/districts` (public) returns
   `[{ id, code, name_uz, name_ru, name_en }]` for dropdowns and client-side
   resolution. New `apps/api/src/geo/` module with a `DistrictsService` exported
   for reuse.
5. **Embed `district_name`** (string|null) into `SearchListItem` and
   `ListingDetailResponse` as an **optional additive field** (non-breaking,
   CLAUDE.md §14), resolved to the **same display language** the card/detail
   already resolves for its title (UZ/RU/EN). `SearchService` and
   `ListingsService` use `DistrictsService` to batch-resolve names.

## Consequences

Positive:

- Client can render district names on cards and detail, and populate a districts
  dropdown, without mock data.
- Additive, non-breaking: no FK migration risk against existing listing data;
  unmatched ids degrade gracefully to `null`.
- Reference data is environment-independent (lives in the migration).

Negative / trade-offs:

- No referential integrity on `listings.district_id` yet (a listing can point at
  a non-existent district) — accepted until listing data is normalised.
- Flat, Tashkent-only for MVP (no city scoping, no district polygons) — a
  later ADR adds city scoping / geometry if needed.
- Batch district lookup is an extra query per search page / detail (small, by
  primary key).

## Related files

- apps/api/prisma/schema.prisma (`District` model)
- apps/api/prisma/migrations/<new>_add_districts/migration.sql (table + seed)
- apps/api/src/geo/* (module, controller, `DistrictsService`)
- apps/api/src/search/search.service.ts (`district_name` in items)
- apps/api/src/listings/listings.service.ts (`district_name` in detail)
- docs/API.md (§7, §9, new geo section)

## Related task

- TASK-209
