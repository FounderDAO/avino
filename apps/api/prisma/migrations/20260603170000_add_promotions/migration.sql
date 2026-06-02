-- Promotion schema (DB_SCHEMA.md §8, ADR-0004 VIP/TOP promotion model).
-- listing_promotions is the SOURCE OF TRUTH (ledger); the denormalized
-- listings.promotion_* columns (TASK-035) are only a READ CACHE of the active
-- row, kept in sync atomically by the application on activate/cancel/extend/
-- expire. promotion_logs is the admin-action audit for promotions.
--
-- This migration introduces three new Postgres enum types under the ADR-0008
-- rules — PromotionStatus / PaymentStatus / PromotionAdminAction. The existing
-- enums (PromotionType/Currency — TASK-032) are NOT re-created here.
--
-- Three things Prisma migrate cannot express are appended as raw SQL
-- (DB_SCHEMA.md §8/§15):
--   1. PARTIAL UNIQUE (listing_id) WHERE status = 'ACTIVE' — at most ONE active
--      promotion per listing (ADR-0004);
--   2. PARTIAL UNIQUE (payment_reference) WHERE payment_reference IS NOT NULL —
--      idempotency key for future payment callbacks;
--   3. CHECK constraints: period_days IN (7,14,30) and the expires_at/starts_at
--      ordering guard.
--
-- ON DELETE behaviour (DB_SCHEMA §8): listing_promotions.listing_id CASCADE,
-- user_id SET NULL (promotion survives the requester's deletion).
-- promotion_logs.listing_id CASCADE, listing_promotion_id SET NULL, admin_id
-- SET NULL (the audit row survives deletion of the promotion row or the admin).

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PromotionAdminAction" AS ENUM ('ACTIVATE_VIP', 'ACTIVATE_TOP', 'CANCEL_PROMOTION', 'EXTEND_PROMOTION');

-- CreateTable
CREATE TABLE "listing_promotions" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "user_id" UUID,
    "type" "PromotionType" NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "period_days" SMALLINT NOT NULL,
    "starts_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "price" DECIMAL(14,2),
    "currency" "Currency",
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "payment_provider" VARCHAR(40),
    "payment_reference" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listing_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_logs" (
    "id" UUID NOT NULL,
    "listing_promotion_id" UUID,
    "listing_id" UUID NOT NULL,
    "admin_id" UUID,
    "action" "PromotionAdminAction" NOT NULL,
    "old_type" "PromotionType",
    "new_type" "PromotionType",
    "old_expires_at" TIMESTAMPTZ(6),
    "new_expires_at" TIMESTAMPTZ(6),
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_promotions_listing_id_idx" ON "listing_promotions"("listing_id");

-- CreateIndex
CREATE INDEX "listing_promotions_status_idx" ON "listing_promotions"("status");

-- CreateIndex
CREATE INDEX "listing_promotions_expires_at_idx" ON "listing_promotions"("expires_at");

-- CreateIndex
CREATE INDEX "promotion_logs_listing_id_idx" ON "promotion_logs"("listing_id");

-- CreateIndex
CREATE INDEX "promotion_logs_listing_promotion_id_idx" ON "promotion_logs"("listing_promotion_id");

-- CreateIndex
CREATE INDEX "promotion_logs_admin_id_idx" ON "promotion_logs"("admin_id");

-- AddForeignKey
ALTER TABLE "listing_promotions" ADD CONSTRAINT "listing_promotions_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_promotions" ADD CONSTRAINT "listing_promotions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_logs" ADD CONSTRAINT "promotion_logs_listing_promotion_id_fkey" FOREIGN KEY ("listing_promotion_id") REFERENCES "listing_promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_logs" ADD CONSTRAINT "promotion_logs_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_logs" ADD CONSTRAINT "promotion_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Raw SQL Prisma cannot express (DB_SCHEMA.md §8/§15, ADR-0004).
-- ---------------------------------------------------------------------------

-- At most ONE active promotion per listing (ADR-0004). Partial unique index:
-- many PENDING_PAYMENT/EXPIRED/CANCELLED/REFUNDED rows are allowed, but only one
-- ACTIVE row can exist per listing at a time.
CREATE UNIQUE INDEX "listing_promotions_listing_id_active_key"
    ON "listing_promotions" ("listing_id")
    WHERE status = 'ACTIVE';

-- Idempotency key for future payment callbacks: a non-null payment_reference is
-- globally unique so a retried callback cannot activate/charge twice (§15).
CREATE UNIQUE INDEX "listing_promotions_payment_reference_key"
    ON "listing_promotions" ("payment_reference")
    WHERE payment_reference IS NOT NULL;

-- Promotion periods are fixed at 7 / 14 / 30 days (DB_SCHEMA §15).
ALTER TABLE "listing_promotions"
    ADD CONSTRAINT "listing_promotions_period_days_check"
    CHECK (period_days IN (7, 14, 30));

-- A promotion window must be forward in time when both bounds are set (§15).
ALTER TABLE "listing_promotions"
    ADD CONSTRAINT "listing_promotions_period_order_check"
    CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at);
