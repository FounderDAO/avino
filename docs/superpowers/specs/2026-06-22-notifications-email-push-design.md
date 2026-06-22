# Дизайн: локализованные email-уведомления + Firebase push

**Дата:** 2026-06-22
**Статус:** Утверждён (пред-апрув владельца), реализация через суб-агентов
**Автор:** Claude (контроллер) по заданию Tommy
**Связанные ADR:** новый ADR-0102 (notification delivery layer)

## 1. Контекст и проблема

Через 1–2 дня прод. Нужны:

1. **Email-уведомления**, локализованные по выбранному пользователем языку (RU/UZ/EN),
   на события: «вам написали в чат», «запросили тур по вашему объявлению», смена статуса
   модерации и т.д. Система должна **легко расширяться** новыми типами.
2. **Push для мобильного приложения через Firebase (FCM)** — хранить токен устройства
   и сопутствующие данные.

### Что УЖЕ есть (источник правды — код)

- `Notification` (Prisma): `id, userId, type (enum), channel (EMAIL|PUSH|IN_APP),
  status (PENDING|SENT|FAILED|READ), title?, body?, dataJson?, readAt?, sentAt?, createdAt`.
- `NotificationDevice`: `id, userId, platform (ANDROID|IOS|WEB), pushToken UNIQUE,
  isActive, lastSeenAt, createdAt` (ADR-0010, был stub).
- Enum `NotificationType` (8): `SAVED_SEARCH_NEW_LISTING, FAVORITE_PRICE_DROP,
  NEW_CHAT_MESSAGE, LISTING_MODERATION_STATUS_CHANGED, NEW_LEAD, PROMOTION_ACTIVATED,
  PROMOTION_EXPIRED, TOUR_REQUEST_STATUS_CHANGED`.
- Продюсеры создают `Notification`-строки (chat, tour-requests, moderation, saved-search,
  promotion-expiry).
- Эндпоинты устройств: `POST /notifications/devices` (upsert по `pushToken`),
  `DELETE /notifications/devices/:id`.
- Email-транспорт: `EmailService.sendEmail({to,subject,text,html?})` → BullMQ `email_queue`
  → `EmailWorker` → `EmailSender.deliver()` (nodemailer SMTP, config-gated, dev-fallback).
- Admin-тумблер SMS/Telegram: ключ в `app_settings`, `resolveX(stored, envDefault)`,
  `GET/PATCH /admin/<x>-settings`, аудит-лог.
- Язык пользователя: `User.defaultLanguage` (always set, default RU) +
  `UserProfile.preferredLanguage?` (override). Конвенция чтения:
  `profile.preferredLanguage ?? user.defaultLanguage`.

### Чего НЕ хватает (корень задачи)

**Слой доставки.** EMAIL/PUSH-уведомления создаются как `PENDING`, но **ничего их не
отправляет**: нет воркера, который читает `notifications`, рендерит локализованный текст
и доставляет через email/FCM. HTML-шаблонов и backend-i18n для писем нет. FCM не подключён.

## 2. Принципы решения

- **Аддитивность** — не трогаем продюсеры и read-path (in-app фид). Только добавляем слой
  доставки. Минимум риска перед продом.
- **Расширяемость** — добавление нового типа уведомления = одна запись в routing-policy
  + одна запись в i18n-каталоге. Никаких изменений в воркере/диспетчере.
- **Config-gated** — без кредов (SMTP/FCM) код собирается и работает; в dev логирует,
  в prod молча skip (зеркало текущего `EmailSender`).
- **Идемпотентность** — повторные прогоны диспетчера не плодят дубли доставок.
- **Следуем существующим паттернам** — BullMQ repeatable job (как `saved_search_queue`),
  admin-тумблер (как SMS), language-resolution (как listing translations).

## 3. Архитектура

