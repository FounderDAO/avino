-- SEO AUD-8: варианты фото (WebP 320/640/1280) — [{ "key", "width", "height", "format" }].
-- Раньше thumbnail_url был оригиналом (до ~2,9 МБ JPEG), а width/height не заполнялись.
ALTER TABLE "listing_media" ADD COLUMN "variants" JSONB;
