-- districts: geo reference table for Tashkent districts (TASK-209, ADR-0068).
-- Standalone table — NO FK from listings.district_id (existing listings carry
-- arbitrary district_id values; FK will be added after data migration).
-- 12 Tashkent districts seeded with fixed UUIDs (idempotent ON CONFLICT DO NOTHING).
CREATE TABLE "districts" (
  "id"         UUID         NOT NULL,
  "code"       VARCHAR(40)  NOT NULL,
  "name_uz"    VARCHAR(120) NOT NULL,
  "name_ru"    VARCHAR(120) NOT NULL,
  "name_en"    VARCHAR(120) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "districts_code_key" ON "districts" ("code");

INSERT INTO "districts" ("id","code","name_uz","name_ru","name_en","updated_at") VALUES
  ('d0000000-0000-4000-8000-000000000001','bektemir','Bektemir','Бектемир','Bektemir',now()),
  ('d0000000-0000-4000-8000-000000000002','chilonzor','Chilonzor','Чиланзар','Chilanzar',now()),
  ('d0000000-0000-4000-8000-000000000003','mirobod','Mirobod','Мирабад','Mirabad',now()),
  ('d0000000-0000-4000-8000-000000000004','mirzo-ulugbek','Mirzo Ulug''bek','Мирзо-Улугбек','Mirzo-Ulugbek',now()),
  ('d0000000-0000-4000-8000-000000000005','olmazor','Olmazor','Алмазар','Almazar',now()),
  ('d0000000-0000-4000-8000-000000000006','sergeli','Sergeli','Сергели','Sergeli',now()),
  ('d0000000-0000-4000-8000-000000000007','shayxontohur','Shayxontohur','Шайхантахур','Shaykhantakhur',now()),
  ('d0000000-0000-4000-8000-000000000008','uchtepa','Uchtepa','Учтепа','Uchtepa',now()),
  ('d0000000-0000-4000-8000-000000000009','yakkasaroy','Yakkasaroy','Яккасарай','Yakkasaray',now()),
  ('d0000000-0000-4000-8000-000000000010','yashnobod','Yashnobod','Яшнабад','Yashnabad',now()),
  ('d0000000-0000-4000-8000-000000000011','yangihayot','Yangihayot','Янгихаёт','Yangihayot',now()),
  ('d0000000-0000-4000-8000-000000000012','yunusobod','Yunusobod','Юнусабад','Yunusabad',now())
ON CONFLICT ("id") DO NOTHING;
