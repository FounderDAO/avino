-- AlterEnum: новый тип уведомления (значение НЕ используется в этой миграции,
-- поэтому ADD VALUE в транзакции миграции безопасен на PG12+).
ALTER TYPE "NotificationType" ADD VALUE 'TOUR_REQUEST_STATUS_CHANGED';

-- CreateEnum
CREATE TYPE "TourRequestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED');

-- AlterTable: приём туров на объявлении
ALTER TABLE "listings"
  ADD COLUMN "tours_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tour_windows" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "tour_requests" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "status" "TourRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_date" DATE NOT NULL,
    "window_start" TEXT NOT NULL,
    "window_end" TEXT NOT NULL,
    "requester_name" TEXT NOT NULL,
    "requester_phone" TEXT NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tour_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tour_requests_listing_id_idx" ON "tour_requests"("listing_id");
CREATE INDEX "tour_requests_requester_id_idx" ON "tour_requests"("requester_id");
CREATE INDEX "tour_requests_status_idx" ON "tour_requests"("status");

ALTER TABLE "tour_requests" ADD CONSTRAINT "tour_requests_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tour_requests" ADD CONSTRAINT "tour_requests_requester_id_fkey"
  FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
