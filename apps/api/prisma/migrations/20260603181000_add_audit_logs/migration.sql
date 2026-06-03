-- Audit logs (DB_SCHEMA.md §12, TASK-038, ADR-0004).
--
-- Generic audit trail for security-sensitive actions, in addition to the domain
-- logs (moderation_logs, promotion_logs). `action` is a free-form VARCHAR(80),
-- NOT an enum, so new auditable actions (LOGIN, ROLE_CHANGE,
-- LISTING_STATUS_CHANGE, LISTING_PROMOTION_CHANGE, DELETE_LISTING,
-- ADMIN_USER_UPDATE, …) need no migration. entity_type/entity_id form a generic
-- polymorphic reference; metadata is free-form jsonb. actor_id is ON DELETE SET
-- NULL and nullable (null = system) so the audit row survives deletion of the
-- actor.

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(60),
    "entity_id" UUID,
    "ip" VARCHAR(64),
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
