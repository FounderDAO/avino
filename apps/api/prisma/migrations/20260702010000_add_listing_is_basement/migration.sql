-- Цокольный этаж как отдельный флаг (баглист мобилки #4, вариант B):
-- зарезервированное значение floor ломало бы floor_min/max/not_first_floor.
ALTER TABLE "listings" ADD COLUMN "is_basement" BOOLEAN NOT NULL DEFAULT false;
