-- promotion_plans: admin-editable tariff matrix (fixed 6 rows enforced by CHECK)
CREATE TABLE "promotion_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" "PromotionType" NOT NULL,
  "period_days" SMALLINT NOT NULL,
  "price" DECIMAL(14,2) NOT NULL,
  "currency" "Currency" NOT NULL DEFAULT 'UZS',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "promotion_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotion_plans_type_check" CHECK ("type" IN ('TOP','VIP')),
  CONSTRAINT "promotion_plans_period_check" CHECK ("period_days" IN (7,14,30))
);
CREATE UNIQUE INDEX "promotion_plans_type_period_days_key"
  ON "promotion_plans" ("type","period_days");

INSERT INTO "promotion_plans" ("id","type","period_days","price","currency","is_active","updated_at") VALUES
  (gen_random_uuid(),'TOP',7,'50000.00','UZS',true,now()),
  (gen_random_uuid(),'TOP',14,'90000.00','UZS',true,now()),
  (gen_random_uuid(),'TOP',30,'150000.00','UZS',true,now()),
  (gen_random_uuid(),'VIP',7,'120000.00','UZS',true,now()),
  (gen_random_uuid(),'VIP',14,'210000.00','UZS',true,now()),
  (gen_random_uuid(),'VIP',30,'350000.00','UZS',true,now())
ON CONFLICT ("type","period_days") DO NOTHING;

CREATE TABLE "app_settings" (
  "key" VARCHAR(80) NOT NULL,
  "value" VARCHAR(255) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
INSERT INTO "app_settings" ("key","value","updated_at")
  VALUES ('promotion_expiry_cron','0 */12 * * *', now())
ON CONFLICT ("key") DO NOTHING;
