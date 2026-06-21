# Дизайн: визард создания — вариант B (контакт из профиля) + чистка orphan-фото в R2

**Дата:** 2026-06-21
**Затронутые приложения:** `apps/client` (визард создания, загрузчик фото, i18n), `apps/api` (media-cleanup воркер, UploadsService)

## Проблема

На шаге «Контакты» визарда размещения объявления (`/sell/new`) у уже **авторизованного** пользователя
повторно спрашивают имя и телефон. При этом введённые значения **никуда не уходят**: `buildBody()` их не
отправляет, а публичный контакт на карточке бэкенд собирает из профиля владельца
(`listings.service.ts → buildContact`: `display_name ?? first+last`; `contact_phone ?? phone`). То есть мы
заставляем перепечатывать то, что уже знаем, и выбрасываем результат.

Дополнительно: на шаге «Фото» есть кнопка «Добавить демо-фото» (unsplash-URL'ы) — мусор для реального
объявления. И отдельный вопрос — удаляются ли фото из R2 при удалении.

## Решение (вариант B)

Контакт берём из профиля автоматически (бэкенд так и делает). Поля ввода имени/телефона убираем. Блок
«Принимать заявки на тур» переезжает в конец шага «Описание» — так же, как уже сделано в форме
редактирования (`ListingEdit`), что выравнивает обе формы. Демо-фото убираем. Orphan-фото в R2 подчищаем
новым воркером.

### Часть 1 — `apps/client/src/features/listing-new/ListingNew.tsx`

- `STEPS`: удалить `'contacts'` → 7 шагов: `type, address, params, price, photos, description, preview`.
- `FormState` и `INITIAL`: удалить поля `name`, `phone`.
- Удалить блок рендера шага «Контакты» (`step === 7`). `<ToursSection>` перенести в конец блока шага
  «Описание» (`step === 6`), после поля описания.
- `canNext`: удалить `case 7` (валидация имени/телефона). Туры остаются необязательными — новых гейтов нет
  (паритет с текущим поведением; шаг «Описание» по-прежнему гейтится `title.trim().length > 3`).
- `buildBody`: удалить устаревший комментарий про `name/phone`. Логика `tours_enabled`/`tour_windows`
  без изменений.
- Превью (`step === 8` → станет `step === 7`): убрать строку «Контакт» (`preview.rows.contact`).
- Перенумеровать условия рендера: бывший `step === 8` (превью) → `step === 7`.

### Часть 2 — `apps/client/src/features/listing-new/PhotoUploader.tsx`

- Удалить массив `DEMO_PHOTOS`, функцию `addDemo` и кнопку «Добавить демо-фото» (блок при
  `photos.length === 0`). Загрузчик используют и create, и edit — кнопка показывалась только в пустом
  состоянии; в edit фактически не всплывала.

### Часть 3 — i18n (`apps/client/messages/{ru,uz,en}.json`)

Удалить ключи (во всех трёх файлах, паритет):
- `listingNew.steps.contacts`
- `listingNew.fields.name`
- `listingNew.fields.phone`
- `listingNew.photoUploader.addDemo`
- `listingNew.preview.rows.contact`

Проверено: `ListingEdit` использует `steps.type/address/params/price/photos/description` — удаляемые ключи
не задействует.

### Часть 4 — `apps/api`, media-cleanup воркер (чистка orphan-фото в R2)

**Контекст дыры:** `DELETE /listings/:id/media/:mediaId` удаляет строку `listing_media` (source of truth),
затем **best-effort** удаляет R2-объект; ошибка `DeleteObjectCommand` глотается (`logger.warn`). Комментарий
обещает «cleanup-джобу (API.md §8)», но её **нет** (есть только promotion-expiry и saved-search). Второй
источник orphan'ов: в `uploadFile` сначала `uploads.upload` (R2), затем `listingMedia.create` — если create
упадёт, объект осиротеет сразу.

**Подход:** бакет-свип, **без новой таблицы/миграции**.

- `UploadsService`: добавить `listKeys(prefix): Promise<{ key, lastModified }[]>` — пагинированный
  `ListObjectsV2` по префиксу.
- Новый модуль media-cleanup по образцу `saved-search`/`promotion`:
  - BullMQ repeatable job (редкий cron — раз в сутки), стабильный scheduler id (upsert при рестартах).
  - Воркер: `listKeys('listings/')` (префикс литеральный — wildcard в середине `ListObjectsV2` не
    поддерживает; ключи вида `listings/<id>/media/...` фильтруем по подстроке `/media/` в коде),
    отфильтровать ключи **старше grace-окна** (~24ч — чтобы не задеть только что загруженные, чья
    DB-строка могла ещё коммититься), затем для тех, у кого **нет** строки в `listing_media`
    (`storageKey = key`), вызвать `uploads.delete(key)`.
  - Закрывает оба источника orphan'ов.
- Config-gated: `MEDIA_CLEANUP_ENABLED` (+ grace-часы и cron-интервал в config). Безопасный выкат на staging.

## Тестирование

- **Vitest клиента** (`@avino/client`): визард рендерит 7 шагов; `ToursSection` присутствует на шаге
  «Описание»; нет полей имени/телефона; нет кнопки «Добавить демо-фото».
- **API-тесты** media-cleanup: воркер удаляет orphan-ключ; **не трогает** ключ с живой `listing_media`-строкой;
  **не трогает** свежий ключ внутри grace-окна.
- `next build` клиента (зелёный).

## Интеграция

- main защищён → stacked PR, мержит пользователь. ADR + DONE.md-подготовку включаем в этот же PR
  (не отдельным follow-up).
- ADR на media-cleanup воркер (новый источник правды по уборке orphan-медиа).

## Вне scope

- Read-only превью контакта на шаге туров (рассматривалось, отклонено в пользу более простого варианта).
- Очередь отложенного удаления через новую таблицу (выбран бакет-свип без миграции).
- `URL.revokeObjectURL` на удаление фото в загрузчике (мелкая браузерная утечка, не R2) — можно прихватить
  попутно, но не цель.
