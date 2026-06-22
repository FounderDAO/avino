# ADR-0102 — Слой доставки уведомлений: локализованный email + Firebase push

## Status

Accepted

## Date

2026-06-22

## Context

CLAUDE.md §11 для MVP требует: email-алерты, push для мобильного приложения,
уведомления о сохранённых поисках, о новых сообщениях в чате и о смене статуса
модерации. На каждое уведомление текст должен приходить **на выбранном
пользователем языке** (RU/UZ/EN) и систему нужно легко расширять новыми типами.

К этому моменту существовал только каркас:

- модель `Notification` (`type`, `channel` EMAIL/PUSH/IN_APP, `status`,
  `data_json`, …) и продюсеры, создающие in-app строки;
- таблица `NotificationDevice` (push-токены, ADR-0010) и эндпоинты регистрации
  устройств — но без реального транспорта;
- BullMQ `email_queue` + SMTP-воркер (`EmailSender`), использовавшийся только для
  OTP и дайджеста сохранённых поисков.

**Чего не хватало:** слоя доставки. EMAIL/PUSH-уведомления создавались как
`PENDING`, но ничто их не отправляло; не было backend-i18n для писем, HTML-шаблонов
и интеграции с FCM. Языки получателя (`User.defaultLanguage`,
`UserProfile.preferredLanguage`) нигде не использовались для доставки.

## Decision

Добавлен **строго аддитивный** слой доставки. Продюсеры и in-app read-path не
менялись.

1. **Таблица `notification_deliveries`** (миграция `20260622000000`) — одна строка
   на `(notification, channel)` со статусом доставки (`PENDING/SENT/FAILED`),
   `attempts`, `last_error`, `sent_at`. Уникальность `(notification_id, channel)`
   обеспечивает идемпотентность fan-out. Доставка email/push отделена от in-app
   read-state (`Notification.status` не трогаем).

2. **Routing policy** (`notification-routing.ts`) — единый источник правды
   «тип → каналы». Это и есть seam расширяемости: новый тип = одна запись в карте
   + одна в каталоге. NEW_CHAT_MESSAGE → PUSH + EMAIL (с тротлингом), NEW_LEAD /
   TOUR_REQUEST_STATUS_CHANGED / LISTING_MODERATION_STATUS_CHANGED → EMAIL + PUSH,
   SAVED_SEARCH_NEW_LISTING → только PUSH (email уже шлёт существующий дайджест —
   не дублируем), PROMOTION_EXPIRED → EMAIL.

3. **i18n-каталог + рендерер** (`notification-templates.ts`,
   `notification-renderer.service.ts`) — RU/UZ/EN тексты (зеркалят клиентские
   ключи `accounts.notifications.types.*`), брендовая HTML-обёртка письма + CTA
   deep-link на портал. Язык получателя =
   `profile.preferredLanguage ?? user.defaultLanguage` (та же конвенция, что у
   переводов листингов). Рендерер дозагружает сущности (заголовок объявления,
   имя отправителя) по id из `data_json` (snake_case-ключи продюсеров).

4. **`FcmService`** — отправка push через `firebase-admin`, config-gated (зеркало
   `EmailSender`): без кредов в dev логирует, в prod молча skip, никогда не бросает.
   Невалидные FCM-токены (`registration-token-not-registered`) деактивируются
   (`NotificationDevice.isActive=false`).

5. **`NotificationDispatcherService`** — BullMQ repeatable job
   `notification_dispatch_queue` (зеркало `saved_search_queue`). Прогон: (a) fan-out
   свежих (`lookback`) уведомлений в каналы по routing-политике (создаёт PENDING
   доставки; тротлинг чат-email по `thread_id`); (b) deliver PENDING/FAILED
   (attempts<3) — рендер на языке получателя, email через `email_queue`, push через
   FCM, отметка SENT/FAILED. Best-effort: падение одной доставки не прерывает прогон.

6. **Admin kill-switches** — `email_notifications_enabled` /
   `push_notifications_enabled` в `app_settings` (зеркало SMS-тоггла):
   `GET/PATCH /api/v1/admin/notification-settings` (ADMIN) + тумблеры в
   `/admin/settings`. Выключенный канал оставляет доставки `PENDING` (доедут при
   включении), не `FAILED`. Дефолт — ВКЛ (env `NOTIFICATIONS_EMAIL_ENABLED` /
   `NOTIFICATIONS_PUSH_ENABLED`).

Конфиг (всё опционально, config-gated): `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY`,
`NOTIFICATION_DISPATCH_CRON/LOOKBACK_MIN/BATCH/CONCURRENCY`, `EMAIL_CHAT_THROTTLE_MIN`,
`APP_PUBLIC_URL`.

## Consequences

Positive:
- Выполнен MVP-пункт §11 (email + push + saved-search/chat/moderation), доставка на
  языке пользователя.
- Расширяемость: новый тип уведомления подключается двумя записями (routing +
  каталог), без изменений воркера/диспетчера.
- Аддитивно и низкорисково перед продом: продюсеры и read-path не тронуты;
  config-gated — без кредов система собирается и работает.
- Идемпотентность и устойчивость: unique-constraint + best-effort прогон + ретраи
  до 3 попыток; админ-kill-switch на случай сбоя SMTP/FCM.

Negative / trade-offs:
- Диспетчер — polling (repeatable cron, дефолт раз в минуту), не реактивный: задержка
  доставки до ~минуты (приемлемо для email/push). Целевой реактивный путь — позже,
  без изменения контракта (как у saved-search §16).
- Окно fan-out ограничено `lookback` (дефолт 60 мин): если диспетчер простаивает
  дольше окна, часть уведомлений не получит email/push (in-app не теряется — это
  источник истины). Расширяется через env.
- PUSH-доставки создаются и для пользователей без устройств (web-only) и помечаются
  `FAILED` (до 3 ретраев) — шум в `notification_deliveries`. Оптимизация (skip при
  отсутствии устройств) вынесена в follow-up.
- Per-user настройки уведомлений (opt-out по типам) не реализованы — routing-policy
  готова как seam, но таблиц/UI преференсов пока нет (следующая итерация).

## Related files

- apps/api/prisma/schema.prisma (`NotificationDelivery`)
- apps/api/prisma/migrations/20260622000000_notification_deliveries/migration.sql
- apps/api/src/notifications/delivery/* (routing, templates, renderer, fcm,
  dispatcher, dispatch queue/worker)
- apps/api/src/notifications/notification.constants.ts
- apps/api/src/admin/admin-notification-settings.{service,controller}.ts
- apps/api/src/config/configuration.ts, env.validation.ts, .env.example
- apps/web/src/components/admin/NotificationsSendingToggle.tsx,
  apps/web/src/store/api/adminNotificationSettingsApi.ts
- apps/client/src/features/account/notificationText.ts, messages/{ru,uz,en}.json
- docs/GUIDE_FIREBASE_PUSH_SETUP.md
- openapi.internal.json (admin notification-settings route)

## Related task

- TASK — notifications email + Firebase push delivery (MVP §11)
