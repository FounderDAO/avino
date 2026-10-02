-- Расширение enum ModerationAction: решение модератора ARCHIVE — снять объявление
-- с публикации в архив (→ ARCHIVED), в т.ч. массово из списка объявлений админки.
-- ADD VALUE идемпотентен; использование значения в той же транзакции Postgres
-- запрещено — поэтому только ALTER TYPE.
ALTER TYPE "ModerationAction" ADD VALUE IF NOT EXISTS 'ARCHIVE';
