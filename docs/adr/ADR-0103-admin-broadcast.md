# ADR-0103 — Слой admin-рассылки: ручная массовая рассылка из панели администратора

## Status

Accepted

## Date

2026-06-22

## Context

До этого момента в Avino не существовало инструмента для ручной массовой рассылки
уведомлений из панели администратора. Администратор не мог самостоятельно отправить
сообщение группе пользователей (все / по сегменту / один конкретный) через email, push,
in-app или SMS. Весь слой доставки уведомлений (ADR-0102) работал только как реакция на
системные события (новый лид, смена статуса модерации, сохранённый поиск и т.д.).

Бизнес-потребность: информировать аудиторию о промо-акциях, новых функциях, важных
изменениях в сервисе — без необходимости интеграции стороннего сервиса рассылок.

## Decision

Реализован **строго аддитивный** слой `Broadcast` поверх существующего диспетчера
уведомлений (ADR-0102). Продюсеры, in-app read-path и сам диспетчер не менялись.

### Модель данных

Новые сущности в `schema.prisma` (таблица `broadcasts`):

- **`Broadcast`** — запись рассылки:
  - `id` (UUID), `createdById` (FK → User), `createdAt`, `updatedAt`;
  - `title` (VarChar 255) — заголовок уведомления, вшивается в каждую Notification;
  - `body` — тело уведомления;
  - `language` (`Language`: RU/UZ/EN) — **один язык на рассылку**, без авто-перевода;
    администратор сам пишет текст на нужном языке;
  - `audienceType` (`BroadcastAudience`: `SINGLE | SEGMENT`);
  - `targetUserId` (опц., UUID, FK → User) — задействован при `SINGLE`;
  - `filterStatus` (`UserStatus?`) — опциональный фильтр аудитории по статусу пользователя;
  - `filterRole` (`String?`) — опциональный фильтр по роли;
  - `channels` (`NotificationChannel[]`) — выбранные каналы: EMAIL / PUSH / IN_APP / SMS;
  - `status` (`BroadcastStatus`: `SCHEDULED | SENDING | SENT | FAILED | CANCELED`);
  - `scheduledAt` — `now()` для немедленной отправки, будущая дата — для отложенной;
  - `recipientCount` — заполняется по факту материализации;
  - `sentAt`.

- **Расширения существующих enum'ов**:
  - `NotificationChannel` + `SMS`;
  - `NotificationType` + `ADMIN_BROADCAST`.

Миграция: `20260622100000_admin_broadcast`.

### API (ADMIN-only)

```
POST  /api/v1/admin/broadcasts/preview   — превью аудитории (кол-во получателей, без создания)
POST  /api/v1/admin/broadcasts           — создать рассылку (немедленно или отложенно)
GET   /api/v1/admin/broadcasts           — история рассылок (offset-пагинация, фильтр по статусу)
GET   /api/v1/admin/broadcasts/:id       — деталь + разбивка доставок по каналам/статусам
POST  /api/v1/admin/broadcasts/:id/cancel — отмена (только SCHEDULED → CANCELED)
```

Все роуты задекорированы `@Roles(Role.ADMIN)`. MODERATOR доступа не имеет.

Audit-лог: `BROADCAST_CREATE` при создании, `BROADCAST_CANCEL` при отмене.

### Логика доставки

**`BroadcastDispatcherService`** — BullMQ sweep-воркер (очередь
`broadcast_dispatch_queue`, cron `BROADCAST_DISPATCH_CRON`, дефолт `*/1 * * * *`).

Прогон `run()`:

1. Выбирает до `SWEEP_LIMIT=5` рассылок в статусе `SCHEDULED` где
   `scheduledAt <= now()` (по возрастанию `scheduledAt`).
2. Для каждой вызывает `materialize(broadcastId)`.

`materialize(broadcastId)`:

1. **Атомарный guard-переход** `SCHEDULED → SENDING` через
   `updateMany({ where: { id, status: SCHEDULED } })`. Если `count === 0` —
   кто-то уже взял рассылку (или статус не SCHEDULED), выход без ошибки.
2. `fanOutRecipients()` — резолв аудитории keyset-батчами (`MATERIALIZE_BATCH_SIZE=500`):
   - Строит `WHERE`-условие через `BroadcastAudienceService.buildUserWhere()`.
   - На каждый батч пользователей:
     a. `notification.createMany()` — строка `Notification(type=ADMIN_BROADCAST,
        channel=IN_APP, broadcastId, title=b.title, body=b.body)` на каждого
        получателя. **IN_APP = сама строка Notification** (лента колокольчика),
        без отдельной записи доставки.
     b. Для внешних каналов (EMAIL/PUSH/SMS из выбранных) — `notificationDelivery.createMany()`
        только для **достижимых** получателей (email != null / phone != null /
        есть активное устройство).
3. По завершению — `broadcast.update({ status: SENT, recipientCount, sentAt })`.
4. При исключении — `broadcast.update({ status: FAILED })`, throw.

