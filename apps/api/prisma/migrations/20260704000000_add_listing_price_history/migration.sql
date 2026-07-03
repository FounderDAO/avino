-- CreateTable (ADR-0121: append-only история цены объявления)
CREATE TABLE "listing_price_history" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_price_history_listing_id_created_at_idx"
    ON "listing_price_history"("listing_id", "created_at");

-- AddForeignKey
ALTER TABLE "listing_price_history"
    ADD CONSTRAINT "listing_price_history_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: у существующих объявлений история начинается с текущей цены,
-- датированной созданием объявления (иначе история пуста навсегда).
INSERT INTO "listing_price_history" ("id", "listing_id", "price", "currency", "created_at")
SELECT gen_random_uuid(), l."id", l."price", l."currency", l."created_at"
FROM "listings" l;
