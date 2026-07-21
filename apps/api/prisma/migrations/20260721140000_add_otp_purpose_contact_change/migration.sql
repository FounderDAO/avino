-- Расширение enum OtpPurpose значением CONTACT_CHANGE: подтверждение владения
-- новым логин-контактом (телефон/email) OTP-кодом перед применением смены.
-- ADD VALUE идемпотентен (IF NOT EXISTS); использование значения в той же
-- транзакции Postgres запрещено, поэтому в миграции только ALTER TYPE.
ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'CONTACT_CHANGE';
