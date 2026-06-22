-- Generated via `prisma migrate diff --from-schema-datamodel` (no local shadow DB).
-- Content is equivalent to `migrate dev`. Apply on staging/CI with `prisma migrate
-- deploy`; if the directory is applied out-of-band, verify objects then
-- `prisma migrate resolve --applied 20260622100000_admin_broadcast`.

-- CreateEnum
CREATE TYPE "BroadcastAudience" AS ENUM ('SINGLE', 'SEGMENT');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_BROADCAST';

-- AlterEnum
ALTER TYPE "NotificationChannel" ADD VALUE 'SMS';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "broadcast_id" UUID;

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "audience_type" "BroadcastAudience" NOT NULL,
    "target_user_id" UUID,
    "language" "Language" NOT NULL,
    "filter_status" "UserStatus",
    "filter_role" VARCHAR(40),
    "channels" "NotificationChannel"[],
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_at" TIMESTAMPTZ(6),
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "broadcasts_status_scheduled_at_idx" ON "broadcasts"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "broadcasts_created_by_created_at_idx" ON "broadcasts"("created_by", "created_at");

-- CreateIndex
CREATE INDEX "notifications_broadcast_id_idx" ON "notifications"("broadcast_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "broadcasts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

