# ADR-0087 — In-app уведомления: рендер заголовка/тела на клиенте из type + data_json (apps/client)

## Status

Accepted

## Date

2026-06-18

## Context

Лента «Уведомления» (`apps/client`, `features/account/Notifications.tsx`)
показывала карточки **только с иконкой** (выводится из `type`) **и относительным
временем** (`created_at`) — без заголовка и без текста (репорт пользователя по
скриншоту demo: `chat-seller@demo.avino.uz`).

Корень — на стороне данных, а не вёрстки:

- Все продюсеры уведомлений в API пишут в таблицу `notifications` **только
  структуру** — `type` + `data_json` (+ `channel`), без `title`/`body`:
  `moderation.service.ts` (`LISTING_MODERATION_STATUS_CHANGED`),
  `notifications.service.ts` (`queueChatMessage`, `queueSavedSearchNewListing`,
  `queuePromotionExpired`).
- Колонки `title`/`body` — nullable без дефолта (`schema.prisma`) → всегда `NULL`.
  По дизайну человекочитаемый текст должен был рендерить EMAIL/PUSH BullMQ-воркер
  при отправке из `data_json`, но транспорт ещё стаб (см. комментарии в
  продюсерах: «воркер подберёт и отправит EMAIL позже»).
- In-app лента (TASK-100, `GET /notifications`) отдаёт `title`/`body` как есть
  (`NotificationResponse.toResponse`), клиент печатал их дословно → пустые карточки.
- Иконка и время видны, потому что не зависят от `title`/`body`: иконка маппится
  на клиенте из `type`, время — из `created_at`.

Подтверждено вживую: `GET /notifications` для демо-пользователя вернул 8
уведомлений (4 × `LISTING_MODERATION_STATUS_CHANGED` + 4 × `NEW_CHAT_MESSAGE`),
у **всех** `title=null, body=null`; полезный сигнал — в `data_json` (например
`new_status: ACTIVE|REJECTED`).

Дополнительно: клиентский контракт `ApiNotification.title/body` декларировал
`string` (non-null), хотя API реально возвращает `string | null`
(`NotificationResponse`) — тип врал.

## Decision

Текст in-app уведомления **собирается на клиенте** из `type` + `data_json` через
next-intl. Без изменений бэкенда и без миграций. Всё в пределах `apps/client`.

- **`features/account/notificationText.ts`** (новый) — чистая
  `notificationContent(type, data_json, t): { title, body }`. Маппинг по типу:
  - `LISTING_MODERATION_STATUS_CHANGED` — тело по `data_json.new_status`
    (`ACTIVE`/`DRAFT`/`REJECTED`(+`reason`)/`DELETED`), иначе общий фолбэк;
  - `SAVED_SEARCH_NEW_LISTING` — `{name}` из `saved_search_name`, иначе
    `body_noname`;
  - чат / промо / лид / price-drop — текст по типу;
  - неизвестный тип → `generic`-фолбэк (бэкенд может добавлять типы — ADR-0008,
    non-breaking).
- **i18n** — ключи `account.notifications.types.*` в `ru`/`uz`/`en` (по 22 ключа,
  parity обязательна). Текст живёт на языке интерфейса и переключается в рантайме.
- **`Notifications.tsx`** — приоритет серверному тексту:
  `n.title?.trim() || fallback.title` (то же для `body`). Forward-compatible: когда
  подключат EMAIL/PUSH-воркер и он начнёт заполнять `title`/`body`, лента
  автоматически покажет серверный текст, а хелпер останется фолбэком.
- **`store/api/notificationsApi.ts`** — тип `ApiNotification.title/body` →
  `string | null` (совпал с реальным контрактом API).

### Почему на клиенте (вариант C), а не на сервере

- Проект i18n-first (RU/UZ/EN, без хардкод-строк, язык переключается в рантайме) —
  серверный рендер потребовал бы `Accept-Language` и потерял бы живое переключение.
- Ноль бэкенд-изменений и миграций; путь к серверному рендеру остаётся открытым.

### Рассмотренные альтернативы

- **A. Рендер на read-time в API** (`toResponse` / рендерер по `type`+`data_json`)
  — единый источник, удобно будущему Flutter, но фиксирует язык на сервере.
  Отложено до появления мобильного клиента.
- **B. Денормализация в `title`/`body` при записи** (в продюсерах) — ломает i18n:
  язык вшивается в момент записи, пользователь переключить не может.

## Consequences

- Карточки уведомлений показывают осмысленный текст немедленно, без бэкенд-работы
  и миграций.
- При появлении мобильного клиента логику рендера придётся продублировать (или
  перенести в API — вариант A).
- Покрыто 7 unit-тестами (`notificationText.test.ts`, через `t`-стаб ключ→ключ);
  полный прогон клиента 121/121, `tsc`/`eslint` чисто.
- Проверено вживую на demo-данных: 8 реальных уведомлений (все с `title/body=null`)
  → корректный RU-текст, включая подстановку `reason` для `REJECTED`.

## Files

- `apps/client/src/features/account/notificationText.ts` (new)
- `apps/client/src/features/account/notificationText.test.ts` (new)
- `apps/client/src/features/account/Notifications.tsx`
- `apps/client/src/store/api/notificationsApi.ts`
- `apps/client/messages/ru.json`, `apps/client/messages/uz.json`, `apps/client/messages/en.json`
