-- CreateEnum
CREATE TYPE "LegalDocKind" AS ENUM ('TERMS', 'PRIVACY');

-- CreateEnum
CREATE TYPE "LegalDocStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL,
    "kind" "LegalDocKind" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "status" "LegalDocStatus" NOT NULL DEFAULT 'DRAFT',
    "title_ru" TEXT NOT NULL DEFAULT '',
    "title_uz" TEXT NOT NULL DEFAULT '',
    "title_en" TEXT NOT NULL DEFAULT '',
    "body_md_ru" TEXT NOT NULL DEFAULT '',
    "body_md_uz" TEXT NOT NULL DEFAULT '',
    "body_md_en" TEXT NOT NULL DEFAULT '',
    "published_at" TIMESTAMPTZ(6),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_documents_kind_status_idx" ON "legal_documents"("kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_kind_version_key" ON "legal_documents"("kind", "version");

-- AddForeignKey
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

