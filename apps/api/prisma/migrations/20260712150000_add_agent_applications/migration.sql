-- agent_applications: заявки «Стать агентом» (ADR-0140)
CREATE TYPE "AgentApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "agent_applications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "agency_name" VARCHAR(255),
    "about" TEXT NOT NULL,
    "status" "AgentApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reject_reason" TEXT,
    "moderator_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "agent_applications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_applications_status_created_at_idx" ON "agent_applications"("status", "created_at");
CREATE INDEX "agent_applications_user_id_idx" ON "agent_applications"("user_id");
-- Одна активная (PENDING) заявка на пользователя.
CREATE UNIQUE INDEX "agent_applications_user_pending_key" ON "agent_applications"("user_id") WHERE "status" = 'PENDING';

ALTER TABLE "agent_applications" ADD CONSTRAINT "agent_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_applications" ADD CONSTRAINT "agent_applications_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Уведомление о решении по заявке (канал IN_APP).
ALTER TYPE "NotificationType" ADD VALUE 'AGENT_APPLICATION_RESOLVED';
