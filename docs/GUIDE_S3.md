# GUIDE_S3 — Объектное хранилище фото (Cloudflare R2)

> **Зачем этот файл.** Сейчас хранилище фото поднято на **Cloudflare R2 с личного
> аккаунта** (dev-режим). На релизе всё пересоздаётся **на аккаунте клиента**.
> Этот документ — пошаговый runbook, чтобы production-настройку сделать по
> чек-листу, а не искать всё заново.
>
> Хранилище в коде написано **провайдер-агностично** (любой S3-compatible бэкенд),
> поэтому смена аккаунта/провайдера — это **конфигурация + DNS**, без правок кода.
>
> См. также: [ENV.md §9](./ENV.md) · `deploy/prod.env.example` ·
> код: `apps/api/src/uploads/uploads.service.ts`, `apps/api/src/config/configuration.ts`.

---

## 1. Как устроено хранилище в Avino (контекст)

- Фото объявлений хранятся **только в объектном хранилище**, никогда на диске API
  (ARCHITECTURE §14, DB_SCHEMA §6). Локального persistent-стораджа нет — если
  хранилище не сконфигурировано, `UploadsService` бросает ошибку, а не пишет на FS.
- Слой загрузки — `apps/api/src/uploads/uploads.service.ts`. Он читает namespaced-
  конфиг `s3.*` и работает с любым S3-API бэкендом (AWS S3, Cloudflare R2,
  Hetzner Object Storage, DigitalOcean Spaces, MinIO).
- Текущий flow загрузки — **proxy-через-API** (`POST /api/v1/listings/:id/media`,
  `multipart/form-data`, поле `file`). Прямая загрузка браузер→хранилище
  (presigned PUT) — целевой режим на будущее (тогда понадобится CORS на бакете,
  см. §6).
- В БД `listing_media.url` хранит **полный URL** объекта (а не ключ). Для удаления
  ключ восстанавливается из URL методом `extractKey()`. Это важно для миграции
  данных (§7): при смене публичного домена URL'ы в БД надо переписать.

**Режимы доступа к файлам** (определяются конфигом):

| Условие | Поведение |
|---|---|
| `S3_PUBLIC_BASE_URL` **задан** | объекты публичны, `getObjectUrl` → прямой публичный URL (`<base>/<key>`) |
| `S3_PUBLIC_BASE_URL` **пуст** | приватный бакет, `getObjectUrl` → presigned GET URL (TTL = `S3_SIGNED_URL_TTL`) |

Для портала с фото объявлений используем **публичный режим** (быстрая отдача,
CDN-кэш, нулевой egress у R2).

---

## 2. Почему R2 (зафиксировано)

- **Нулевой egress** — главный мотив. Портал отдаёт много картинок; у AWS S3
  egress ~$0.09/GB, у R2 — **$0**. Для image-heavy нагрузки это основная статья.
- **S3-совместимый API** — миграция без правок кода.
- **Cloudflare CDN** — edge-кэш и хорошая latency для СНГ-аудитории из коробки.
- Минусы (приняты): нет паритета storage-классов (Glacier/архив), беднее
  lifecycle-правила. Для нашего кейса некритично.

---

## 3. Контракт переменных окружения (что читает код)

Имена переменных **универсальны** (`S3_*`) — они не привязаны к AWS, R2 просто
подставляется значениями. Полная таблица — в [ENV.md §9](./ENV.md).

| Переменная | Обяз. | Секрет | Значение для R2 |
|---|---|---|---|
| `S3_ENDPOINT` | да | нет | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_REGION` | да | нет | **`auto`** (у R2 нет регионов AWS; дефолт кода `us-east-1` НЕ подходит) |
| `S3_BUCKET` | да | нет | `avino-media` |
| `S3_ACCESS_KEY_ID` | да | **да** | из R2 API Token |
| `S3_SECRET_ACCESS_KEY` | да | **да** | из R2 API Token |
| `S3_FORCE_PATH_STYLE` | нет | нет | `true` (дефолт; для R2 подходит path-style) |
| `S3_PUBLIC_BASE_URL` | нет | нет | публичный домен бакета, напр. `https://media.avino.uz` |
| `S3_SIGNED_URL_TTL` | нет | нет | `3600` (используется только в приватном режиме) |
| `S3_DISABLE_ACL` | нет | нет | `true` для R2 — см. §6.2 (флаг-фоллоуап) |

