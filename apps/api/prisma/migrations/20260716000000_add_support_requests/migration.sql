-- support_requests: обращения в поддержку с формы /help
CREATE TYPE "SupportRequestStatus" AS ENUM ('NEW', 'IN_REVIEW', 'RESOLVED');

CREATE TABLE "support_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "name" VARCHAR(120),
    "contact" VARCHAR(160) NOT NULL,
    "message" TEXT NOT NULL,
    "status" "SupportRequestStatus" NOT NULL DEFAULT 'NEW',
    "handled_by" UUID,
    "handled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "support_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_requests_status_idx" ON "support_requests"("status");

ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