```
Событие (chat msg / tour request / moderation / …)
  → продюсер создаёт Notification (БЕЗ ИЗМЕНЕНИЙ)         ← in-app фид, read-state
                                                          (источник истины события)
NotificationDispatcher (BullMQ repeatable, ~каждые 30с)
  ├─ FAN-OUT: свежие Notification без доставок
  │            → routing policy (type → каналы) + global toggles + наличие email/устройств
  │            → создаёт PENDING NotificationDelivery на каждый канал
  └─ DELIVER: PENDING NotificationDelivery
               → NotificationRenderer(type, dataJson, lang) на языке получателя
               → EMAIL: EmailService.sendEmail() → email_queue (ретраи там)
               → PUSH:  FcmService.send(tokens) ; мёртвые токены → device.isActive=false
               → отметка SENT/FAILED, attempts, lastError, sentAt
```

### 3.1. Модель данных (миграция)

Новая таблица **`notification_deliveries`** (`20260622000000_notification_deliveries`):

```prisma
model NotificationDelivery {
  id             String              @id @default(uuid()) @db.Uuid
  notificationId String              @map("notification_id") @db.Uuid
  channel        NotificationChannel // EMAIL | PUSH (IN_APP сюда не пишем)
  status         NotificationStatus  @default(PENDING) // PENDING|SENT|FAILED
  attempts       Int                 @default(0)
  lastError      String?             @map("last_error")
  sentAt         DateTime?           @map("sent_at") @db.Timestamptz(6)
  createdAt      DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime            @updatedAt @map("updated_at") @db.Timestamptz(6)

  notification   Notification        @relation(fields: [notificationId], references: [id], onDelete: Cascade)

  @@unique([notificationId, channel])
  @@index([status, createdAt])
  @@map("notification_deliveries")
}
```

Плюс обратная связь на `Notification`: `deliveries NotificationDelivery[]`.

`Notification.status`/`channel`/`sentAt` **остаются как есть** (in-app read-state). Делитесь
доставки — отдельная таблица. Это разделяет «прочитано в фиде» и «доставлено по email/push».

Миграцию пишем **руками** в `apps/api/prisma/migrations/20260622000000_notification_deliveries/migration.sql`
(локально нет `DATABASE_URL` — применится в staging/CI; прецедент: tour_requests).

`NotificationDevice` **не меняем** — полей `pushToken/platform/isActive/lastSeenAt` достаточно
(это и есть «токен девайса и ещё что-то»).

### 3.2. Routing policy (`notification-routing.ts`)

Единственный источник правды «тип → каналы». Карта:

| Тип | IN_APP | EMAIL | PUSH | Примечание |
|-----|--------|-------|------|-----------|
| `NEW_CHAT_MESSAGE` | ✓(есть) | ✓* | ✓ | *email с тротлингом 30 мин на (получатель, thread) |
| `NEW_LEAD` (запрос тура) | ✓(есть) | ✓ | ✓ | |
| `TOUR_REQUEST_STATUS_CHANGED` | ✓(есть) | ✓ | ✓ | |
| `LISTING_MODERATION_STATUS_CHANGED` | ✓(есть) | ✓ | ✓ | |
| `SAVED_SEARCH_NEW_LISTING` | ✓(есть) | ✗ | ✓ | email уже шлёт существующий дайджест — не дублируем |
| `PROMOTION_EXPIRED` | ✓(есть) | ✓ | ✗ | |
| `FAVORITE_PRICE_DROP`, `PROMOTION_ACTIVATED` | — | — | — | продюсеров нет; routing задан, но инертен |

Карта — `Record<NotificationType, NotificationChannel[]>`. Тротлинг чата —
опция в policy (`emailThrottleMinutesByType`). Routing **превалирует** над legacy-полем
`Notification.channel` (его не используем для fan-out).

### 3.3. NotificationRenderer + i18n-каталог

`apps/api/src/notifications/delivery/notification-templates.ts` — каталог:

```
type NotificationCopy = {
  email?: { subject: string; bodyHtml: string; bodyText: string };
  push?:  { title: string; body: string };
};
// catalog[type][lang] → NotificationCopy
```

