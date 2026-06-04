-- Moderation logs (DB_SCHEMA.md §7, API.md §16, TASK-053).
--
-- Domain log for the listing moderation queue: every moderator action on a
-- listing is recorded here, in addition to the generic audit_logs
-- (LISTING_STATUS_CHANGE). old_status/new_status capture the transition; reason
-- is an optional free-form note (e.g. for REJECT). The moderation_action enum
-- maps to listing_status: APPROVE→ACTIVE, SEND_TO_DRAFT→DRAFT, REJECT→REJECTED,
-- DELETE→DELETED.
--
-- listing_id is ON DELETE CASCADE — the log does not outlive physical deletion
-- of the listing. moderator_id is ON DELETE SET NULL and nullable (null =
-- system) so the audit row survives deletion of the moderator's account.

-- CreateEnum
CREATE TYPE "ModerationAction" AS ENUM ('APPROVE', 'SEND_TO_DRAFT', 'REJECT', 'DELETE');

-- CreateTable
CREATE TABLE "moderation_logs" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "moderator_id" UUID,
    "action" "ModerationAction" NOT NULL,
    "old_status" "ListingStatus",
    "new_status" "ListingStatus",
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moderation_logs_listing_id_idx" ON "moderation_logs"("listing_id");

-- CreateIndex
CREATE INDEX "moderation_logs_moderator_id_idx" ON "moderation_logs"("moderator_id");

-- CreateIndex
CREATE INDEX "moderation_logs_created_at_idx" ON "moderation_logs"("created_at");

-- AddForeignKey
ALTER TABLE "moderation_logs" ADD CONSTRAINT "moderation_logs_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_logs" ADD CONSTRAINT "moderation_logs_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