> 🔒 **Секреты** (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) — только в
> `deploy/prod.env` на сервере / в менеджере паролей. **Никогда** не коммитить,
> не вставлять в чат/логи/PR. В этом файле — только плейсхолдеры.

---

## 4. Production setup на аккаунте КЛИЕНТА (пошагово)

Выполняется в Cloudflare Dashboard клиента. ~15 минут.

### 4.1 Создать R2 bucket
- Dashboard → **R2** → **Create bucket**.
- Имя: `avino-media` (должно совпадать с `S3_BUCKET`).
- Location: `Automatic` (или EU, если хотим данные ближе к Европе/СНГ).

### 4.2 Создать R2 API Token (S3-креды)
- R2 → **Manage R2 API Tokens** → **Create API token**.
- Permissions: **Object Read & Write**.
- Scope: **только bucket `avino-media`** (не account-wide — принцип наименьших прав).
- После создания сохранить (в чат/логи НЕ вставлять):
  - **Access Key ID** → `S3_ACCESS_KEY_ID`
  - **Secret Access Key** → `S3_SECRET_ACCESS_KEY`
  - **Account ID** (виден в дашборде/URL) → для `S3_ENDPOINT`
- Endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

### 4.3 Публичный доступ через свой домен (production)
> Production-режим: фото отдаются через Cloudflare edge → zero-egress + CDN-кэш.

- R2 → bucket `avino-media` → **Settings** → **Public access** → **Connect Domain**.
- Ввести поддомен, напр. `media.avino.uz` (или `cdn.avino.uz`).
- Условие: зона `avino.uz` управляется в Cloudflare DNS клиента — Cloudflare сам
  поднимет CNAME и включит кэш.
- Этот домен идёт в `S3_PUBLIC_BASE_URL=https://media.avino.uz`.

**Альтернатива для быстрого старта / стейджинга** — встроенный **r2.dev** URL
(`Public Development URL` в настройках бакета → `https://pub-xxxx.r2.dev`).
⚠️ Rate-limited, **не для прод-нагрузки** — только dev/staging.

### 4.4 Заполнить `deploy/prod.env` на сервере
```dotenv
# ── Cloudflare R2 (объектное хранилище фото) ──
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=avino-media
S3_ACCESS_KEY_ID=<из 4.2>
S3_SECRET_ACCESS_KEY=<из 4.2>
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_BASE_URL=https://media.avino.uz   # из 4.3
S3_DISABLE_ACL=true                          # см. §6.2
```

### 4.5 Передеплоить API
- Перезапустить контейнер API, чтобы подхватил новый env
  (`UploadsService` лениво инициализирует клиент при первом обращении).
- В логах старта появится строка `S3 client initialized (endpoint=..., public=true)`.

---

## 5. Приёмка (smoke-тест после деплоя)

**5.0 Быстрая проверка connectivity (без Docker/БД/логина).**
Перед полным прогоном удобно проверить, что endpoint + креды + бакет вообще
работают, изолированно от приложения. Скрипт `apps/api/r2-smoke.cjs` читает
корневой `.env`, повторяет путь `UploadsService` и делает PUT → GET →
presigned GET → DELETE одного тестового объекта (секреты не печатает):

```bash
node apps/api/r2-smoke.cjs
# ожидаемо: ✅ PUT ok / ✅ GET ok / ✅ presigned GET → HTTP 200 / ✅ DELETE ok
```

Зелёный прогон = R2 настроен верно; красный — см. §11. Полезно прогнать его и
**на аккаунте клиента** перед релизом.

**5.1 Полный прогон через приложение:**

1. **Upload** — `POST /api/v1/listings/:id/media` (multipart, поле `file`,
   Bearer владельца/ADMIN). Должен вернуть `201` с `url`, начинающимся на
   `https://media.avino.uz/...`.
2. **Отдача** — открыть этот `url` в браузере → картинка грузится (публичный
   доступ работает).
3. **Delete** — `DELETE /api/v1/listings/:id/media/:mediaId` → `204`, объект
   пропал из R2 (значит `extractKey()` корректно разобрал публичный URL).
