-- Расширение enum ModerationAction: системное событие OWNER_EDIT — владелец
-- отредактировал контент ACTIVE/REJECTED-объявления, из-за чего оно вернулось
-- в очередь модерации (→ NEW). Пишется в moderation_logs с moderator_id = null
-- и человекочитаемым списком изменений в reason (ADR-0120). ADD VALUE идемпотентен;
-- использование значения в той же транзакции Postgres запрещено — поэтому только ALTER TYPE.
ALTER TYPE "ModerationAction" ADD VALUE IF NOT EXISTS 'OWNER_EDIT';
