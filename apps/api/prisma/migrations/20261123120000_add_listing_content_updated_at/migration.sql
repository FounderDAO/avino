-- SEO AUD-6: дата изменения содержимого объявления (lastmod в sitemap, dateModified в разметке).
-- updated_at не подходит: двигается от продвижения и модерационных флагов.
ALTER TABLE "listings" ADD COLUMN "content_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now();

-- Начальное значение для существующих: самая поздняя из известных дат содержимого —
-- создание, публикация, последнее изменение цены.
UPDATE "listings" AS l
SET "content_updated_at" = GREATEST(
  l."created_at",
  COALESCE(l."published_at", l."created_at"),
  COALESCE(
    (SELECT max(h."created_at") FROM "listing_price_history" AS h WHERE h."listing_id" = l."id"),
    l."created_at"
  )
);
