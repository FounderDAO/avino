# ADR-0156 — Admin-правка языка и текста оригинала объявления

## Status

Accepted (частично отменяет ADR-005 и ADR-0091 п.3 для admin-пути)

## Date

2026-07-24

## Context

Автор создаёт объявление на одном языке и сам выбирает `original_language`
(шаг визарда `ListingNew`). На практике часто ошибается: пишет описание
**по-русски**, а языком помечает **EN** (или UZ). Последствия:

- Авто-переводчик берёт `from = original_language` **явно** и переводит русский
  текст «как английский» → мусор на всех языках; пустые языки нормально не
  заполняются.
- Опубликовать нельзя — гейт требует переводов на все UZ/RU/EN (ADR-0091).
- Исправить нечем: `original_language` заморожен (ADR-005) — read-only в форме
  владельца и в `update-listing` DTO, а admin-эндпоинт правки перевода отдаёт
  `422` на строку языка-оригинала (ADR-0091 п.3: «это текст владельца»).

Также модератору штатно нужно **править сам текст оригинала** перед генерацией
(опечатки/ошибки автора) — это частый кейс, а не только смена языка.

Бизнес-требование (Team Lead): модератор на карточке должен уметь
(1) поправить текст оригинала и (2) сменить язык оригинала, если он выбран
неверно («переложить текст из EN в RU»), после чего «Сгенерировать переводы»
заполнит пустые языки из исправленного оригинала.

## Decision

1. **Новый admin-эндпоинт правки оригинала.**
   `PATCH /api/v1/admin/listings/:id/original` (`@Roles(MODERATOR, ADMIN)`).
   Тело `UpdateOriginalListingDto`:
   `{ original_language, title, description?, address_note?, features_text? }`.
   Возвращает полный `ListingTranslationsResponse` (для перерисовки панели).

2. **Семантика `TranslationsService.updateOriginalTranslation` (транзакция).**
   - `404`, если листинг отсутствует или `DELETED`.
   - **Смена языка** (`original_language` изменился — «перенос EN→RU»): все
     производные переводы сделаны из неверного источника → удаляются все строки,
     кроме будущего нового оригинала
     (`deleteMany where language <> newLanguage`); `listing.original_language`
     переставляется на новый язык. Остаётся единственная строка `source=USER` на
     новом языке.
   - **Тот же язык** (правка текста): `original_language` и прочие строки не
     трогаются — обновляется только текст оригинала.
   - В обоих случаях `upsert` строки нового/текущего языка:
     `source=USER, is_auto_translated=false` + текст. Строка оригинала
     перезаписывается **полностью** (не partial, в отличие от
     `updateModeratorTranslation`): это авторский текст целиком, UI шлёт весь
     набор полей (правленые + сквозные `address_note`/`features_text`).

3. **Генерация не меняется.** Существующий
   `POST /admin/listings/:id/translations/generate` берёт `from = original_language`
   и заполняет пустые/машинные целевые языки. После смены языка на RU (пустые
   EN/UZ) это и есть требуемое «пустые языки заполняются из непустого оригинала».
   Инвариант «`original_language`-строка всегда непуста (source=USER)»
   поддерживается п.2, поэтому источник генерации всегда валиден.

4. **Гейт публикации — защитный побочный эффект.** После смены языка производные
   строки удалены → `translationsComplete` (UZ/RU/EN) ложен → `APPROVE` заблокирован,
   пока модератор не перегенерирует. Ошибочный листинг физически нельзя
   опубликовать до повторной генерации.

5. **Web (админка).** Строка «Исходный» в панели «Переводы» перестаёт быть
   read-only: компонент `OriginalTranslationEditor` (селект «Язык оригинала» +
   редактируемые заголовок/описание, `address_note`/`features_text` — сквозняком).
   Подключён в обеих точках входа панели: детальная карточка
   `admin/listings/[id]` и очередь модерации `admin/moderation`. Целевые строки —
   прежний `TranslationRow`.

## Consequences

Positive:

- Модератор чинит и текст, и неверно выбранный язык оригинала прямо на карточке;
  после «Сгенерировать переводы» пустые языки берутся из исправленного источника.
- Генерация не тронута — источник перевода всегда валиден (инвариант п.3).
- Ошибочный листинг нельзя опубликовать, пока переводы не перегенерированы (п.4).
- Минимальная поверхность: один эндпоинт + один UI-компонент; логика перевода,
  провайдеры и гейт публикации переиспользованы без изменений.

Negative / trade-offs:

- Смена языка **удаляет** ранее сгенерированные/правленные вручную целевые
  переводы (они были из неверного источника) — приемлемо: они всё равно
  недостоверны, требуется повторная генерация.
- `original_language` перестаёт быть строго неизменяемым — но только через
  admin-путь (MODERATOR/ADMIN); владелец по-прежнему менять его не может (ADR-005
  в части владельца сохраняется).
- Правка оригинала перезаписывает строку полностью — UI обязан слать сквозные
  `address_note`/`features_text`, иначе они занулятся (задокументировано в методе).

## Related files

- apps/api/src/translations/dto/update-original-listing.dto.ts
- apps/api/src/translations/translations.service.ts
- apps/api/src/translations/translations.service.spec.ts
- apps/api/src/translations/index.ts
- apps/api/src/admin/admin-listings.controller.ts
- apps/api/openapi.internal.json
- apps/web/src/components/admin/OriginalTranslationEditor.tsx
- apps/web/src/store/api/adminListingsApi.ts
- apps/web/src/store/api/adminTypes.ts
- apps/web/src/app/admin/listings/[id]/page.tsx
- apps/web/src/app/admin/moderation/page.tsx

## Related task

- TASK-256+ (admin fix original language/text); ADR-005 / ADR-0091 / ADR-012 (translation model, moderator review, language resolution)
