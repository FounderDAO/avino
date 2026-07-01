-- Счётчик просмотров детали (баглист мобилки #8). Простой инкремент без
-- дедупликации (решение спеки 2026-07-02); уникальность НЕ считается.
ALTER TABLE "listings" ADD COLUMN "views_count" INTEGER NOT NULL DEFAULT 0;
