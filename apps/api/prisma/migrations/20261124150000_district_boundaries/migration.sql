-- SEO AUD-3: границы районов — район по точке через PostGIS, геокодер становится запасным.
-- Данные загружает scripts/load-district-boundaries.ts из GeoJSON (источник и лицензия —
-- решение владельца: OSM — ODbL, geoBoundaries — по лицензии набора).
CREATE TABLE "district_boundaries" (
  "district_id" UUID NOT NULL,
  "geom" geography(MultiPolygon, 4326) NOT NULL,
  "source" VARCHAR(120) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "district_boundaries_pkey" PRIMARY KEY ("district_id"),
  CONSTRAINT "district_boundaries_district_id_fkey" FOREIGN KEY ("district_id")
    REFERENCES "districts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- GIST для ST_Covers по точке (Prisma не создаёт GIST для Unsupported-колонок).
CREATE INDEX "idx_district_boundaries_geom" ON "district_boundaries" USING GIST ("geom");
