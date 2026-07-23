-- Флаг подтверждения публичного контакт-телефона (contact_phone). Существующие
-- строки → false: непроверенные номера уступают верифицированному логин-телефону
-- на объявлениях, пока пользователь не подтвердит их OTP-кодом (ADR-0151).
ALTER TABLE "user_profiles"
  ADD COLUMN "contact_phone_verified" boolean NOT NULL DEFAULT false;
