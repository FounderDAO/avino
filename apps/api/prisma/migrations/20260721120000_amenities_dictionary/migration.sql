-- Справочник удобств вместо enum Amenity. Применять на staging/CI через
-- `prisma migrate deploy`; при out-of-band — verify + `prisma migrate resolve
-- --applied 20260721120000_amenities_dictionary`.

-- 1. Таблица-справочник
CREATE TABLE "amenities" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "code"       TEXT NOT NULL,
  "label_ru"   TEXT NOT NULL,
  "label_uz"   TEXT NOT NULL,
  "label_en"   TEXT NOT NULL,
  "is_active"  BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "amenities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "amenities_code_key" ON "amenities" ("code");
CREATE INDEX "amenities_is_active_sort_order_idx" ON "amenities" ("is_active", "sort_order");

-- 2. Сид 9 текущих значений (лейблы из i18n клиента)
INSERT INTO "amenities" ("code", "label_ru", "label_uz", "label_en", "sort_order") VALUES
  ('AIR_CONDITIONING', 'Кондиционер',     'Konditsioner',   'Air conditioning', 0),
  ('FURNITURE',        'Мебель',          'Mebel',          'Furniture',        1),
  ('APPLIANCES',       'Бытовая техника', 'Maishiy texnika','Appliances',       2),
  ('INTERNET',         'Интернет',        'Internet',       'Internet',         3),
  ('ELEVATOR',         'Лифт',            'Lift',           'Elevator',         4),
  ('BALCONY',          'Балкон',          'Balkon',         'Balcony',          5),
  ('HEATING',          'Отопление',       'Isitish',        'Heating',          6),
  ('SECURITY',         'Видеонаблюдение', 'Videokuzatuv',   'Security',         7),
  ('POOL',             'Бассейн',         'Basseyn',        'Pool',             8);

-- 3. listings.amenities: enum-массив -> text[] (GIN пересоздать)
DROP INDEX IF EXISTS "listings_amenities_idx";
ALTER TABLE "listings"
  ALTER COLUMN "amenities" DROP DEFAULT,
  ALTER COLUMN "amenities" TYPE TEXT[] USING "amenities"::text[],
  ALTER COLUMN "amenities" SET DEFAULT '{}';
CREATE INDEX "listings_amenities_idx" ON "listings" USING GIN ("amenities");

-- 4. Удалить enum-тип (колонка на него больше не ссылается)
DROP TYPE "Amenity";
