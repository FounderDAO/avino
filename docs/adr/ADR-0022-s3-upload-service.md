# ADR-0022 — S3 upload service (UploadsModule, public vs presigned URL)

## Status

Accepted

## Date

2026-06-04

## Context

TASK-060 открывает milestone M6 (media): нужен сервисный слой загрузки файлов в
S3-compatible storage, который позже используется ListingMediaModule (TASK-061)
для фото объявлений. CLAUDE.md §3 и ARCHITECTURE §14 фиксируют:

1. Фото хранятся **только** в S3, никогда на файловой системе API-процесса
   (ENV §9, DB_SCHEMA §6).
2. Storage — S3-compatible (поддержка MinIO/DigitalOcean Spaces, не только
   нативного AWS S3). Менять стек/storage без подтверждения нельзя (CLAUDE.md
   §13).
3. Целевой upload-транспорт — direct-to-S3 через presigned PUT, но для MVP
   допустим proxy через API (validate → upload → S3).

Конфиг-неймспейс `s3` уже заведён в TASK-022 (`configuration.ts`,
`env.validation.ts`), но без клиента и без правил формирования URL. TASK-060
ограничен **только сервисом загрузки** — HTTP-эндпоинты media это TASK-061,
EXIF-стриппинг и thumbnail — media_processing_queue (ARCHITECTURE §14 п.3).

## Decision

1. **`UploadsModule` + `UploadsService`** на базе AWS SDK v3
   (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`). SDK совместим с любым
   S3-API, поэтому покрывает требование «S3-compatible». Модуль конфиг-driven
   (глобальный `ConfigService`), экспортирует сервис для TASK-061.
2. **Узкий client-agnostic контракт:**
   - `upload({ buffer, contentType, key?, prefix?, extension? }) → { key, url }`
     — заливает буфер, возвращает ключ и готовый URL;
   - `getObjectUrl(key)` — URL по ключу;
   - `delete(key)` — удаление (для reap orphaned media, ARCHITECTURE §14 п.4);
   - `extensionFromFilename(name)` — helper для вызывающего слоя.
   Валидация MIME/размера — на слое вызова (TASK-061), сервис её не дублирует.
3. **Public vs signed URL по конфигу** (acceptance TASK-060): если задан
   `S3_PUBLIC_BASE_URL` (CDN/публичный bucket) — объекты заливаются с
   `public-read` ACL и `getObjectUrl` отдаёт прямой публичный URL; если пуст —
   приватный bucket, `getObjectUrl` возвращает короткоживущий presigned GET URL
   (`S3_SIGNED_URL_TTL`, дефолт 3600 c).
4. **Никакого локального хранилища.** В отличие от dev-фолбэка SmsService/
   EmailService (логирование при отсутствии провайдера), Uploads при незаданных
   кредах/бакете бросает понятную ошибку (`S3 storage is not configured: …`) —
   запись на FS запрещена контрактом, тихий фолбэк дал бы битые URL.
5. **Новые env-переменные** (опциональны на старте, как остальные интеграции):
   `S3_FORCE_PATH_STYLE` (дефолт `true` для MinIO/Spaces; `false` для нативного
   AWS virtual-hosted-style), `S3_PUBLIC_BASE_URL`, `S3_SIGNED_URL_TTL`.
   `S3_REGION` получил дефолт `us-east-1`. `S3_FORCE_PATH_STYLE` валидируется как
   строка (не boolean) — class-transformer привёл бы `"false"` к `true`; парсинг
   в `configuration.ts`.
6. **Ленивая инициализация клиента** (`getClient`, кэш в памяти): клиент
   создаётся при первом обращении, а не на старте, чтобы приложение поднималось
   без S3-кредов (опциональная интеграция, TASK-022). `endpoint` опционален:
   пусто → нативный AWS S3, задан → S3-compatible.

### Намеренно вне scope (TASK-060)

- HTTP media-эндпоинты (`POST/GET/DELETE/PATCH .../media`) — TASK-061.
- EXIF/GPS-стриппинг и генерация thumbnail/variant — media_processing_queue
  (process_uploaded_image, ARCHITECTURE §14 п.3).
- Presigned **PUT** (direct-to-S3 upload) — целевой транспорт, подключается
  позже; MVP заливает через API (proxy).
- Запись `listing_media` в БД — TASK-061 (DB media record — source of truth).

## Consequences

Positive:

- Единый абстрактный слой загрузки: TASK-061 и любые будущие сценарии
  (аватары и т.п.) не зависят от деталей S3/провайдера.
- S3-compatible из коробки (AWS, MinIO, DigitalOcean Spaces) — провайдер
  выбирается env-конфигом без правок кода.
- Public/private режим переключается одной переменной; приватные бакеты
  безопасны по умолчанию (presigned, без ACL).
- Контракт хранит файлы только в S3 — нет утечки на FS API, нет orphan-файлов
  на дисках инстансов.

Negative / trade-offs:

- AWS SDK v3 добавляет зависимости в bundle API (приемлемо: storage —
  обязательная часть продукта).
- Proxy-загрузка через API на MVP гонит трафик файлов через API-процесс;
  presigned PUT (целевой транспорт) снимет это позже.
- `public-read` ACL требует бакета с включёнными ACL (MinIO/Spaces — да; на
  нативном AWS с «bucket owner enforced» публичный доступ настраивается через
  bucket policy + `S3_PUBLIC_BASE_URL` без ACL — учитывается при деплое).

## Related files

- apps/api/src/uploads/uploads.service.ts
- apps/api/src/uploads/uploads.service.spec.ts
- apps/api/src/uploads/uploads.module.ts
- apps/api/src/uploads/index.ts
- apps/api/src/config/configuration.ts
- apps/api/src/config/env.validation.ts
- apps/api/src/app.module.ts
- apps/api/package.json
- .env.example

## Related task

- TASK-060
