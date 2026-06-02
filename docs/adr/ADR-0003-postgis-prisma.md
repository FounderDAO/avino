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

### Runtime foundation (TASK-030)

The Prisma client is exposed to NestJS via a single global module:

6. `apps/api/src/prisma/prisma.service.ts` extends `PrismaClient` and manages
   the connection lifecycle through `onModuleInit` (`$connect`, fail-fast on
   startup) and `onModuleDestroy` (`$disconnect`).
7. `apps/api/src/prisma/prisma.module.ts` is `@Global()` and exports
   `PrismaService`, mirroring the global `AppConfigModule` (ADR-0006) so feature
   modules inject it without re-importing.
8. `schema.prisma` carries a temporary `HealthCheck` placeholder model: Prisma
   refuses to generate a client with zero models, and the foundation must be
   generatable before any domain model exists. It is marked for removal when the
   first real model lands (TASK-033 — users). Decision confirmed by Team Lead
   (CLAUDE.md §2/§13).

### Baseline extensions migration (TASK-031)

The required PostgreSQL extensions are enabled by a single hand-authored raw SQL
migration that runs before any table migration:

9. `apps/api/prisma/migrations/20260603120000_enable_extensions/migration.sql`
   issues `CREATE EXTENSION IF NOT EXISTS` for **pgcrypto** (`gen_random_uuid()`
   default for every `id uuid` PK — DB_SCHEMA §2), **postgis** (geography +
   GIST geo search — this ADR), and **pg_trgm** (GIN trigram ILIKE text search —
   ARCHITECTURE §12). `IF NOT EXISTS` makes it idempotent.
10. The three extensions are also declared in the `datasource db.extensions`
    array of `schema.prisma` (`postgresqlExtensions` preview feature) so the
    declarative schema matches the migration and Prisma does not report drift.
11. The migration is applied with `prisma migrate deploy`; `prisma migrate dev`
    is not used to author it, because the schema still carries the temporary
    `HealthCheck` placeholder (point 8) which must not leak into the first
    table migration (TASK-033).

### Listings realization (TASK-035)

The `listings` table is the first model to actually use the strategy above:

12. `location` is synced from `latitude`/`longitude` by a **`BEFORE INSERT/UPDATE
    OF latitude, longitude` trigger** (`listings_sync_location_trg` →
    `listings_sync_location()`), created via raw SQL. This resolves the
    trigger-vs-in-transaction-update choice point (3) in favour of the trigger,
    so `location` can never drift from its source even on a write that forgets
    to set it. NULL coordinates produce a NULL `location`.
13. The `GIST` index is created as `idx_listings_location`. Because Prisma cannot
    represent a GIST index on an `Unsupported` column, `prisma migrate diff`
    reports a phantom "removed index on (location)"; this is expected and benign
    — migrations are hand-authored and applied with `migrate deploy`, which never
    drops the raw-SQL index, and `prisma migrate status` reports the DB in sync.
14. `agency_id` / `city_id` / `district_id` are documented as FKs in DB_SCHEMA §6,
    but their target tables (`agencies`/`cities`/`districts`) do not exist yet.
    They are created as indexed `UUID` columns **without** a FK constraint or
    Prisma relation; the constraints and relation fields are added when those
    tables land in their own tasks. `owner_id` → `users` is enforced now with
    `ON DELETE RESTRICT` (accounts are soft-deleted — ADR-013).

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
- The temporary `HealthCheck` placeholder model exists only to bootstrap client
  generation; it must be removed in TASK-033 to avoid leaking into the first
  real migration.

## Related files

- docs/ARCHITECTURE.md (§8, §12, §22)
- docs/DB_SCHEMA.md
- docs/adr/ADR-0001-project-stack.md
- docs/adr/ADR-0006-config-and-validation.md
- apps/api/src/prisma/prisma.module.ts
- apps/api/src/prisma/prisma.service.ts
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260603120000_enable_extensions/migration.sql
- apps/api/prisma/migrations/20260603150000_add_listings/migration.sql
- apps/api/prisma/migrations/migration_lock.toml

## Related task

- TASK-DOCS-INIT (initial project tracking documents)
- TASK-030 (Prisma runtime foundation: PrismaModule/PrismaService)
- TASK-031 (baseline extensions migration: pgcrypto, postgis, pg_trgm)
- TASK-035 (listings schema: location sync trigger + GIST index realization)
