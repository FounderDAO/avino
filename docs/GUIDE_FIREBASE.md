У нас уже есть docs/GUIDE_FIREBASE_PUSH_SETUP.md, но там §2 кратко. Даю точный пошаговый гайд по получению ключей, привязанный к нашим реальным env-переменным. Разделил на «для бэкенда» (это твоё) и «для мобильной команды».

---
Как получить ключи из Firebase — точный порядок

Предусловие: создать проект (один раз)

1. Открыть https://console.firebase.google.com/ под нужным Google-аккаунтом (прод — аккаунт клиента, стенд — dev-аккаунт).
2. Add project → имя (напр. avino) → Continue. Google Analytics можно выключить (не нужен для push) → Create project.

---
A. Ключи для БЭКЕНДА (наши 3 env-переменные) — главное

Это Service Account, которым FcmService шлёт push.

1. В консоли проекта: шестерёнка вверху слева ⚙️ → Project settings.
2. Вкладка Service accounts.
3. Кнопка Generate new private key → в диалоге Generate key → скачается JSON-файл (напр. avino-firebase-adminsdk-xxxxx.json).
  - ⚠️ Это секрет. Не коммитить, никому не пересылать в чат.
4. Открыть JSON, взять ровно три поля → в env бэкенда:

┌────────────────┬───────────────────────┐
│  поле в JSON   │    env-переменная     │
├────────────────┼───────────────────────┤
│ "project_id"   │ FIREBASE_PROJECT_ID   │
├────────────────┼───────────────────────┤
│ "client_email" │ FIREBASE_CLIENT_EMAIL │
├────────────────┼───────────────────────┤
│ "private_key"  │ FIREBASE_PRIVATE_KEY  │
└────────────────┴───────────────────────┘

5. В .env (prod/staging) вставить так:
FIREBASE_PROJECT_ID=avino-xxxxx
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@avino-xxxxx.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"

⚠️ Про FIREBASE_PRIVATE_KEY — самый частый косяк:
- Копировать значение как есть из JSON, одной строкой — с литеральными \n (не разворачивать в настоящие переводы строк). Наш код (configuration.ts:328) сам делает .replace(/\\n/g, '\n').
- Обернуть в двойные кавычки — внутри есть \n и =.
- В docker-compose/секрет-хранилище проследить, чтобы кавычки/\n не «съелись».

Проверка, что подхватилось: после деплоя при реальной отправке в логах API не должно быть [DEV PUSH → ...] (эта строка = креды не увиделись, isConfigured()=false).

Это всё, что нужно бэкенду. Пунктов B/C касается только мобильная команда.

---
B. Android-приложение (для мобильной команды)

1. Project settings → General → Your apps → иконка Android.
2. Ввести Android package name (напр. uz.avino.app — уточнить у Flutter-разработчика), ник опционально → Register app.
3. Скачать google-services.json → кладётся в Flutter-проект (android/app/).
4. Дальнейшие шаги SDK можно пропустить (Flutter делает через flutterfire).

Android push заработает сразу после этого (FCM для Android не требует доп. ключей).

---
C. iOS-приложение + APNs (для мобильной команды — без этого iOS-push не идёт)

C.1. Зарегистрировать iOS-app в Firebase
1. Project settings → General → Your apps → иконка Apple/iOS.
2. Ввести Apple bundle ID (напр. uz.avino.app) → Register app → скачать GoogleService-Info.plist (в ios/Runner/).

C.2. Создать APNs Auth Key (в Apple Developer)
1. https://developer.apple.com/account → Certificates, Identifiers & Profiles → Keys → ＋.
2. Имя ключа, отметить галку Apple Push Notifications service (APNs) → Continue → Register.
3. Download → файл AuthKey_XXXXXXXXXX.p8 (⚠️ скачивается один раз, сохранить надёжно).
4. Записать рядом: Key ID (10 симв., в имени файла) и Team ID (правый верх аккаунта Apple Developer / Membership).

C.3. Загрузить APNs-ключ в Firebase
1. Project settings → Cloud Messaging → блок Apple app configuration.
2. APNs Authentication Key → Upload → выбрать .p8, ввести Key ID и Team ID → Upload.

После C.3 iOS-push маршрутизируется через FCM.

---
Чек-лист «ключи получены»

- [ ] Бэкенд: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY в prod-env (из service-account JSON).
- [ ] Android: google-services.json у Flutter-команды.
- [ ] iOS: GoogleService-Info.plist + APNs .p8 загружен в Firebase (Key ID + Team ID).
- [ ] Тумблер NOTIFICATIONS_PUSH_ENABLED=true (или админка /admin/settings).
- [ ] Live-verify по §4 существующего docs/GUIDE_FIREBASE_PUSH_SETUP.md.

---
