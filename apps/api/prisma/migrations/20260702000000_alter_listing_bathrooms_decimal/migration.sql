-- Санузлы становятся дробными с шагом 0.5 (баглист мобилки #3, вариант A).
-- SmallInt -> numeric(3,1): расширяющий каст, существующие целые сохраняются.
ALTER TABLE "listings" ALTER COLUMN "bathrooms" TYPE numeric(3,1);
