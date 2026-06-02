-- Listing translations schema (DB_SCHEMA.md §6, ADR-005 translations).
-- Splits the translatable text off the listings core table (TASK-035):
-- title/description/address_note/features_text live here, one row per language.
-- The author row is source=USER, is_auto_translated=false on the listing's
-- original_language; machine rows (GOOGLE/YANDEX) are generated AFTER the
-- listing becomes ACTIVE and inherit its visibility/status — they are never
-- independently publishable. UNIQUE(listing_id, language) → one translation per
-- language. Text search targets the row matching the user's language with
-- fallback to original_language (ADR-005).
--
-- This migration introduces the TranslationSource enum type (USER|GOOGLE|YANDEX)
-- — listing_translations is the first model to reference it.
--
-- FK -> listings(id) ON DELETE CASCADE: a listing is soft-deleted via status
-- (ADR-013), so a row is only physically removed in admin/cleanup flows — when
-- that happens its translations go with it.

-- CreateEnum
CREATE TYPE "TranslationSource" AS ENUM ('USER', 'GOOGLE', 'YANDEX');

-- CreateTable
CREATE TABLE "listing_translations" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "language" "Language" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "address_note" TEXT,
    "features_text" TEXT,
    "source" "TranslationSource" NOT NULL,
    "is_auto_translated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listing_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_translations_listing_id_idx" ON "listing_translations"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_translations_listing_id_language_key" ON "listing_translations"("listing_id", "language");

-- AddForeignKey
ALTER TABLE "listing_translations" ADD CONSTRAINT "listing_translations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
