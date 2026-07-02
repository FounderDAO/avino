-- Счётчик намерений позвонить (клик по tel:-ссылке в карточке контакта).
-- Простой инкремент без дедупликации (спека 2026-07-03), по образцу views_count.
ALTER TABLE "listings" ADD COLUMN "calls_count" INTEGER NOT NULL DEFAULT 0;
