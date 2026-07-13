-- Английская версия адреса объявления (ADR-0147). NULL = перевода нет,
-- выдача фолбэкает на канонический русский listings.address.
ALTER TABLE "listings" ADD COLUMN "address_en" VARCHAR(500);
