# GUIDE — Firebase Cloud Messaging (push для мобильного приложения)

Push-уведомления Avino (Android/iOS Flutter-приложение) доставляются через
**Firebase Cloud Messaging (FCM)**. Backend отправляет их `firebase-admin` SDK
(`FcmService`), используя service-account кредами. Без кредов push **config-gated**:
в dev логируется, в prod молча пропускается — приложение и API работают как обычно.

См. также: [[ADR-0102]] (слой доставки), `docs/GUIDE_YANDEX_SMTP_SETUP.md` (email-канал).

## 1. Что хранится и как работает

- Мобильное приложение при логине регистрирует токен устройства:
  `POST /api/v1/notifications/devices` `{ platform: ANDROID|IOS|WEB, pushToken }`.
  Токен пишется в `notification_devices` (upsert по `push_token`, `is_active=true`,
  `last_seen_at`). При выходе — `DELETE /api/v1/notifications/devices/:id`.
- Диспетчер (`NotificationDispatcherService`, ADR-0102) на активные токены получателя
  шлёт FCM-сообщение `{ notification:{title,body}, data:{type,notificationId,…} }`
  на языке пользователя.
- Мёртвые токены (FCM `registration-token-not-registered` /
  `invalid-registration-token`) автоматически деактивируются (`is_active=false`).

## 2. Получение service-account кредов (Firebase Console)

1. Создать/открыть проект в [Firebase Console](https://console.firebase.google.com/)
   (для прод — на аккаунте клиента; для стенда — на dev-аккаунте).
2. Подключить приложения: **Project settings → Your apps** → добавить Android
   (`google-services.json`) и iOS (`GoogleService-Info.plist`, + APNs-ключ в
   **Cloud Messaging**). Это делает мобильная команда (Flutter).
3. **Project settings → Service accounts → Generate new private key** → скачать JSON.
   Из него берём три значения для backend:
   - `project_id`   → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key`  → `FIREBASE_PRIVATE_KEY`

## 3. Backend env (prod / staging)

```
FIREBASE_PROJECT_ID=avino-xxxx
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@avino-xxxx.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
```

ВАЖНО про `FIREBASE_PRIVATE_KEY`:
- В `.env` ключ хранится **одной строкой** с литеральными `\n` (как в JSON).
  Код сам делает `.replace(/\\n/g, '\n')` перед передачей в `cert()`.
- В docker-compose/секрет-хранилище беречь кавычки — значение содержит `\n` и `=`.
- Это секрет — не коммитить, не логировать.

Глобальные тумблеры (дефолт ВКЛ), при необходимости выключить канал без пересборки —
через админку `/admin/settings` (или env):
```
NOTIFICATIONS_PUSH_ENABLED=true
NOTIFICATIONS_EMAIL_ENABLED=true
```

Параметры диспетчера (опционально, дефолты разумные):
```
NOTIFICATION_DISPATCH_CRON=*/1 * * * *     # как часто сметать (раз в минуту)
NOTIFICATION_DISPATCH_LOOKBACK_MIN=60      # окно fan-out
NOTIFICATION_DISPATCH_BATCH=200            # доставок за прогон
NOTIFICATION_DISPATCH_CONCURRENCY=1
EMAIL_CHAT_THROTTLE_MIN=30                 # не чаще 1 email/тред за N мин
APP_PUBLIC_URL=https://avino.uz            # база для CTA-ссылок в письмах
```

## 4. Live-verify (после деплоя)

1. Залогиниться в мобильном приложении → проверить, что устройство зарегистрировано:
   строка в `notification_devices` с `is_active=true`.
2. Спровоцировать уведомление (написать в чат по объявлению / запросить тур).
3. В логах API: диспетчер обработал PUSH-доставку (`status=SENT`); в
   `notification_deliveries` — строка `channel=PUSH, status=SENT, sent_at`.
4. Приложение получило push на языке пользователя.
5. Диагностика: нет кредов → в логах `[DEV PUSH → …]` (dev) или тихий skip (prod);
   неверный токен → `status=FAILED` и `is_active=false` у устройства.

## 5. Прод-TODO (чек-лист запуска push)

- [ ] Firebase-проект клиента + Android/iOS apps + APNs-ключ (мобильная команда).
- [ ] Service-account JSON → `FIREBASE_*` env в backend-деплое.
- [ ] `NOTIFICATIONS_PUSH_ENABLED=true` (или тумблер в админке).
- [ ] Применить миграцию `20260622000000_notification_deliveries` (staging/CI).
- [ ] Live-verify по §4.
