# Перевод под контролем модератора: генерация + ревью + ручная правка

- **Дата:** 2026-06-18
- **Статус:** реализовано на ветке `feat/moderator-translation-review` (PR pending); backend live-verified
- **Связано:** ADR-005 (модель переводов), ADR-0024 (TranslationsService), ADR-0025 (translation-queue — **заменяется**), TASK-070/071

## 1. Проблема и цель

Сейчас перевод объявления на остальные языки запускается **автоматически и асинхронно** после перехода модерации `APPROVE → ACTIVE` (BullMQ `translation_queue` → `TranslationWorker` → `ListingAutoTranslator.run()`). Модератор машинный перевод **не видит и не может поправить** до публикации.

**Цель:** сделать перевод осознанным шагом модерации. На странице модерации модератор:
1. жмёт «Сгенерировать переводы» (Yandex),
2. визуально проверяет результат,
3. при необходимости правит руками,
4. публикует (`APPROVE`) — и опубликовать можно **только когда переводы на все языки готовы**.

## 2. Принятые решения (из брейншторма)

| # | Решение |
|---|---------|
| 1 | **Перевод в руки модератора.** Убираем авто-перевод на APPROVE; вместо него — кнопка на странице модерации (доступна уже для статуса `NEW`). |
| 2 | **Ручные правки защищены.** Повторная генерация перезаписывает только машинные строки; строки с `is_auto_translated=false` сохраняются. |
| 3 | **APPROVE обязательно гейтится.** Опубликовать нельзя, пока нет строк перевода на все языки (UZ/RU/EN). |
| 4 | **Подход A: синхронная генерация + удаление очереди.** Генерация синхронная (ждём Yandex со спиннером); `translation_queue` + воркер удаляются как мёртвый код. |

## 3. Текущее состояние (baseline)

- Модель `ListingTranslation`: одна строка на `(listing_id, language)`. Авторская = `source=USER, is_auto_translated=false` на `original_language`; машинные = `source=YANDEX/GOOGLE, is_auto_translated=true`.
- Перевод: `ModerationService.changeStatus` на `APPROVE→ACTIVE` ставит джобу в `translation_queue` → `TranslationWorker` → `ListingAutoTranslator.run(listingId)` (требует `ACTIVE`, переводит все нефоригинальные языки, `upsert`). Асинхронно, без ревью.
- `GET /api/v1/listings/:id/translations` (владелец / MODERATOR / ADMIN) отдаёт все строки с `source` + `is_auto_translated` (`TranslationsService.listByListing`).
- Модерация: `PATCH /api/v1/admin/listings/:id/status {action}` — `@Roles(MODERATOR, ADMIN)` (`AdminListingsController` → `ModerationService.changeStatus`).
- Web: страница модерации `apps/web/src/app/admin/listings/[id]/page.tsx` (`useModerateListingMutation`).
- Языки: `ALL_LANGUAGES = [UZ, RU, EN]` (`listing-auto-translator.service.ts`).

## 4. Backend

### 4.1 Ядро переводчика — рефактор `ListingAutoTranslator`
- Метод `generateTranslations(listingId)` (на базе текущего `run`):
  - **Убрать** гейт `status === ACTIVE` — работает для любого не-`DELETED` листинга (модератор триггерит на `NEW`).
  - Для каждого целевого языка (`ALL_LANGUAGES` минус `original_language`): **пропускать**, если существующая строка имеет `is_auto_translated=false` (защита ручных правок). Отсутствующие и машинные строки — (пере)генерировать через провайдер, `upsert` (`source=provider.source`, `is_auto_translated=true`).
  - Идемпотентность сохраняется (`upsert` по `(listing_id, language)`).
- Возвращает полный набор строк перевода листинга (для ответа эндпоинта).
- Вызывается **синхронно** из нового эндпоинта (не через очередь).

### 4.2 Новые admin-эндпоинты (`@Roles(MODERATOR, ADMIN)`)
Размещение: в `AdminListingsController` (или отдельный admin-translations контроллер в `admin`-модуле, импортирующий `TranslationsModule`/translator).

- **`POST /api/v1/admin/listings/:id/translations/generate`**
  - Синхронно зовёт `generateTranslations(id)` → возвращает `ListingTranslationsResponse` (та же форма, что у `GET /listings/:id/translations`: `listing_id`, `original_language`, `translations[]` с `source`/`is_auto_translated`).
  - `404`, если листинг отсутствует или `DELETED`.
  - Ошибка провайдера (Yandex 4xx/5xx) → `502` (`ApiErrorCode` для внешнего сбоя), строки неудачных языков не меняются.

- **`PATCH /api/v1/admin/listings/:id/translations/:language`**
  - Тело: `{ title, description?, address_note?, features_text? }` (snake_case, как остальной API).
  - `upsert` строки `(listing_id, language)` с текстом модератора, ставит **`is_auto_translated=false`** (пометка «правлено руками» → защищается при повторной генерации).
  - `language` валидируется по enum `Language`; **редактируются только нефоригинальные** языки (оригинал — текст владельца, вне scope) → попытка править `original_language` → `400/422`.
  - `404`, если листинг отсутствует/`DELETED`.

### 4.3 Гейт APPROVE в `ModerationService.changeStatus`
- **Убрать** авто-enqueue (`this.translationQueue.enqueueListingTranslation(...)`).
- При `action === APPROVE`: перед переходом проверить, что строки перевода есть на **все** `ALL_LANGUAGES` (по одной на язык). Если какого-то языка нет → выбросить `422` с кодом `VALIDATION_ERROR` (существующий `ApiErrorCode`, без нового enum-значения) и сообщением `Translations required for all languages before publishing`.
- Прочие действия (`SEND_TO_DRAFT | REJECT | DELETE`) гейт не трогает.

