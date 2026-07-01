-- Санузлы становятся дробными с шагом 0.5 (баглист мобилки #3, вариант A).
-- SmallInt -> numeric(3,1): расширяющий каст, существующие целые сохраняются.
-- Защита от legacy-значений: старый DTO допускал до 32767, numeric(3,1) вмещает max 99.9.
UPDATE "listings" SET "bathrooms" = NULL WHERE "bathrooms" > 99;
ALTER TABLE "listings" ALTER COLUMN "bathrooms" TYPE numeric(3,1);
