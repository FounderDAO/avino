-- Generated to match schema.prisma (no local shadow DB). Apply on staging/CI with
-- `prisma migrate deploy`; if applied out-of-band, verify then
-- `prisma migrate resolve --applied 20260627090000_add_listing_parking_type`.

-- CreateEnum
CREATE TYPE "ParkingType" AS ENUM ('YARD', 'COVERED', 'GARAGE', 'UNDERGROUND');

-- AlterTable
ALTER TABLE "listings" ADD COLUMN "parking_type" "ParkingType";
