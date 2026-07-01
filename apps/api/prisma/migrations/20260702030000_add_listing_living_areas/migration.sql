-- Жилая/нежилая площадь для дома/особняка (баглист мобилки #10).
-- Nullable, без бэкфилла; для всех типов недвижимости (правило показа — на клиенте).
ALTER TABLE "listings"
  ADD COLUMN "living_area" numeric(10,2),
  ADD COLUMN "non_living_area" numeric(10,2);
