-- Complaints (DB_SCHEMA.md §7, API.md §16, TASK-132).
--
-- User-facing flow: a USER reports a listing (POST /complaints); MODERATOR/ADMIN
-- triage them (GET/PATCH /admin/complaints). handled_by/handled_at capture who
-- processed the complaint last and when. status follows
-- NEW → IN_REVIEW → RESOLVED | REJECTED.
--
-- listing_id is nullable + ON DELETE CASCADE (DB_SCHEMA §7): a complaint does not
-- outlive physical deletion of the listing. reporter_id and handled_by are
-- ON DELETE SET NULL and nullable so the complaint survives deletion of the
-- reporter's or the handling moderator's account (history is preserved).

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('NEW', 'IN_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "complaints" (
    "id" UUID NOT NULL,
    "listing_id" UUID,
    "reporter_id" UUID,
    "reason" VARCHAR(120) NOT NULL,
    "details" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'NEW',
    "handled_by" UUID,
    "handled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "complaints_status_idx" ON "complaints"("status");

-- CreateIndex
CREATE INDEX "complaints_listing_id_idx" ON "complaints"("listing_id");

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
