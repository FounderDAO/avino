-- CreateEnum
CREATE TYPE "ListingImportPhotoSource" AS ENUM ('URL', 'FILE');

-- CreateEnum
CREATE TYPE "ListingImportPhotoStatus" AS ENUM ('PENDING', 'AWAITING_UPLOAD', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "listing_import_rows" ADD COLUMN "photos_attached" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "listing_import_photos" (
    "id" UUID NOT NULL,
    "import_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "listing_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "source" "ListingImportPhotoSource" NOT NULL,
    "ref" VARCHAR(2048) NOT NULL,
    "status" "ListingImportPhotoStatus" NOT NULL,
    "error_code" VARCHAR(32),
    "http_status" INTEGER,
    "media_id" UUID,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listing_import_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listing_import_photos_import_id_row_number_position_key" ON "listing_import_photos"("import_id", "row_number", "position");

-- CreateIndex
CREATE INDEX "listing_import_photos_import_id_status_idx" ON "listing_import_photos"("import_id", "status");

-- CreateIndex
CREATE INDEX "listing_import_photos_listing_id_status_idx" ON "listing_import_photos"("listing_id", "status");

-- AddForeignKey
ALTER TABLE "listing_import_photos" ADD CONSTRAINT "listing_import_photos_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "listing_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