- 3 языка (RU/UZ/EN) на каждый активный тип. Тексты зеркалят клиентские ключи
  `accounts.notifications.types.*` (apps/client/messages/*.json) — те же формулировки.
- Интерполяция данных из `dataJson` (+ дозагрузка сущностей по id: заголовок объявления,
  имя отправителя — рендерер делает Prisma-запросы, продюсеры не трогаем).
- Email: общая брендовая HTML-обёртка (inline-стили, email-safe) + CTA-кнопка со ссылкой
  на портал (listing / chat / «мои туры»). Всегда есть text-fallback.
- Deep-link базовый URL: `APP_PUBLIC_URL` (default `https://avino.uz`).
- `resolveLanguage`: `profile.preferredLanguage ?? user.defaultLanguage`, fallback RU.

**Расширяемость:** новый тип → добавить запись в `catalog` (3 языка) + строку в routing. Всё.

### 3.4. FcmService (`delivery/fcm.service.ts`)

- Зависимость `firebase-admin`. Init ленивый/config-gated: креды из
  `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (service account).
- Нет кредов → `isConfigured()=false`: в dev лог `[DEV PUSH → token] title`, в prod skip
  (зеркало `EmailSender`).
- `send(tokens, {title, body, data})` → FCM multicast. Ответы с `messaging/registration-token-not-registered`
  → вернуть список мёртвых токенов, диспетчер ставит `device.isActive=false`.
- `data`-payload: `{ type, notificationId, listingId?, threadId?, … }` для навигации в приложении.

### 3.5. NotificationDispatcher

- BullMQ: `notification_dispatch_queue` + repeatable job `dispatch_notifications`
  (продюсер `NotificationDispatchQueue.onModuleInit` → `upsertJobScheduler`,
  cron из `NOTIFICATION_DISPATCH_CRON`, default `*/1 * * * *`; для суб-минутной задержки
  допускается интервальный режим — но MVP: раз в минуту достаточно) + воркер
  `NotificationDispatchWorker` (зеркало `SavedSearchWorker`). Бизнес-логика в
  `NotificationDispatcherService.run()` (покрыта юнит-тестами).
- **Fan-out:** `Notification` где `createdAt > now - NOTIFICATION_DISPATCH_LOOKBACK_MIN`
  (default 60), тип имеет EMAIL/PUSH-каналы, и нет `NotificationDelivery` для нужного канала
  → создать PENDING-доставки. Тротлинг чат-email проверяется здесь. Идемпотентность —
  `unique(notificationId, channel)` (конфликт → skip).
- **Deliver:** PENDING `NotificationDelivery` (+ FAILED с `attempts < MAX_ATTEMPTS=3`):
  - проверить global toggle канала (выкл → не трогать, оставить PENDING);
  - загрузить получателя (email, devices, язык);
  - рендер `NotificationRenderer`;
  - EMAIL → `EmailService.sendEmail` (enqueue) → `SENT`;
  - PUSH → `FcmService.send` → `SENT`/`FAILED`, деактивация мёртвых токенов;
  - ошибка → `FAILED`, `attempts++`, `lastError` (ретрай на след. прогоне).
- Батч-лимит на прогон (`NOTIFICATION_DISPATCH_BATCH`, default 200).
- Best-effort: падение доставки не ломает прогон; Notification (in-app) — источник истины.

### 3.6. Admin kill-switches (зеркало SMS)

- `app_settings` ключи: `email_notifications_enabled`, `push_notifications_enabled`
  (`resolveNotificationChannelEnabled(stored, envDefault)`); env-дефолты
  `NOTIFICATIONS_EMAIL_ENABLED` / `NOTIFICATIONS_PUSH_ENABLED` (default true).
- `AdminNotificationSettingsService.get()/update(adminId, dto)` + аудит-лог
  (`NOTIFICATION_SETTINGS_UPDATE`).
- `AdminNotificationSettingsController`: `GET /admin/notification-settings`
  (`{emailEnabled, pushEnabled}`), `PATCH` (`{emailEnabled?, pushEnabled?}`). ADMIN-only.
- Диспетчер при доставке читает `isEmailEnabled()/isPushEnabled()`; выкл → доставка
  остаётся PENDING (доедет при включении), не FAILED.

### 3.7. Admin web UI (apps/web)

- Новый `NotificationsSendingToggle.tsx` (зеркало `SmsSendingToggle`/`TelegramNotificationsToggle`)
  — два переключателя (Email / Push) на странице `/admin/settings`.
- RTK Query: `notificationSettingsApi` (`GET/PATCH /admin/notification-settings`).
- **Внимание:** существующие `SmsSendingToggle.tsx`/`TelegramNotificationsToggle.tsx` сейчас
  имеют незакоммиченные правки в рабочем дереве (чужой WIP) — **их не трогаем**, создаём
  отдельный компонент.

### 3.8. Client (apps/client) — минимум

- Push адресован Flutter-приложению (регистрация токена через существующий
  `POST /notifications/devices`) — web-клиенту FCM не нужен.
- Добить недостающие i18n-ключи и case `TOUR_REQUEST_STATUS_CHANGED` в
  `notificationText.ts` + `messages/{ru,uz,en}.json` (сейчас → generic fallback).

## 4. Конфиг / env (все опциональные)

```
# Firebase (push)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=            # с \n; в коде .replace(/\\n/g,'\n')

# Notification delivery
NOTIFICATIONS_EMAIL_ENABLED=true
NOTIFICATIONS_PUSH_ENABLED=true
NOTIFICATION_DISPATCH_CRON=*/1 * * * *
NOTIFICATION_DISPATCH_LOOKBACK_MIN=60
NOTIFICATION_DISPATCH_BATCH=200
NOTIFICATION_DISPATCH_CONCURRENCY=1
EMAIL_CHAT_THROTTLE_MIN=30
APP_PUBLIC_URL=https://avino.uz
```

Регистрация в `config/configuration.ts` (namespace `notifications`, дополнение `mail`/`firebase`),
опциональная валидация в `env.validation.ts`, пример в `.env.example`.

## 5. Тестирование

- `notification-templates`: рендер всех активных типов × 3 языка (subject/title непустые,
  интерполяция работает, нет «сырых» ключей).
- `notification-routing`: карта покрывает все `NotificationType`.
- `NotificationDispatcherService`: fan-out создаёт доставки по policy; идемпотентность;
  global toggle выкл → не доставляет/не FAILED; чат-email тротлинг; PUSH деактивирует
  мёртвый токен; FAILED-ретрай до MAX_ATTEMPTS.
- `FcmService`: config-gated (нет кредов → skip), парсинг мёртвых токенов (firebase-admin замокан).
- `AdminNotificationSettingsService`: get/update + аудит-лог.
- Цель: текущие 534 API-теста зелёные + новые.

## 6. Доставка/деплой

- OpenAPI: новый admin-роут → регенерировать `openapi.internal.json` (admin не в public),
  preview-mode, 4 dummy env, иначе CI drift падает.
- Миграция применяется в staging/CI (локально нет `DATABASE_URL`).
- ADR-0102 + `docs/GUIDE_FIREBASE_PUSH_SETUP.md` (как получить service account, какие env).
- DONE.md / TASKS.md — запись о фиче (finalize-in-feature-PR).
- **Прод-TODO (нужны креды, не блокирует PR):** SMTP Yandex (гайд есть) + Firebase SA.
  Live-verify реальной отправки — за владельцем после деплоя.

## 7. Явно вне scope (v1)

- Per-user настройки уведомлений (opt-out по типам) — routing-policy готова как seam,
  но UI/таблицы преференсов не делаем. Следующая итерация.
- Web push (только мобайл через FCM).
- Перенос saved-search дайджеста в новый слой (оставляем как есть, чтобы не дублировать письма).
- Presence/«слать email только если оффлайн» — для чата ограничиваемся тротлингом.

## 8. Риски и митигейции

| Риск | Митигейция |
|------|-----------|
| Спам письмами по чату | Тротлинг 30 мин на (получатель, thread); push без тротлинга (норма) |
| Нет кредов на проде | Config-gated, dev-fallback, прод-TODO; PR не блокируется |
| Прод-миграция | SQL руками + применение в staging/CI (прецедент tour_requests) |
| OpenAPI drift в CI | Регенерация internal-дока в рамках PR |
| Чужой WIP в рабочем дереве | Хирургический `git add`; новые файлы для web-тумблера |
| `firebase-admin` тяжёлая зависимость | Ленивый импорт/init только при наличии кредов |
```
