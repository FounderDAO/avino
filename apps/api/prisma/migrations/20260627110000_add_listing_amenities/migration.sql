-- Generated to match schema.prisma (no local shadow DB). Apply on staging/CI with
-- `prisma migrate deploy`; if applied out-of-band, verify then
-- `prisma migrate resolve --applied 20260627110000_add_listing_amenities`.

-- CreateEnum
CREATE TYPE "Amenity" AS ENUM (
  'AIR_CONDITIONING', 'FURNITURE', 'APPLIANCES', 'INTERNET',
  'ELEVATOR', 'BALCONY', 'HEATING', 'SECURITY'
);

-- AlterTable
ALTER TABLE "listings" ADD COLUMN "amenities" "Amenity"[] NOT NULL DEFAULT '{}';

-- CreateIndex (GIN ускоряет @> containment)
CREATE INDEX "listings_amenities_idx" ON "listings" USING GIN ("amenities");
