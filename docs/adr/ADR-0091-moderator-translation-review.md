# ADR-0091 — Moderator-controlled translation generation and review

## Status

Accepted (supersedes ADR-0025)

## Date

2026-06-19

## Context

ADR-0025 (TASK-071) сделал авто-перевод **асинхронным после `APPROVE→ACTIVE`**:
`ModerationService` ставил джобу в BullMQ `translation_queue`, воркер
`ListingAutoTranslator.run` переводил `title/description/address_note/features_text`
на остальные языки. Модератор машинный перевод **не видел и не мог поправить** до
публикации, а сбой постановки джобы глотался в `try/catch` (тихая потеря перевода —
ровно этот баг и всплыл: BullMQ 5 отвергает `jobId` с `:`, см. fix в PR #189).

Бизнес-требование (Team Lead): перевод должен стать **осознанным шагом модерации**.
Модератор на странице карточки:
1. жмёт «Сгенерировать переводы»,
2. визуально проверяет результат,
3. при необходимости правит руками,
4. публикует — причём опубликовать нельзя, пока переводов нет на всех языках.

Факты/ограничения:

- Модель `ListingTranslation` уникальна по `(listing_id, language)`; enum
  `TranslationSource = USER | GOOGLE | YANDEX`; флаг `is_auto_translated`.
- Языки MVP: `UZ | RU | EN` (`Language`).
- `ListingAutoTranslator` (чистая логика перевода) и провайдеры (Yandex/Google,
  фабрика по `TRANSLATE_PROVIDER`, мягкая деградация без `TRANSLATE_API_KEY`) уже
  существуют и покрыты тестами — переиспользуются.
- Перевод 2 языков × ≤4 коротких полей — несколько секунд; для интерактивного
  admin-действия синхронный вызов приемлем (спиннер), очередь не нужна.

## Decision

1. **Перевод — синхронный, по кнопке модератора.** Авто-постановка джобы на
   `APPROVE` удалена. Новый admin-эндпоинт
   `POST /api/v1/admin/listings/:id/translations/generate` (`@Roles(MODERATOR, ADMIN)`)
   синхронно зовёт `ListingAutoTranslator.generateTranslations(listingId)` и
   возвращает полный набор переводов (`ListingTranslationsResponse`). Сбой внешнего
   провайдера → `502` (строки неудачных языков не меняются).

2. **Генерация защищает ручные правки и работает до публикации.**
   `generateTranslations` (бывший `run`): убран гейт `status === ACTIVE` (работает
   на `NEW`, пропускает только `DELETED`/отсутствующий листинг); для каждого
   целевого языка **пропускает строку с `is_auto_translated=false`** (ручная правка
   модератора / авторский оригинал), машинные/отсутствующие — (пере)генерирует
   (`upsert`, `source=<провайдер>`, `is_auto_translated=true`). Идемпотентно.

3. **Ручная правка модератора.**
   `PATCH /api/v1/admin/listings/:id/translations/:language` (`@Roles(MODERATOR, ADMIN)`)
   `upsert` строки выбранного языка с текстом модератора и `is_auto_translated=false`
   (на create `source=USER`, на update source сохраняется). Редактировать
   `original_language` нельзя (`422` — это текст владельца). Признак ручной правки —
   существующий `is_auto_translated=false`; **новое значение enum `MODERATOR` не
   вводится** (миграция не нужна).

4. **`APPROVE` гейтится на полноту переводов.** В `ModerationService.changeStatus`
   при `action=APPROVE` проверяется наличие строк на **все** языки `UZ/RU/EN`;
   отсутствие хотя бы одного → `422 VALIDATION_ERROR`
   («Translations required for all languages before publishing»). Прочие действия
   (`SEND_TO_DRAFT/REJECT/DELETE`) гейт не трогает.

5. **Мёртвая инфраструктура очереди удалена.** Удалены `translation.queue.ts`,
   `translation.worker.ts`, translation-записи в `queue.constants.ts`, регистрация
   в `QueuesModule`/`TranslationsModule`, зависимость `translationQueue` в
   `ModerationService`, env `TRANSLATE_QUEUE_ATTEMPTS`/`TRANSLATE_QUEUE_CONCURRENCY`.
   `ListingAutoTranslator` + провайдеры остаются (зовутся синхронно).

6. **Web (админка).** Детальная карточка `apps/web/.../admin/listings/[id]` получает
   панель «Переводы»: кнопка «Сгенерировать переводы», построчные редакторы EN/UZ
   (бейдж «Правлено вручную» при `is_auto_translated=false`), а кнопка «Опубликовать»
   заблокирована, пока нет переводов на все языки (бэкенд-гейт дублирует проверку).
   Та же панель добавлена в **очередь модерации** `apps/web/.../admin/moderation`
   (где модератор реально работает): переиспользует те же хуки RTK Query и компонент
   `TranslationRow`, ключ запроса — выбранное в очереди объявление (`selId`); кнопка
   «Одобрить» гейтится тем же `translationsComplete` (UZ/RU/EN). Панель остаётся и на
   детальной карточке — обе точки входа равноценны.

## Consequences

Positive:

- Модератор видит и правит перевод до публикации; ни одно объявление не уходит в
  `ACTIVE` без проверенного перевода.
- Нет тихих сбоев очереди: синхронный вызов возвращает ошибку прямо в UI.
- Меньше инфраструктуры: одна BullMQ-очередь и воркер удалены; логика перевода и
  провайдеры (с тестами) переиспользованы без дублирования.
- Ручные правки защищены при повторной генерации (через `is_auto_translated`).

Negative / trade-offs:

- `generate` держит запрос несколько секунд (внешний вызов Yandex) — приемлемо для
  редкого admin-действия; не для пользовательского пути.
- Без `TRANSLATE_API_KEY` провайдер по-прежнему мягко деградирует (возвращает
  копию оригинала) — гейт полноты пройдёт строками-копиями. Это dev-режим; на проде
  ключ обязателен. Детектирование «вернулась копия» — вне scope.
- Авто-ре-перевод при правке объявления владельцем после публикации — вне scope.

## Related files

- apps/api/src/admin/admin-listings.controller.ts
- apps/api/src/admin/admin.module.ts
- apps/api/src/moderation/moderation.service.ts
- apps/api/src/translations/listing-auto-translator.service.ts
- apps/api/src/translations/translations.service.ts
- apps/api/src/translations/dto/update-moderator-translation.dto.ts
- apps/api/src/translations/translations.module.ts
- apps/api/src/translations/index.ts
- apps/api/src/queues/* (translation queue/worker removed)
- apps/api/src/config/env.validation.ts, configuration.ts, .env.example
- apps/web/src/store/api/adminListingsApi.ts, adminTypes.ts
- apps/web/src/app/admin/listings/[id]/page.tsx
- apps/web/src/app/admin/moderation/page.tsx
- apps/web/src/components/admin/TranslationRow.tsx

## Related task

- TASK-071 (superseded behavior), ADR-0024/ADR-005/ADR-012 (translation model & language resolution)
