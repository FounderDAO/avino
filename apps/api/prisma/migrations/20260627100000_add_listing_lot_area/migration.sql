-- Generated to match schema.prisma (no local shadow DB). Apply on staging/CI with
-- `prisma migrate deploy`; if applied out-of-band, verify then
-- `prisma migrate resolve --applied 20260627100000_add_listing_lot_area`.

-- AlterTable
ALTER TABLE "listings" ADD COLUMN "lot_area" DECIMAL(10,2);