Реальную доставку (EMAIL/PUSH/SMS) выполняет **существующий**
`NotificationDispatcherService.deliver()` (ADR-0102) — те же ретраи, kill-switch'и,
рендер на языке получателя. Для типа `ADMIN_BROADCAST` routing-политика возвращает
`[]` (пустой массив), поэтому штатный fan-out этого диспетчера такие уведомления
**игнорирует** (нет создания доставок — не будет дублей).

### SMS-канал

SMS — полноценный канал рассылки. Отправляется **фиксированный локализованный
«пинок»** через шаблон `smsBroadcastNudge(lang)` (`notification-templates.ts`), а не
сам текст рассылки, т.к. Eskiz.uz доставляет только предодобренные шаблоны.
Полный текст рассылки получатель видит в ленте IN_APP / email.

### Конфигурация (env, опциональны)

- `BROADCAST_DISPATCH_CRON` — расписание sweep (дефолт `*/1 * * * *`).
- `MATERIALIZE_BATCH_SIZE=500` — размер батча материализации (hardcoded константа
  в `broadcasts.constants.ts`; env-переопределение не предусмотрено в MVP).

Каналы EMAIL/PUSH подчиняются существующим kill-switch'ам
(`email_notifications_enabled` / `push_notifications_enabled`, ADR-0102).
SMS подчиняется `sms_sending_enabled` (ADR-0090).

## Consequences

Positive:
- Администратор может рассылать уведомления любым каналом (in-app/email/push/SMS)
  без стороннего сервиса рассылок.
- Аддитивно и низкорисково: существующие продюсеры, диспетчер и in-app read-path
  не затронуты; guard-переход статуса обеспечивает идемпотентность.
- Реальная доставка email/push/SMS делегируется проверенному `NotificationDispatcher`
  (ретраи, kill-switch'и, локализация — из коробки).
- Превью аудитории позволяет проверить охват до отправки.
- Расширяемость: новый тип аудитории или канал добавляется без изменения core-логики.

Negative / trade-offs:
- Миграция `20260622100000_admin_broadcast` должна быть применена на staging/prod
  (`migrate deploy`) до использования фичи.
- SMS-рассылка зависит от одобренного Eskiz-шаблона `smsBroadcastNudge`; без
  одобрения провайдер отклонит отправку (SMS-доставка помечается FAILED,
  другие каналы не блокируются).
- Один язык на рассылку — авто-перевода нет; администратор должен создать
  отдельную рассылку для каждого целевого языка.
- Большие рассылки (100k+ пользователей) дренируются sweep-батчами постепенно;
  `recipientCount` обновляется только по завершению всей материализации.
- Telegram-пользователи (без email/phone/устройства) получают только IN_APP;
  привязка telegram_id для внешней доставки вне scope MVP.
- Нет `@@unique([broadcastId, userId])` на `Notification` — идемпотентность
  материализации держится на атомарном guard-переходе (follow-up: добавить
  уникальный индекс).
- Штатный fan-out `NotificationDispatcherService` исключает broadcast-уведомления
  через фильтр `broadcastId: null` (правка ADR-0103 final-review): без этого фильтра
  fan-out загружал бы тысячи broadcast-строк только для того, чтобы их пропустить.

## Related files

- `apps/api/prisma/schema.prisma` (модель `Broadcast`, enum `BroadcastAudience`,
  enum `BroadcastStatus`, расширения `NotificationChannel`, `NotificationType`)
- `apps/api/prisma/migrations/20260622100000_admin_broadcast/migration.sql`
- `apps/api/src/broadcasts/broadcasts.module.ts`
- `apps/api/src/broadcasts/admin-broadcasts.controller.ts`
- `apps/api/src/broadcasts/broadcasts.service.ts`
- `apps/api/src/broadcasts/broadcast-dispatcher.service.ts`
- `apps/api/src/broadcasts/broadcast-audience.service.ts`
- `apps/api/src/broadcasts/broadcast.queue.ts`
- `apps/api/src/broadcasts/broadcast.worker.ts`
- `apps/api/src/broadcasts/broadcasts.constants.ts`
- `apps/api/src/broadcasts/dto/`
- `apps/api/src/notifications/delivery/notification-routing.ts`
  (`ADMIN_BROADCAST → []`)
- `apps/api/src/notifications/delivery/notification-dispatcher.service.ts`
  (фильтр `broadcastId: null` в fan-out)
- `apps/api/src/notifications/delivery/notification-renderer.service.ts`
- `apps/api/src/notifications/delivery/notification-templates.ts`
  (`smsBroadcastNudge`)
- `apps/api/src/config/configuration.ts` (`broadcasts.dispatchCron`)
- `apps/api/openapi.internal.json` (5 broadcast-роутов)

## Related task

- TASK — admin-broadcast backend layer (feat/notifications-email-push)
