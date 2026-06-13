-- Trigram GIN indexes for free-text search `q` (TASK-208, ADR-0067).
-- pg_trgm already enabled (20260603120000_enable_extensions, ADR-0003). Accelerates
-- ILIKE '%term%' (substring) over listing title/description/address.
-- Table/column names confirmed from schema.prisma + migration 20260603160000_add_listing_translations.
CREATE INDEX "idx_listing_translations_title_trgm"
    ON "listing_translations" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "idx_listing_translations_description_trgm"
    ON "listing_translations" USING GIN ("description" gin_trgm_ops);
CREATE INDEX "idx_listings_address_trgm"
    ON "listings" USING GIN ("address" gin_trgm_ops);
