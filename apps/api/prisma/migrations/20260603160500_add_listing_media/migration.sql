-- Listing media schema (DB_SCHEMA.md §6, ADR-008 media). Holds image URLs +
-- processed-file metadata for a listing; files themselves live in S3-compatible
-- storage, never on the app server FS. sort_order drives gallery ordering,
-- indexed as (listing_id, sort_order).
--
-- This migration introduces the MediaType enum type. It carries only IMAGE in
-- MVP — VIDEO is Phase 2 (DB_SCHEMA §3); adding it later is a non-breaking enum
-- addition.
--
-- mime_type (varchar) records the validated content-type of an uploaded file.
-- DB_SCHEMA §6 names the allowed MVP MIME types (image/jpeg, image/png,
-- image/webp) but did not enumerate a column; it is added here to satisfy the
-- TASK-036 "MIME metadata fields exist" acceptance criterion and give the upload
-- pipeline a place to persist the checked type. Flagged for Team Lead.
-- width/height/size_bytes are the processed-image metadata. EXIF (in particular
-- GPS) MUST be stripped on processing — listing coordinates come only from the
-- map, never from photo EXIF (ADR-008).
--
-- FK -> listings(id) ON DELETE CASCADE: same soft-delete reasoning as
-- listing_translations (ADR-013).

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE');

-- CreateTable
CREATE TABLE "listing_media" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "type" "MediaType" NOT NULL DEFAULT 'IMAGE',
    "mime_type" VARCHAR(100),
    "width" INTEGER,
    "height" INTEGER,
    "size_bytes" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_media_listing_id_sort_order_idx" ON "listing_media"("listing_id", "sort_order");

-- AddForeignKey
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