### 4.4 Удаление мёртвой очереди
- Удалить: `apps/api/src/queues/translation.queue.ts`, `apps/api/src/translations/translation.worker.ts`, translation-записи в `apps/api/src/queues/queue.constants.ts` (`TRANSLATION_QUEUE_NAME`, `TRANSLATE_LISTING_JOB`, `TranslateListingJobData`), регистрацию `TranslationQueue`/`TranslationWorker` в модулях, зависимость `translationQueue` в `ModerationService`, спеку `translation.queue.spec.ts`.
- **Оставить:** `ListingAutoTranslator`, провайдеры (`yandex.provider.ts`, `google.provider.ts`, фабрику) — теперь зовутся синхронно.
- Env `TRANSLATE_QUEUE_ATTEMPTS` / `TRANSLATE_QUEUE_CONCURRENCY` становятся неиспользуемыми — убрать из `env.validation.ts`, `configuration.ts` (`translateConfig`) и `.env.example`. `TRANSLATE_PROVIDER` / `TRANSLATE_API_KEY` / `TRANSLATE_FOLDER_ID` остаются (нужны провайдеру).
- Обновить `moderation.service.spec.ts` (больше не ожидает enqueue).

## 5. Frontend (`apps/web/src/app/admin/listings/[id]/page.tsx`)

- Новая панель **«Переводы»**: `RU` (оригинал, read-only) + `EN`/`UZ` (редактируемые поля title/description, при наличии — address_note/features_text).
- Кнопка **«Сгенерировать переводы»** → RTK-мутация `generateTranslations` → спиннер → заполняет панель из ответа. Повтор перегенерит машинные строки, ручные сохраняет; строки с `is_auto_translated=false` помечены бейджем «правлено вручную».
- На каждый нефоригинальный язык — кнопка **«Сохранить»** → RTK `updateTranslation` (`PATCH .../translations/:lang`); после сохранения строка получает бейдж ручной правки.
- Кнопка **APPROVE** — `disabled` с подсказкой «Сначала сгенерируйте переводы», пока в наборе нет всех языков. Бэкенд-гейт (4.3) дублирует проверку.
- RTK Query: добавить эндпоинты `generateTranslations`, `updateTranslation`, использовать/добавить `getListingTranslations`; инвалидация тега переводов листинга после generate/update.
- i18n админки (ru/uz/en) для новых строк UI.

## 6. Поток данных

1. Модератор открывает `NEW`-листинг → страница грузит листинг + переводы (`GET /listings/:id/translations`).
2. «Сгенерировать» → `POST .../translations/generate` → синхронно Yandex → upsert EN/UZ → ответ с переводами → панель заполнена.
3. Правка языка → `PATCH .../translations/:lang` → `is_auto_translated=false`.
4. «APPROVE» → бэкенд проверяет полноту языков → переход `NEW → ACTIVE` (опубликовано). Без побочных эффектов перевода.

## 7. Обработка ошибок

- **Generate / провайдер недоступен:** при пустом `TRANSLATE_API_KEY` провайдер мягко деградирует и возвращает исходный текст (копия, не перевод) — строки создаются, гейт пройдёт. Это edge-case dev-конфига; на проде ключ задан. Детектирование «вернулась копия» — вне scope (отмечено осознанно).
- **Generate / ошибка Yandex (4xx/5xx):** сервис бросает → `502` + тост в UI; строки неудачных языков не изменяются.
- **APPROVE без полного набора:** `422` с сообщением (кнопка и так `disabled`).
- **Edit / валидация тела или попытка править оригинал:** `400/422`.

## 8. Тестирование

- **Unit (api):**
  - `ListingAutoTranslator.generateTranslations`: пропускает строки `is_auto_translated=false`; генерирует отсутствующие/машинные; работает на `NEW`.
  - `ModerationService.changeStatus`: `APPROVE` без полного набора языков → `422`; с полным набором → переход `ACTIVE`; больше не зовёт очередь.
  - edit-эндпоинт: ставит `is_auto_translated=false`; отказ на `original_language`.
  - Спека очереди удалена; `moderation.service.spec` обновлён.
- **Live (Docker):** путь модератора — generate на `NEW` → ручная правка → APPROVE (гейт режет до генерации, пускает после) → `GET /listings/:id?lang=ru|en|uz` отдаёт нужный язык.

## 9. Документация (в той же feature-PR)

- **ADR**: «Перевод под контролем модератора» — **заменяет ADR-0025** (translation-queue), ссылается на ADR-005/0024.
- **API.md**: новые эндпоинты `POST .../translations/generate`, `PATCH .../translations/:lang` + предусловие полноты переводов для `APPROVE`.
- **DONE.md**: запись о задаче.

## 10. Вне scope (YAGNI)

- Редактирование модератором текста на `original_language` (это правит владелец).
- Авто-ре-перевод при правке объявления владельцем после публикации.
- Бэкфилл переводов для уже опубликованных (засеянных) ACTIVE-листингов — отдельная разовая операция при желании.
- Детектирование «провайдер вернул копию из-за отсутствия ключа».
- Добавление `source=MODERATOR` в enum (используем существующий `is_auto_translated=false` как признак ручной правки).
