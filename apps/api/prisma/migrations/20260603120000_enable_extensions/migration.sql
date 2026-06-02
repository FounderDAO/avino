-- Enable required PostgreSQL extensions for Avino.
-- This is the baseline migration: it must run before any table migration so
-- that gen_random_uuid() (pgcrypto), geography/GIST (postgis) and trigram text
-- search (pg_trgm) are available. See docs/DB_SCHEMA.md §14 and ADR-0003.

-- pgcrypto: gen_random_uuid() default for every table's `id uuid` PK (DB_SCHEMA §2).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- postgis: geography(Point, 4326) + GIST index for radius/bounds/near-me search (ADR-0001/0003).
CREATE EXTENSION IF NOT EXISTS postgis;

-- pg_trgm: GIN trigram indexes for ILIKE/title/description text search (ARCHITECTURE §12).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
