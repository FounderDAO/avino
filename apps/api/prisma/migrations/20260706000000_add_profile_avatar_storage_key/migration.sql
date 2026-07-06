-- user_profiles.avatar_storage_key: R2-ключ аватара, загруженного через
-- POST /api/v1/users/me/avatar (TASK-248, ADR-0134). Отдельная колонка от
-- avatar_url — тот остаётся внешней ссылкой на фото OAuth-провайдера
-- (Google/Apple, google-auth.service.ts), которую нельзя перезаписывать.
-- Sign-on-read по образцу listing_media.storage_key (ADR-0086): при чтении
-- avatar_storage_key приоритетнее avatar_url, если задан.
ALTER TABLE "user_profiles" ADD COLUMN "avatar_storage_key" TEXT;
