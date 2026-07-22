-- Расширение enum OtpPurpose: подтверждение владения ПУБЛИЧНЫМ контакт-телефоном
-- (user_profiles.contact_phone) OTP-кодом перед применением. ADD VALUE идемпотентен;
-- использование значения в той же транзакции Postgres запрещено — поэтому только ALTER TYPE.
ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'CONTACT_PHONE_CHANGE';
