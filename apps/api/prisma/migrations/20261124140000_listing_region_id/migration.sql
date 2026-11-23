-- SEO AUD-5: регион у объявления (денормализация из района) — фильтр по региону
-- по индексу вместо подзапроса district_id IN (SELECT … FROM districts …).
ALTER TABLE "listings" ADD COLUMN "region_id" UUID;

UPDATE "listings" AS l
SET "region_id" = d."region_id"
FROM "districts" AS d
WHERE d."id" = l."district_id";

CREATE INDEX "listings_status_region_id_idx" ON "listings"("status", "region_id");

-- region_id всегда из района: любой путь записи (Prisma, raw SQL бэкфилла,
-- фоновое определение района) получает регион автоматически.
CREATE OR REPLACE FUNCTION listings_sync_region()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.district_id IS NULL THEN
        NEW.region_id := NULL;
    ELSE
        NEW.region_id := (SELECT "region_id" FROM "districts" WHERE "id" = NEW.district_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listings_sync_region_trg
    BEFORE INSERT OR UPDATE OF district_id ON "listings"
    FOR EACH ROW
    EXECUTE FUNCTION listings_sync_region();

-- Район перенесли в другой регион — его объявления следуют за ним.
CREATE OR REPLACE FUNCTION districts_propagate_region()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE "listings" SET "region_id" = NEW.region_id WHERE "district_id" = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER districts_propagate_region_trg
    AFTER UPDATE OF region_id ON "districts"
    FOR EACH ROW
    WHEN (OLD.region_id IS DISTINCT FROM NEW.region_id)
    EXECUTE FUNCTION districts_propagate_region();