4. **Billing/метрики** — в R2-аналитике растёт хранение/класс-операции,
   **egress остаётся $0**.

Если что-то из 1–3 падает — см. §6.

---

## 6. R2-специфика и подводные камни

> ⚠️ **Самый частый затык — endpoint и юрисдикция бакета.** R2 отдаёт **разные
> S3-endpoint'ы** в зависимости от того, где создан бакет:
> - дефолтная локация (Automatic): `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
> - EU-юрисдикция: `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`
>
> Бакет из дефолтной локации **недоступен через `.eu.`-endpoint** (и наоборот) —
> операции возвращают `NoSuchBucket`, **хотя бакет реально существует**. Всегда
> бери endpoint из настроек **самого бакета** (R2 → bucket → *Settings → S3 API*),
> не из чужого примера. Если ловишь `NoSuchBucket` при существующем бакете —
> первым делом проверь сегмент `.eu.` (его наличие/отсутствие) в `S3_ENDPOINT`.
> _(Именно на это напоролись в dev: стоял `.eu.`, бакет был в default → `NoSuchBucket`.)_

> ⚠️ **Точные имена ключей в `.env`.** Код читает строго `S3_ENDPOINT` и
> `S3_BUCKET`. Имена вроде `S3_ENDPOINT_URL` / `S3_BUCKET_NAME` (из других
> шаблонов) код **молча игнорирует** — будет пустой endpoint (уход на AWS вместо
> R2) или неверный бакет. Сверяйся с таблицей §3.

### 6.1 `S3_REGION=auto`
У R2 нет AWS-регионов. Дефолт кода — `us-east-1`; **обязательно** переопределить
на `auto`, иначе SDK может ругаться на регион при подписи.

### 6.2 R2 не поддерживает per-object ACL
Публичность в R2 задаётся **на уровне бакета** (custom domain / r2.dev), а не
ACL-заголовком на объекте. Текущий код в публичном режиме шлёт
`ACL: 'public-read'` (`uploads.service.ts`). R2 этот заголовок **игнорирует**
(public-доступ всё равно даёт бакет), поэтому загрузка работает и без правок.

**Рекомендуемый фоллоуап (чище):** добавить флаг `S3_DISABLE_ACL=true`, чтобы
для R2 ACL-заголовок не отправлялся вовсе. План правки:
- `uploads.service.ts` — `ACL: this.isPublic() && !this.disableAcl() ? 'public-read' : undefined`;
- `configuration.ts` (`s3Config`) — `disableAcl: process.env.S3_DISABLE_ACL === 'true'`;
- `env.validation.ts` — опциональное `S3_DISABLE_ACL?`;
- тест в `uploads.service.spec.ts` — публичный режим + флаг ⇒ PutObject без ACL.

> Если при загрузке появится ошибка `NotImplemented`/ACL — значит провайдер
> отвергает заголовок: внедрить этот флаг и выставить `S3_DISABLE_ACL=true`.

### 6.3 Path-style
`S3_FORCE_PATH_STYLE=true` (дефолт) подходит для R2:
`https://<acct>.r2.cloudflarestorage.com/<bucket>/<key>`.

### 6.4 CORS (понадобится только для presigned PUT)
Пока загрузка идёт прокси-через-API — CORS на бакете **не нужен**, отдача через
`<img>` тоже не требует CORS. Когда перейдём на прямую загрузку браузер→R2
(presigned PUT), добавить CORS-политику на бакет (R2 → bucket → Settings → CORS)
с origin'ами клиента/админки и методами `PUT, GET`.

### 6.5 r2.dev — только не-прод
`pub-xxxx.r2.dev` rate-limited; для прод-нагрузки всегда custom domain (§4.3).

---

## 7. Перенос данных dev → prod (если нужно)

Обычно **production стартует с чистого бакета** — переносить нечего, раздел
пропускается. Перенос нужен, только если в dev-бакете уже есть фото, которые
должны попасть на прод (как правило — нет).

`listing_media.url` хранит **полный URL**, поэтому миграция = копирование объектов
+ переписывание URL в БД:

