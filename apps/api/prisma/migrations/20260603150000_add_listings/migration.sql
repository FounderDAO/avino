-- Listings core schema (DB_SCHEMA.md §6, ADR-0003 PostGIS, ADR-0004 promotion).
-- Non-translatable structured listing fields live here; translatable text
-- (title/description) lands in listing_translations (TASK-036), promotions in
-- listing_promotions (TASK-037). listings.promotion_* is a denormalized READ
-- CACHE of the active promotion row; the ledger is the source of truth (ADR-0004).
--
-- This migration introduces the TransactionType/PropertyType enum types — the
-- listings table is the first model to reference them. The core enums
-- (ListingStatus/PromotionType/Currency/Language — TASK-032) already exist from
-- the users/roles migration and are NOT re-created here.
--
-- Geo (DB_SCHEMA.md §14, ADR-0003): latitude/longitude are the editable Decimal
-- source columns. `location geography(Point,4326)` is DERIVED and Prisma cannot
-- read/write it (Unsupported). Three things Prisma migrate cannot emit are
-- appended as raw SQL at the end:
--   1. a BEFORE INSERT/UPDATE trigger that keeps `location` in sync with lat/lng
--      in the same write, so it can never drift (DB_SCHEMA §14 recommendation);
--   2. the GIST index on `location` for radius/bounds/near-me search;
--   3. the listings CHECK constraints (price >= 0; area >= 0) — DB_SCHEMA §15.
--
-- agency_id / city_id / district_id are FK columns per DB_SCHEMA §6, but the
-- agencies/cities/districts tables do not exist yet. They are created here as
-- indexed UUID columns WITHOUT a foreign-key constraint; the constraints (and
-- Prisma relations) will be added when those tables land in their own tasks.
-- owner_id → users is enforced now with ON DELETE RESTRICT: accounts are
-- soft-deleted (ADR-013), so a listing always keeps a valid creator reference.

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'HOUSE', 'NEW_BUILDING', 'LAND', 'COMMERCIAL');

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "agency_id" UUID,
    "transaction_type" "TransactionType" NOT NULL,
    "property_type" "PropertyType" NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'NEW',
    "original_language" "Language" NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "area" DECIMAL(10,2),
    "rooms" SMALLINT,
    "floor" SMALLINT,
    "total_floors" SMALLINT,
    "year_built" SMALLINT,
    "address" VARCHAR(500),
    "city_id" UUID,
    "district_id" UUID,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "location" geography(Point, 4326),
    "promotion_type" "PromotionType" NOT NULL DEFAULT 'NORMAL',
    "promotion_started_at" TIMESTAMPTZ(6),
    "promotion_expires_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listings_status_idx" ON "listings"("status");

-- CreateIndex
CREATE INDEX "listings_property_type_idx" ON "listings"("property_type");

-- CreateIndex
CREATE INDEX "listings_transaction_type_idx" ON "listings"("transaction_type");

-- CreateIndex
CREATE INDEX "listings_price_idx" ON "listings"("price");

-- CreateIndex
CREATE INDEX "listings_city_id_idx" ON "listings"("city_id");

-- CreateIndex
CREATE INDEX "listings_district_id_idx" ON "listings"("district_id");

-- CreateIndex
CREATE INDEX "listings_owner_id_idx" ON "listings"("owner_id");

-- CreateIndex
CREATE INDEX "listings_agency_id_idx" ON "listings"("agency_id");

-- CreateIndex
CREATE INDEX "listings_promotion_type_idx" ON "listings"("promotion_type");

-- CreateIndex
CREATE INDEX "listings_promotion_expires_at_idx" ON "listings"("promotion_expires_at");

-- CreateIndex
CREATE INDEX "listings_status_promotion_type_created_at_id_idx" ON "listings"("status", "promotion_type", "created_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Raw SQL Prisma cannot express (DB_SCHEMA.md §14/§15, ADR-0003).
-- ---------------------------------------------------------------------------

-- Keep `location` in sync with latitude/longitude on every write, in the same
-- row mutation, so the derived geography can never drift from its source
-- (DB_SCHEMA §14). NULL coordinates yield a NULL location.
CREATE OR REPLACE FUNCTION listings_sync_location()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    ELSE
        NEW.location := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listings_sync_location_trg
    BEFORE INSERT OR UPDATE OF latitude, longitude ON "listings"
    FOR EACH ROW
    EXECUTE FUNCTION listings_sync_location();

-- GIST index on the geography column — required for ST_DWithin (radius),
-- ST_Within (map bounds) and nearest-neighbour (near-me) search. Prisma migrate
-- does not emit GIST indexes for Unsupported columns.
CREATE INDEX "idx_listings_location" ON "listings" USING GIST ("location");

-- CHECK constraints (DB_SCHEMA.md §15): price/area are non-negative.
ALTER TABLE "listings"
    ADD CONSTRAINT "listings_price_non_negative_check"
    CHECK (price >= 0);

ALTER TABLE "listings"
    ADD CONSTRAINT "listings_area_non_negative_check"
    CHECK (area IS NULL OR area >= 0);
