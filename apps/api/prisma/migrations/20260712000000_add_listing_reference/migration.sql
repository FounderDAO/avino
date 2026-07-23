-- Публичный человекочитаемый номер объявления (ADR-0137). Отдельная колонка
-- рядом с UUID-PK `id`: сам первичный ключ НЕ меняем — все FK
-- (listing_translations, listing_media, favorites, chat, price_history и т.д.)
-- и существующие URL остаются рабочими. reference лишь даёт короткий номер,
-- по которому объявление можно быстро найти/продиктовать.
--
-- Sequence стартует со 100000: последовательные номера от 1 раскрыли бы общее
-- число объявлений (competitive intel + перебор), поэтому нумерация со сдвига.

CREATE SEQUENCE "listings_reference_seq" START WITH 100000;

ALTER TABLE "listings" ADD COLUMN "reference" INTEGER;

-- Бэкфилл существующих строк детерминированно (по created_at, затем id как
-- стабильный хвост), номера подряд начиная со 100000.
WITH ordered AS (
  SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS rn
  FROM "listings"
)
UPDATE "listings" l
SET "reference" = 99999 + o.rn
FROM ordered o
WHERE l."id" = o."id";

-- Сдвигаем sequence за максимум использованного номера, чтобы следующий
-- nextval() не столкнулся с бэкфиллом. Пустая таблица → 99999, nextval = 100000.
SELECT setval(
  'listings_reference_seq',
  GREATEST((SELECT COALESCE(MAX("reference"), 99999) FROM "listings"), 99999)
);

ALTER TABLE "listings"
  ALTER COLUMN "reference" SET DEFAULT nextval('listings_reference_seq');
ALTER TABLE "listings" ALTER COLUMN "reference" SET NOT NULL;
ALTER SEQUENCE "listings_reference_seq" OWNED BY "listings"."reference";

CREATE UNIQUE INDEX "listings_reference_key" ON "listings"("reference");