1. **Скопировать объекты** через `rclone` (оба бакета как S3-remote):
   ```bash
   rclone copy dev-r2:avino-media prod-r2:avino-media --progress
   ```
2. **Переписать URL в БД** (старый публичный домен → новый):
   ```sql
   UPDATE listing_media
   SET url = REPLACE(url, 'https://<старый_public_base>', 'https://media.avino.uz')
   WHERE url LIKE 'https://<старый_public_base>%';
   ```
3. Проверить отдачу/удаление на новых URL (`getObjectUrl` / `extractKey`).

---

## 8. Откат / смена провайдера

Хранилище провайдер-агностично — откат или переезд на другой S3-бэкенд
(Hetzner Object Storage, DO Spaces, MinIO, нативный AWS S3) делается **только
через env**, без правок кода:
- сменить `S3_ENDPOINT` / `S3_REGION` / креды / `S3_PUBLIC_BASE_URL`;
- для нативного AWS S3 (virtual-hosted-style) выставить `S3_FORCE_PATH_STYLE=false`
  и `S3_DISABLE_ACL` не нужен (AWS поддерживает ACL);
- передеплоить API.

---

## 9. Ответственность и владение (на релизе)

- **Аккаунт Cloudflare и оплата R2** — на стороне **клиента** (его аккаунт, его
  биллинг).
- **API Token** создаётся в аккаунте клиента, scope — только bucket `avino-media`.
  При передаче проекта токен ротируется, старый dev-токен (с твоего аккаунта)
  **отзывается**.
- Секреты живут в `deploy/prod.env` на сервере клиента + в его менеджере паролей.
  В репозиторий не попадают.

---

## 10. Чек-лист релиза (copy-paste)

```text
[ ] R2 bucket `avino-media` создан на аккаунте КЛИЕНТА
[ ] R2 API Token создан, scope = только bucket, права Read & Write
[ ] Access Key ID / Secret / Account ID сохранены в менеджер паролей
[ ] Custom domain (media.avino.uz) подключён к бакету, DNS в Cloudflare клиента
[ ] deploy/prod.env заполнен: ENDPOINT, REGION=auto, BUCKET, KEY, SECRET,
    FORCE_PATH_STYLE=true, PUBLIC_BASE_URL, DISABLE_ACL=true
[ ] API передеплоен, в логах "S3 client initialized (... public=true)"
[ ] Smoke: upload → 201 + url на media.avino.uz
[ ] Smoke: url открывается в браузере (публичная отдача)
[ ] Smoke: delete → 204, объект исчез из R2
[ ] (если был перенос) объекты скопированы + URL в listing_media переписаны
[ ] dev-токен с личного аккаунта отозван
[ ] R2-метрики: egress = $0
```

---

## 11. Troubleshooting

| Симптом | Причина | Что делать |
|---|---|---|
| `NoSuchBucket` (а бакет есть) | endpoint не той юрисдикции (`.eu.` vs default) | взять endpoint из *bucket → Settings → S3 API*, см. §6 |
| `NoSuchBucket` (бакета нет) | `S3_BUCKET` не совпадает с именем в R2 | сверить точное имя бакета в дашборде |
| Льётся на AWS, не на R2 | `S3_ENDPOINT` пустой (значение под `S3_ENDPOINT_URL`) | проставить именно `S3_ENDPOINT`, см. §3, §6 |
| `AccessDenied` на `ListBuckets` | токен scoped на один бакет (норма) | это ожидаемо; PUT/GET по бакету работают |
| `SignatureDoesNotMatch` / `InvalidAccessKeyId` | неверные/перепутанные креды | пересоздать R2 API Token, обновить `S3_ACCESS_KEY_ID/SECRET` |
| `NotImplemented` / ACL-ошибка на upload | провайдер отвергает `public-read` ACL | внедрить флаг `S3_DISABLE_ACL=true`, см. §6.2 |
| Публичный URL отдаёт 401/403 | бакет не публичный / нет custom domain | включить public access (r2.dev) или подключить домен, §4.3 |

---

_Связанные документы: [ENV.md §9](./ENV.md) · `deploy/prod.env.example` ·
будущий ADR о выборе R2 (следующий свободный номер, ≈ADR-0082) ·
код хранилища: `apps/api/src/uploads/uploads.service.ts`._
