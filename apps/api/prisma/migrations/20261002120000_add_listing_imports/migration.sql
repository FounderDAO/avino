-- CreateEnum
CREATE TYPE "ListingImportOutcome" AS ENUM ('CREATED', 'SKIPPED_EXISTS', 'SKIPPED_DUPLICATE_IN_FILE', 'ERROR');

-- CreateTable
CREATE TABLE "listing_imports" (
    "id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_exists_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_in_file_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "unknown_columns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_import_rows" (
    "id" UUID NOT NULL,
    "import_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "outcome" "ListingImportOutcome" NOT NULL,
    "listing_id" UUID,
    "owner_is_new" BOOLEAN NOT NULL DEFAULT false,
    "duplicate_of_row" INTEGER,
    "errors" JSONB,
    "raw" JSONB NOT NULL,

    CONSTRAINT "listing_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_imports_created_by_id_idx" ON "listing_imports"("created_by_id");

-- CreateIndex
CREATE INDEX "listing_import_rows_listing_id_idx" ON "listing_import_rows"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_import_rows_import_id_row_number_key" ON "listing_import_rows"("import_id", "row_number");

-- AddForeignKey
ALTER TABLE "listing_imports" ADD CONSTRAINT "listing_imports_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_import_rows" ADD CONSTRAINT "listing_import_rows_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "listing_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

