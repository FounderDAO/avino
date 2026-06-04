# ADR-0023 — Listing media endpoints (proxy upload, list, delete, reorder)

## Status

Accepted

## Date

2026-06-04

## Context

TASK-061 завершает milestone M6 (media): нужны HTTP-эндпоинты галереи объявления
поверх `UploadsService` (TASK-060, ADR-0022). API.md §8 и DB_SCHEMA §6 (ADR-008)
фиксируют:

1. Файлы хранятся **только** в S3, в `listing_media` — лишь URL и метаданные;
   DB-запись — source of truth, осиротевшие S3-объекты подчищает cleanup-джоба.
2. Allowed MIME (MVP): `image/jpeg`, `image/png`, `image/webp`; VIDEO — Phase 2.
3. **EXIF/GPS стрипается при обработке** (`process_uploaded_image`), а
   `thumbnail_url`/web-вариант генерирует воркер `media_processing_queue` —
   координаты объявления берутся только с карты, никогда из EXIF фото.
4. Целевой транспорт загрузки — direct-to-S3 (presigned PUT); proxy через API
   допустим для MVP.

Модель `ListingMedia` и `UploadsService` уже существуют; TASK-061 добавляет
авторизацию, валидацию и persist-слой.

## Decision

1. **`ListingMediaModule` + `ListingMediaController` + `ListingMediaService`**
   под `listings/:listingId/media` (URI-versioning v1, CLAUDE.md §14). Импортирует
   `RolesModule` (Bearer-guard) и `UploadsModule` (S3).
2. **Эндпоинты** (MVP-scope = upload/list/delete/reorder; presign/confirm —
   позже):
   - `GET /api/v1/listings/:id/media` — список по `sort_order`;
   - `POST /api/v1/listings/:id/media` — **proxy-загрузка** `multipart/form-data`
     (поле `file`) через `FileInterceptor` (memory storage);
   - `DELETE /api/v1/listings/:id/media/:mediaId` — удалить медиа (`204`);
   - `PATCH /api/v1/listings/:id/media/reorder` — переупорядочить
     (`{ "order": [...] }`).
3. **Route naming — `reorder` (API.md §8), не `sort`** из формулировки task-card.
   API.md — авторитетный контракт при расхождении (CLAUDE.md §2; решение Team
   Lead). Task-card строка `PATCH .../media/sort` трактуется как `reorder`.
4. **Авторизация по-операционно:**
   - модификация (upload/delete/reorder) — `JwtAuthGuard` + гейт в сервисе:
     владелец листинга **или** `ADMIN` (acceptance «owner/admin»). MODERATOR
     правит статус листинга, но не контент — поэтому не входит в модификаторы;
   - список — `OptionalJwtAuthGuard` + visibility-гейт, зеркалящий карточку
     листинга (ADR-0019): `ACTIVE` публично; непубличные статусы — владельцу/
     MODERATOR/ADMIN; `DELETED`/отсутствующий → `404` (не раскрываем существование
     скрытого ресурса).
5. **Валидация загрузки:** allow-list MIME (`image/jpeg|png|webp`) → расширение
   ключа S3; превышение → `415 UNSUPPORTED_MEDIA_TYPE`. Размер > 10 MiB →
   `413 FILE_TOO_LARGE`. Лимит 20 медиа на листинг → `422 MEDIA_LIMIT_EXCEEDED`.
   Отсутствие файла → `400 VALIDATION_ERROR`. Все коды — из существующего каталога
   (ADR-0007).
6. **Ключ S3 из URL.** `listing_media` хранит `url`, не ключ (DB_SCHEMA §6). Для
   удаления добавлен `UploadsService.extractKey(url)` (обратное к `getObjectUrl`):
   отрезает публичный base-URL/CDN или сегмент бакета (path-style). Удаление —
   best-effort: сперва строка БД (source of truth), затем S3; ошибка S3 логируется
   и не валит запрос (осиротевший объект уберёт cleanup-джоба).
7. **Reorder = полная перестановка.** `order` обязан содержать каждый id медиа
   листинга ровно один раз (иначе `400`); позиция → `sort_order`, апдейты в одной
   транзакции (`$transaction`).
8. **EXIF-strip и thumbnail — НЕ здесь.** Делает `media_processing_queue`
   (`process_uploaded_image`, ARCHITECTURE §14). До его внедрения `thumbnail_url`
   = null, EXIF не вырезается на API-слое — задокументировано `TODO(M6)` в сервисе
   (acceptance: «EXIF stripping is implemented or clearly TODO documented»).
   `width`/`height` тоже заполняет воркер.

### Намеренно вне scope (TASK-061)

- Presigned **PUT** / `confirm` (direct-to-S3) — целевой транспорт, позже.
- EXIF/GPS-стриппинг, генерация thumbnail/variant, `width`/`height` —
  media_processing_queue.
- VIDEO — Phase 2.

## Consequences

Positive:

- Полный MVP-цикл галереи объявления: загрузить → показать → удалить →
  упорядочить, поверх единого `UploadsService` без знания деталей S3.
- Безопасность по умолчанию: чужой контент не правится, медиа скрытых листингов
  не утекают гостю.
- DB-запись остаётся source of truth; S3-очистка устойчива к сбоям (best-effort +
  cleanup-джоба).

Negative / trade-offs:

- Proxy-загрузка гонит файлы через API-процесс и буферизует их в память
  (`FileInterceptor`); presigned PUT снимет это позже.
- Лимиты (10 MiB, 20 медиа) — константы модуля, не env; вынесем в конфиг при
  необходимости тюнинга.
- `extractKey` выводит ключ из URL — корректно для публичного CDN/path-style; при
  переходе на иную схему URL потребует ревизии (или отдельной колонки `storage_key`).
- До внедрения media_processing_queue файлы хранятся БЕЗ EXIF-стриппинга —
  временно; задокументировано как TODO.

## Related files

- apps/api/src/listing-media/listing-media.controller.ts
- apps/api/src/listing-media/listing-media.service.ts
- apps/api/src/listing-media/listing-media.service.spec.ts
- apps/api/src/listing-media/listing-media.module.ts
- apps/api/src/listing-media/dto/reorder-media.dto.ts
- apps/api/src/listing-media/index.ts
- apps/api/src/uploads/uploads.service.ts
- apps/api/src/uploads/uploads.service.spec.ts
- apps/api/src/app.module.ts

## Related task

- TASK-061
