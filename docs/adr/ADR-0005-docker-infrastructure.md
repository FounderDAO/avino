# ADR-0005 — Local Docker infrastructure (PostgreSQL/PostGIS + Redis)

## Status

Accepted

## Date

2026-06-02

## Context

Avino's backend depends on two stateful services from the first line of code:

- **PostgreSQL with the PostGIS extension** — the single source of truth for
  data and for all geospatial queries (radius, map-bounds, near-me,
  clustering); see ADR-0003.
- **Redis** — cache and the queue backend for BullMQ (see ADR-0001).

Developers need a reproducible way to run both locally without installing
PostgreSQL/PostGIS or Redis on the host. The monorepo scaffold (TASK-010,
commit `9d0ca01`) already added `docker-compose.yml`, the matching
`.env.example` variables, and root `pnpm infra:up` / `infra:down` scripts.
TASK-011 ("Add Docker infrastructure") confirms and records that setup as a
binding project decision; no separate ADR covered it yet.

## Decision

Local infrastructure is provided via a single root `docker-compose.yml`:

1. **postgres** — image `postgis/postgis:16-3.4` (PostGIS bundled, no manual
   extension install on the host). Credentials and DB name come from
   `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`, port from
   `POSTGRES_PORT` (default `5432`). Data persists in the named volume
   `avino-postgres-data`. Health is checked with `pg_isready`.
2. **redis** — image `redis:7-alpine`, port from `REDIS_PORT` (default `6379`),
   data in the named volume `avino-redis-data`. Health is checked with
   `redis-cli ping`.
3. Both services use `restart: unless-stopped` and are parameterized through
   `.env` (copied from `.env.example`). The app connects via `DATABASE_URL` and
   `REDIS_URL`.
4. The stack is started/stopped with `pnpm infra:up` (`docker compose up -d`)
   and `pnpm infra:down`, documented in `README.md`.

This is a **local development** decision. Production deployment is out of scope
here and will be decided separately (see CLAUDE.md §13).

## Consequences

Positive:

- One command (`pnpm infra:up`) brings up a PostGIS-ready Postgres and Redis;
  no host-level installs.
- PostGIS ships in the image, so the geo stack (ADR-0003) works out of the box.
- Named volumes keep data across restarts; healthchecks let tooling wait for
  readiness.
- Ports, credentials and DB name are environment-driven, avoiding conflicts and
  hard-coded secrets (CLAUDE.md code-style rule).

Negative / trade-offs:

- Requires Docker + Docker Compose on developer machines.
- Compose is for local/dev only; a production topology (managed Postgres,
  backups, Redis HA) still needs its own decision.
- Default credentials (`avino`/`avino`) are convenience-only and must never be
  reused outside local development.

## Related files

- docker-compose.yml
- .env.example
- README.md
- package.json (`infra:up`, `infra:down` scripts)
- docs/adr/ADR-0001-project-stack.md
- docs/adr/ADR-0003-postgis-prisma.md

## Related task

- TASK-011 — Add Docker infrastructure
