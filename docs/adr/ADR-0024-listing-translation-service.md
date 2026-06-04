# ADR-0024 — Listing translation service (storage, language resolution, translations endpoint)

## Status

Accepted

## Date

2026-06-04

## Context

TASK-070 открывает milestone M7 (translations): нужен выделенный слой хранения и
выдачи переводов объявления. До него логика переводов была размазана по
`ListingsService`:

1. построение авторской строки на `original_language` (source=USER) при создании
   листинга было заинлайнено в `create`;
2. выбор языка ответа (`?lang` → `Accept-Language` → фолбэк на `original_language`)
   и парсинг заголовка жили приватными методами `resolveLanguage` /
   `normalizeLanguage` / `parseAcceptLanguage` (ADR-005/012).

CLAUDE.md §9 и ADR-005 фиксируют: объявление создаётся на одном языке, проходит
moderation queue (`NEW`), затем авто-переводится на остальные языки. API.md §7
описывает `GET /api/v1/listings/:id/translations` (auth: владелец/MODERATOR/ADMIN),
а §2 — правила выбора языка ответа с фолбэком. Модель `ListingTranslation`
(уникальность `(listing_id, language)`, поля `source`/`is_auto_translated`) уже
существует в схеме.

Авто-перевод (`translation_queue`, Google/Yandex provider) — отдельная задача
TASK-071; TASK-070 — только storage/retrieval синхронного слоя.

## Decision

1. **Новый `TranslationsModule` + `TranslationsService` + `TranslationsController`**
   как единый источник логики переводов (URI-versioning v1, CLAUDE.md §14).
   Импортирует `RolesModule` (Bearer-guard), экспортирует `TranslationsService`.
2. **`TranslationsService` инкапсулирует три операции:**
   - `buildOriginalTranslationInput(originalLanguage, translation)` — nested
     `create`-данные авторской строки (source=USER, `is_auto_translated=false`);
   - `resolveLanguage(translations, originalLanguage, langParam?, acceptLanguage?)`
     — выбор языка ответа: приоритет `?lang`, затем `Accept-Language` (q-веса
     игнорируются), фолбэк на `original_language`, крайний случай — первая
     доступная строка (ADR-005/012);
   - `listByListing(listingId, viewer)` — все переводы листинга.
3. **`ListingsService` делегирует** построение авторской строки и выбор языка
   `TranslationsService` (импорт `TranslationsModule`). Дублированные приватные
   методы выбора языка из `ListingsService` удалены — поведение и контракт
   `GET /api/v1/listings/:id` без изменений (тесты зелёные).
4. **`GET /api/v1/listings/:id/translations`** (API.md §7) — `JwtAuthGuard` +
   ownership-гейт в сервисе: владелец **или** `MODERATOR`/`ADMIN`. Отсутствующий
   или `DELETED` листинг → `404` (исключён из всех read-path, не раскрываем
   существование скрытого ресурса); аутентифицированный посторонний → `403`.
5. **Управленческий вид ответа.** Эндпоинт — инструмент владельца/модерации,
   поэтому отдаёт `source` и `is_auto_translated` (видно, где авторский текст, а
   где машинный перевод), а не только публичные поля карточки. Форма:
   `{ listing_id, original_language, translations: [{ language, source,
   is_auto_translated, title, description, address_note, features_text }] }`,
   отсортировано по `language`. Все коды ошибок — из существующего каталога
   (ADR-0007).

### Намеренно вне scope (TASK-070)

- Авто-перевод на остальные языки, `translation_queue`, Google/Yandex provider —
  TASK-071.
- Ре-генерация машинных переводов при правке авторского текста / после `ACTIVE`.
- Точечный `PUT`/`PATCH` отдельного перевода вручную.

## Consequences

Positive:

- Единый источник логики переводов: создание авторской строки и выбор языка
  больше не дублируются между сервисами — TASK-071 (auto-translate) встроится в
  `TranslationsService`, не трогая `ListingsService`.
- Владельцу/модерации доступен полный набор переводов с признаком `source` —
  основа для UI управления и модерации качества авто-перевода.
- Контракт `GET /api/v1/listings/:id` неизменен; рефактор покрыт существующими
  тестами `ListingsService` (язык/фолбэк проверяются через делегата).

Negative / trade-offs:

- `ListingsModule` теперь зависит от `TranslationsModule` (однонаправленно,
  цикла нет).
- Эндпоинт `translations` отдаёт строки как есть; до TASK-071 присутствует только
  авторская строка на `original_language` — остальные языки появятся после
  авто-перевода.
- Ownership-гейт `listByListing` делает второй `findUnique` (отдельно от карточки)
  — приемлемо для управленческого, не горячего пути.

## Related files

- apps/api/src/translations/translations.service.ts
- apps/api/src/translations/translations.service.spec.ts
- apps/api/src/translations/translations.controller.ts
- apps/api/src/translations/translations.module.ts
- apps/api/src/translations/index.ts
- apps/api/src/listings/listings.service.ts
- apps/api/src/listings/listings.service.spec.ts
- apps/api/src/listings/listings.module.ts
- apps/api/src/app.module.ts

## Related task

- TASK-070
