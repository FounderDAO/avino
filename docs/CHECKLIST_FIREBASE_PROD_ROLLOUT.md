# CHECKLIST — выкатка Firebase push-ключа на прод

Пошаговый чеклист для запуска FCM push на проде: перенести service-account креды,
прописать в окружение, пересоздать api-контейнер, проверить доставку.

Контекст: `FcmService` (ADR-0102) шлёт push через `firebase-admin`, читая **3 env-переменные
в рантайме** (`configuration.ts`). Без них push config-gated (тихо пропускается).
Подробнее: [[GUIDE_FIREBASE_PUSH_SETUP]]. Про то, почему **не** build-args, — см. ниже §6.

---

## 0. Предусловия

- [ ] На руках service-account JSON из Firebase Console
      (Project settings → Service accounts → Generate new private key).
- [ ] Доступ по SSH на прод-сервер; известно, где лежит корневой `.env` монорепо
      (тот же файл, где `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`).
- [ ] Каноническая копия всех прод-секретов — в командном хранилище (1Password / Doppler),
      серверный `.env` — производная копия (не единственная).

## 1. Перенести ключ на сервер (секрет не через чат/логи)

Вариант А — скопировать JSON и извлечь на сервере:
```bash
scp "avino-…-firebase-adminsdk-….json" deploy@SERVER:/srv/avino/secret-fb.json
ssh deploy@SERVER
# на сервере: вытащить 3 поля (private_key одной строкой с литеральными \n)
node -e 'const j=require("/srv/avino/secret-fb.json");
  console.log("FIREBASE_PROJECT_ID="+j.project_id);
  console.log("FIREBASE_CLIENT_EMAIL="+j.client_email);
  console.log("FIREBASE_PRIVATE_KEY=\""+j.private_key.replace(/\n/g,"\\n")+"\"");'
```
Вариант Б — просто вставить готовые 3 строки в серверный `.env` через `ssh`-редактор.

## 2. Прописать в корневой `.env` на сервере

- [ ] Добавить в корневой `.env` (НЕ в `apps/api/.env` — docker его не читает, только
      корневой через `env_file: - .env`):
```
FIREBASE_PROJECT_ID=avino-xxxxx
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@avino-xxxxx.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"
```
- [ ] `private_key` — **одной строкой, литеральные `\n`, в двойных кавычках**
      (dotenv развернёт `\n`; `configuration.ts` идемпотентен).
- [ ] Права на файл: `chmod 600 .env`, владелец — деплой-юзер.
- [ ] Убедиться, что `.env` НЕ в git (в репозитории уже `.gitignore`; JSON-ключи —
      `deploy/*firebase-adminsdk*.json`).
- [ ] Если ключ временно клали в `secret-fb.json` — удалить: `rm /srv/avino/secret-fb.json`.

## 3. Включить push-канал

- [ ] `NOTIFICATIONS_PUSH_ENABLED=true` — дефолт ВКЛ; проверить, что не выключен
      в `.env` и в админке `/admin/settings`.

## 4. Пересоздать api-контейнер (важно!)

⚠️ `docker compose restart` **НЕ перечитывает** `env_file` — новые переменные не подхватятся.
Нужно **пере-создать** контейнер:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app \
  up -d --force-recreate api
```
- [ ] Контейнер `avino-api` поднялся, healthcheck зелёный (`docker ps` → healthy).

## 5. Verify

- [ ] Health: `curl -fsS https://<DOMAIN_API>/api/v1/health` → `200`.
- [ ] Логи api при реальной отправке **не** содержат `[DEV PUSH → …]`
      (эта строка = `isConfigured()=false`, креды не увиделись).
- [ ] Спровоцировать уведомление (написать в чат по объявлению / запросить тур на
      объявление с активным устройством).
- [ ] В БД `notification_deliveries` — строка `channel=PUSH, status=SENT, sent_at IS NOT NULL`.
- [ ] Приложение получило push. Неверный токен → `status=FAILED` и `is_active=false`
      у устройства (ожидаемо, авто-деактивация).

## 6. Почему НЕ через build-args

`FIREBASE_*` — backend-секреты, читаются рантаймом (`ConfigService`). Их НЕ передают
через `build.args`:
- не нужно (NestJS берёт из окружения при старте, не при сборке);
- вредно — build-args оседают в слоях/истории Docker-образа → утечка секрета.

Build-args в этом проекте — **только** для Next.js `NEXT_PUBLIC_*` (`web`/`client`),
которые запекаются в браузерный бандл на `next build`.

## 7. Ротация / инциденты

- [ ] При утечке: Firebase Console → Service accounts → сгенерировать новый ключ,
      старый **отозвать (revoke)**; обновить `.env` (§2) и пере-создать контейнер (§4).
- [ ] Firebase-ключ всегда можно перевыпустить из консоли; бэкапить критично весь
      серверный `.env` целиком (JWT/DB-пароли перевыпуском не вернёшь).

## Связанное

- [[GUIDE_FIREBASE_PUSH_SETUP]] — получение ключей (Android/iOS/APNs) и полный контекст.
- iOS: без APNs-ключа, загруженного в Firebase (Cloud Messaging → Apple app config),
  iOS-push не пойдёт — см. GUIDE §C.
