-- Chat and notifications (DB_SCHEMA.md §10/§11, TASK-038, ADR-0003/ADR-0010).
--
-- chat_threads bind a listing to its two participants using initiator_id /
-- owner_id — NOT buyer/seller, because a listing can be SALE or RENT (ADR-0003).
-- UNIQUE(listing_id, initiator_id, owner_id) = one thread per pair+listing;
-- last_message_at is a denormalized cursor for sorting the thread list. GUEST
-- cannot start a thread and a thread is not allowed on a DELETED listing (both
-- enforced in the service layer). chat_messages.sender_id is ON DELETE SET NULL
-- so a message survives in the thread history when the sender's account is
-- physically removed; MVP uses API polling and WebSocket can be added later
-- without a schema change.
--
-- notifications are always produced as BullMQ jobs (never sent synchronously in
-- a request handler); data_json carries entity refs (listing_id, thread_id…).
-- notification_devices is a push-token registry stub for the future Flutter app
-- — UNIQUE(push_token) globally; PUSH transport (FCM/APNs) is wired up later.
--
-- This migration introduces four new Postgres enum types under the ADR-0008
-- rules — NotificationType / NotificationChannel / NotificationStatus /
-- DevicePlatform — created here as the first models (notifications /
-- notification_devices) to reference them.

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SAVED_SEARCH_NEW_LISTING', 'FAVORITE_PRICE_DROP', 'NEW_CHAT_MESSAGE', 'LISTING_MODERATION_STATUS_CHANGED', 'NEW_LEAD', 'PROMOTION_ACTIVATED', 'PROMOTION_EXPIRED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'PUSH', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateTable
CREATE TABLE "chat_threads" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "initiator_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "last_message_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chat_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "sender_id" UUID,
    "body" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "title" VARCHAR(255),
    "body" TEXT,
    "data_json" JSONB,
    "read_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "push_token" VARCHAR(512) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_threads_listing_id_idx" ON "chat_threads"("listing_id");

-- CreateIndex
CREATE INDEX "chat_threads_initiator_id_idx" ON "chat_threads"("initiator_id");

-- CreateIndex
CREATE INDEX "chat_threads_owner_id_idx" ON "chat_threads"("owner_id");

-- CreateIndex
CREATE INDEX "chat_threads_last_message_at_idx" ON "chat_threads"("last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_threads_listing_id_initiator_id_owner_id_key" ON "chat_threads"("listing_id", "initiator_id", "owner_id");

-- CreateIndex
CREATE INDEX "chat_messages_thread_id_created_at_idx" ON "chat_messages"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_status_idx" ON "notifications"("user_id", "status");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "notification_devices_user_id_idx" ON "notification_devices"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_devices_push_token_key" ON "notification_devices"("push_token");

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_devices" ADD CONSTRAINT "notification_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
