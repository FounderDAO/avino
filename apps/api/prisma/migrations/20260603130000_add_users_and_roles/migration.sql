-- Core identity schema: users, user_profiles, roles, user_roles (DB_SCHEMA.md §4).
-- The PostgreSQL extensions (pgcrypto/postgis/pg_trgm) are owned by the baseline
-- migration 20260603120000_enable_extensions and are NOT re-created here.
--
-- This is the first table migration, so it also creates ALL domain enum types
-- declared in schema.prisma (TASK-032). Types not yet referenced by a model
-- (ListingStatus/PromotionType/Currency) are created now so the schema and the
-- migration history stay in sync; they will be reused by listings (TASK-035).
--
-- Two things Prisma cannot express are appended as raw SQL at the end
-- (DB_SCHEMA.md §14/§15): the PARTIAL UNIQUE indexes on users.phone/email
-- scoped to non-DELETED accounts (ADR-013), and the users CHECK constraints.

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('NEW', 'ACTIVE', 'DRAFT', 'REJECTED', 'DELETED', 'ARCHIVED', 'SOLD', 'RENTED');

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('NORMAL', 'TOP', 'VIP');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('UZS', 'USD');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('UZ', 'RU', 'EN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'DELETED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "is_phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "default_language" "Language" NOT NULL DEFAULT 'RU',
    "last_login_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "display_name" VARCHAR(150),
    "avatar_url" TEXT,
    "contact_phone" VARCHAR(20),
    "preferred_language" "Language",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Raw SQL Prisma cannot express (DB_SCHEMA.md §14/§15).
-- ---------------------------------------------------------------------------

-- PARTIAL UNIQUE indexes (ADR-013, Variant A): phone/email are unique only among
-- non-DELETED accounts. A soft-deleted account frees its contact for re-registration
-- while the original value is preserved on the deleted row for history/audit.
CREATE UNIQUE INDEX "uniq_users_phone_active"
    ON "users" ("phone")
    WHERE status <> 'DELETED' AND phone IS NOT NULL;

CREATE UNIQUE INDEX "uniq_users_email_active"
    ON "users" ("email")
    WHERE status <> 'DELETED' AND email IS NOT NULL;

-- CHECK constraints (DB_SCHEMA.md §15).
-- At least one contact channel is required (auth is phone/email OTP).
ALTER TABLE "users"
    ADD CONSTRAINT "users_contact_present_check"
    CHECK (phone IS NOT NULL OR email IS NOT NULL);

-- deleted_at is set if and only if the account is soft-deleted.
ALTER TABLE "users"
    ADD CONSTRAINT "users_deleted_at_consistency_check"
    CHECK ((status = 'DELETED') = (deleted_at IS NOT NULL));
