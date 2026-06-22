# ADR-0103 — Слой admin-рассылки: ручная массовая рассылка из панели администратора

## Status

Accepted

## Date

2026-06-22

## Context

До этого момента в Avino не существовало инструмента для ручной массовой рассылки
уведомлений из панели администратора. Администратор не мог самостоятельно отправить
сообщение группе пользователей (все / по роли / один конкретный) через email, push
или SMS. Весь слой доставки уведомлений (ADR-0102) работал только как реакция на
системные события (новый лид, смена статуса модерации, сохранённый поиск и т.д.).

Бизнес-потребность: информировать аудиторию о промо-акциях, новых функциях, важных
изменениях в сервисе — без необходимости интеграции стороннего сервиса рассылок.

## Decision

Реализован **строго аддитивный** слой `Broadcast` поверх существующего диспетчера
уведомлений (ADR-0102). Продюсеры, in-app read-path и сам диспетчер не менялись.

### Модель данных

Новые сущности в `schema.prisma`:

- **`AdminBroadcast`** — запись рассылки: `id`, `title` (внутреннее название для лога),
  `message_ru / message_uz / message_en` (тело на трёх языках), `channel`
  (`NotificationChannel`: EMAIL / PUSH / IN_APP / SMS), `audience_type`
  (`BroadcastAudience`: ALL / BY_ROLE / SINGLE_USER), `audience_role` (опц.),
  `target_user_id` (опц.), `status` (`BroadcastStatus`: SCHEDULED / SENDING / DONE /
  CANCELLED / FAILED), `created_by_id`, `scheduled_at` (нет = немедленно),
  `sent_at`, `recipient_count`, `error_message`, `created_at`.
- **Enum расширения**: `NotificationChannel` + `SMS`; `NotificationType` +
  `ADMIN_BROADCAST` (существующая таблица `Notification`).

Миграция: `20260622100000_admin_broadcast`.

### API (ADMIN-only)

```
POST   /api/v1/admin/broadcasts         — создать рассылку (немедленно или отложенно)
GET    /api/v1/admin/admin/broadcasts   — история рассылок (пагинация)
GET    /api/v1/admin/broadcasts/:id     — деталь + статус
POST   /api/v1/admin/broadcasts/:id/cancel — отмена (только SCHEDULED)
POST   /api/v1/admin/broadcasts/preview — превью аудитории (кол-во получателей без доставки)
```

Все роуты задекорированы `@Roles(Role.ADMIN)` (не MODERATOR).

### Логика доставки

**`AdminBroadcastService`** (`BroadcastsModule`):

1. `create` — сохраняет рассылку со статусом SCHEDULED, немедленно вызывает `process`.
2. `process` — guard-переход `SCHEDULED → SENDING` (идемпотентность: повторный вызов
   игнорируется), материализует аудиторию батчами (`BROADCAST_BATCH_SIZE`, дефолт 100),
   для каждого пользователя создаёт `Notification` типа `ADMIN_BROADCAST` + вызывает
   доставку через существующий `NotificationDeliveryService`. По завершению →
   `DONE`/`FAILED` + `recipient_count` + `sent_at`.
3. **Один язык на рассылку** — администратор заполняет `message_ru/uz/en` сам;
   рендерер использует поле языка получателя без перевода. Если поле языка пустое —
   фолбэк на RU.
4. **IN_APP** — создаёт строку `Notification` (лента колокольчика получает
   стандартный `title/body` из поля языка); без нового канала доставки.
5. **SMS** — использует `NotificationChannel.SMS` + существующий `SmsService`
   (Eskiz.uz); `smsBroadcastNudge` — фиксированный шаблон `{message}` (должен быть
   одобрен в кабинете Eskiz, иначе Eskiz вернёт ошибку).
6. **Превью** (`preview`) — только подсчёт аудитории, без создания записей
   и уведомлений.

### Конфигурация

Новые env (все опциональны, config-gated):
- `BROADCAST_BATCH_SIZE` (дефолт 100) — размер батча аудитории.

Каналы EMAIL/PUSH подчиняются существующим kill-switch-ам
(`email_notifications_enabled` / `push_notifications_enabled`, ADR-0102).

## Consequences

Positive:
- Администратор может рассылать уведомления любым каналом (email/push/in-app/SMS)
  без стороннего сервиса рассылок.
- Аддитивно и низкорисково: существующие продюсеры, диспетчер и in-app read-path
  не затронуты; guard-переход статуса обеспечивает идемпотентность.
- Расширяемость: новый тип аудитории или канал добавляется без изменения core-логики.
- Превью аудитории позволяет администратору проверить охват до отправки.

Negative / trade-offs:
- Миграция `20260622100000_admin_broadcast` должна быть применена на staging/prod
  (`migrate deploy`) до использования фичи.
- SMS-рассылка требует одобренного шаблона Eskiz (`smsBroadcastNudge`); без
  одобрения провайдер отклонит сообщение (рассылка помечается `FAILED` для SMS,
  но не блокирует другие каналы).
- Throughput: пакетная материализация аудитории выполняется синхронно в рамках
  одного запроса; для рассылок на 10k+ пользователей целесообразен перевод в
  BullMQ-воркер (follow-up).
- IN_APP-рассылка не фильтруется по каналу в ленте колокольчика — получатель видит
  её как обычное системное уведомление (клиентский `notificationContent` обработает
  тип `ADMIN_BROADCAST` через server `title/body`; не блокер MVP).

## Related files

- apps/api/prisma/schema.prisma (`AdminBroadcast`, enum extensions)
- apps/api/prisma/migrations/20260622100000_admin_broadcast/migration.sql
- apps/api/src/admin/broadcasts/ (module, controller, service, dto, spec)
- apps/api/src/notifications/delivery/notification-delivery.service.ts
- apps/api/src/notifications/notification.constants.ts
- apps/api/src/sms/sms.service.ts
- apps/api/openapi.internal.json (5 broadcast-роутов)

## Related task

- TASK — admin-broadcast backend layer (PR-1 feat/notifications-email-push)
