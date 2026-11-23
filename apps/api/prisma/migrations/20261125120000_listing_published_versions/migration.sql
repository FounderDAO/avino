-- SEO AUD-9: опубликованная версия объявления на время повторной модерации.
-- Правка ACTIVE-объявления возвращает его в NEW (ADR-0120); до решения
-- модератора посетители и поисковики видят последнюю одобренную версию, а не 404.
CREATE TABLE "listing_published_versions" (
    "listing_id" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_published_versions_pkey" PRIMARY KEY ("listing_id"),
    CONSTRAINT "listing_published_versions_listing_id_fkey" FOREIGN KEY ("listing_id")
        REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Версия нужна, только пока объявление в NEW (правка ждёт проверки) или
-- REJECTED (правку отклонили — одобренная версия остаётся). Любой другой
-- переход (одобрение, архив, продано, удаление — из любого кода или SQL)
-- снимает её, чтобы устаревшая версия не всплыла позже.
CREATE OR REPLACE FUNCTION listings_drop_published_version()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM "listing_published_versions" WHERE "listing_id" = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listings_drop_published_version_trg
    AFTER UPDATE OF status ON "listings"
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status
          AND NEW.status NOT IN ('NEW', 'REJECTED'))
    EXECUTE FUNCTION listings_drop_published_version();
