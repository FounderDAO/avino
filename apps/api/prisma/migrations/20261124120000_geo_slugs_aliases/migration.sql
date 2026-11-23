-- SEO AUD-15: человекочитаемые slug'и регионов и районов, английские названия, таблица старых slug'ов.
-- code остаётся как есть (совместимость); slug — для адресов сайта, неизменяемый (переименования → geo_aliases).

-- Регионы: code уже чистый латинский slug (toshkent-shahri, fargona, ...).
ALTER TABLE "regions" ADD COLUMN "slug" VARCHAR(80);
UPDATE "regions" SET "slug" = "code";
ALTER TABLE "regions" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "regions_slug_key" ON "regions"("slug");

-- Районы: slug из name_uz — нижний регистр, без апострофов (o‘, g‘), без суффикса «tumani»/«shahri».
-- Город и одноимённый район в одном регионе (Andijon / Andijon tumani): город — andijon,
-- район — andijon-tumani. Оставшиеся совпадения — с числовым хвостом (-2, -3).
ALTER TABLE "districts" ADD COLUMN "slug" VARCHAR(80);
WITH base AS (
  SELECT
    "id",
    "region_id",
    ("name_uz" ~* '\s+tumani$') AS is_tuman,
    trim(both '-' from regexp_replace(
      regexp_replace(
        regexp_replace(lower("name_uz"), '\s+(tumani|shahri)$', ''),
        '[‘’ʻʼ''`]', '', 'g'),
      '[^a-z0-9]+', '-', 'g')) AS b
  FROM "districts"
),
counted AS (
  SELECT *, count(*) OVER (PARTITION BY "region_id", b) AS n FROM base
),
candidate AS (
  SELECT "id", "region_id",
    CASE WHEN n > 1 AND is_tuman THEN b || '-tumani' ELSE b END AS c
  FROM counted
),
numbered AS (
  SELECT "id", c, row_number() OVER (PARTITION BY "region_id", c ORDER BY "id") AS rn FROM candidate
)
UPDATE "districts" AS d
SET "slug" = CASE WHEN nb.rn = 1 THEN nb.c ELSE nb.c || '-' || nb.rn END
FROM numbered AS nb
WHERE nb."id" = d."id";
ALTER TABLE "districts" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "districts_region_id_slug_key" ON "districts"("region_id", "slug");

-- Английские названия: у 14 регионов и 201 района name_en был копией name_uz.
UPDATE "regions" SET "name_en" = CASE "code"
  WHEN 'andijon' THEN 'Andijan Region'
  WHEN 'buxoro' THEN 'Bukhara Region'
  WHEN 'toshkent-shahri' THEN 'Tashkent City'
  WHEN 'jizzax' THEN 'Jizzakh Region'
  WHEN 'qashqadaryo' THEN 'Kashkadarya Region'
  WHEN 'navoiy' THEN 'Navoi Region'
  WHEN 'namangan' THEN 'Namangan Region'
  WHEN 'qoraqalpogiston' THEN 'Republic of Karakalpakstan'
  WHEN 'samarqand' THEN 'Samarkand Region'
  WHEN 'surxondaryo' THEN 'Surkhandarya Region'
  WHEN 'sirdaryo' THEN 'Syrdarya Region'
  WHEN 'toshkent' THEN 'Tashkent Region'
  WHEN 'fargona' THEN 'Fergana Region'
  WHEN 'xorazm' THEN 'Khorezm Region'
  ELSE "name_en" END;
-- Районы: «X tumani» → «X District»; города — латиница как есть. Требует вычитки (стандартные
-- английские написания), но уже лучше узбекского суффикса на английской странице.
UPDATE "districts"
SET "name_en" = regexp_replace("name_uz", '\s+tumani$', ' District')
WHERE "name_en" = "name_uz";

-- Старые slug'и для 301 с прежних адресов после переименований.
CREATE TYPE "GeoEntityType" AS ENUM ('REGION', 'DISTRICT');
CREATE TABLE "geo_aliases" (
  "id" UUID NOT NULL,
  "entity_type" "GeoEntityType" NOT NULL,
  "entity_id" UUID NOT NULL,
  "old_slug" VARCHAR(80) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "geo_aliases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "geo_aliases_entity_type_old_slug_key" ON "geo_aliases"("entity_type", "old_slug");
CREATE INDEX "geo_aliases_entity_id_idx" ON "geo_aliases"("entity_id");
