# ADR-0003 — PostGIS via Prisma (geo source of truth + raw SQL)

## Status

Accepted

## Date

2026-06-02

## Context

Avino's search requires geospatial queries: radius search, map-bounds search,
"near me", and listing markers with clustering. These are implemented in
PostgreSQL using the **PostGIS** extension.

The project's ORM is Prisma, which has **no native PostGIS column type** and
cannot express PostGIS operators in its query builder. A clear, binding
integration strategy is therefore needed so geo data stays correct and the GIST
index is actually created. This ADR records the approach already specified in
`docs/ARCHITECTURE.md` (§22) and `docs/DB_SCHEMA.md`.

## Decision

PostGIS is integrated with Prisma as follows:

1. `location` is modeled in `schema.prisma` as
   `Unsupported("geography(Point, 4326)")`.
2. `latitude` / `longitude` are first-class `Decimal` columns and are the
   **editable source** of the coordinates.
3. `location` is **derived** from `latitude`/`longitude` and kept in sync on
   every write — via a DB trigger or an explicit
   `ST_SetSRID(ST_MakePoint(lng, lat), 4326)` update inside the same
   transaction.
4. The **GIST index** on `location` is created via a **raw SQL migration**
   (Prisma migrate does not emit it automatically).
5. Geo queries (`ST_DWithin` for radius, `ST_MakeEnvelope`/`ST_Within` for map
   bounds, nearest for near-me) are executed with `prisma.$queryRaw`, not the
   Prisma query builder.

`location` is the source of truth for geo queries. Listing coordinates come
only from the map-picked point — never from photo EXIF (which is stripped on
upload).

## Consequences

Positive:

- Full PostGIS power (radius, bounds, near-me, clustering) while keeping Prisma
  as the primary ORM for everything else.
- `latitude`/`longitude` remain ergonomic, validated `Decimal` fields for the
  API and forms.
- Indexing and geo querying are explicit and reviewable.

Negative / trade-offs:

- Geo paths bypass Prisma's type-safety and use raw SQL — these queries need
  careful review and testing.
- The GIST index and the lat/lng → `location` sync are manual responsibilities;
  forgetting either breaks geo correctness or performance.
- Schema diffs involving `Unsupported(...)` need attention during migrations.

## Related files

- docs/ARCHITECTURE.md (§8, §12, §22)
- docs/DB_SCHEMA.md
- docs/adr/ADR-0001-project-stack.md

## Related task

- TASK-DOCS-INIT (initial project tracking documents)
