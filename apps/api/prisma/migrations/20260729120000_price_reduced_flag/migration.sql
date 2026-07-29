-- Флаг «Цена снижена» (спека 2026-07-29-price-reduced-filter-design.md)
ALTER TABLE "listings" ADD COLUMN "price_reduced" BOOLEAN NOT NULL DEFAULT false;

-- Частичный индекс под фильтр ?price_reduced=true (Prisma partial не умеет — raw SQL)
CREATE INDEX "listings_price_reduced_idx" ON "listings" ("price_reduced")
  WHERE "price_reduced" = true;

-- Backfill из listing_price_history (ADR-0121): true, если последнее изменение
-- цены — снижение в той же валюте. Одна запись в истории (цена не менялась) → false.
WITH ranked AS (
  SELECT listing_id, price, currency,
         ROW_NUMBER() OVER (PARTITION BY listing_id ORDER BY created_at DESC) AS rn
  FROM listing_price_history
)
UPDATE listings l
SET price_reduced = true
FROM ranked cur, ranked prev
WHERE cur.listing_id = l.id
  AND prev.listing_id = l.id
  AND cur.rn = 1
  AND prev.rn = 2
  AND cur.currency = prev.currency
  AND cur.price < prev.price;
