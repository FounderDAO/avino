-- Generated to match schema.prisma (no local shadow DB). Apply on staging/CI with
-- `prisma migrate deploy`; if applied out-of-band, verify then
-- `prisma migrate resolve --applied 20260627000000_add_listing_bathrooms`.

-- AlterTable
ALTER TABLE "listings" ADD COLUMN "bathrooms" SMALLINT;
