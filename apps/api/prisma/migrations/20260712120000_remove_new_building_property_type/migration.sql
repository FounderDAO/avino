-- Удаление NEW_BUILDING из PropertyType: «новостройка» — не тип недвижимости,
-- а вычисляемая категория по year_built (`?new_construction=true`).
-- Существующие NEW_BUILDING-объявления переводятся в APARTMENT.

-- 1. Данные: listings + сохранённые поиски (filters_json мог содержать property_type).
UPDATE "listings" SET "property_type" = 'APARTMENT' WHERE "property_type" = 'NEW_BUILDING';

UPDATE "saved_searches"
SET "filters_json" = replace("filters_json"::text, '"NEW_BUILDING"', '"APARTMENT"')::jsonb
WHERE "filters_json"::text LIKE '%NEW_BUILDING%';

-- 2. Тип: Postgres не умеет DROP VALUE у enum — пересоздаём тип.
ALTER TYPE "PropertyType" RENAME TO "PropertyType_old";
CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'HOUSE', 'LAND', 'COMMERCIAL');
ALTER TABLE "listings"
  ALTER COLUMN "property_type" TYPE "PropertyType"
  USING "property_type"::text::"PropertyType";
DROP TYPE "PropertyType_old";
