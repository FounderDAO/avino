# API.md — Avino REST API (v1)

> Контракт REST API портала недвижимости **Avino** (Узбекистан).
> Документ согласован с `ARCHITECTURE.md` (ADR-001…013, §28) и `DB_SCHEMA.md`.
> При конфликте с кодом — этот документ и `ARCHITECTURE.md`/`DB_SCHEMA.md` выигрывают.
> Breaking changes требуют новой версии API (`/api/v2`) и одобрения Team Lead.

---

## 1. Purpose & scope

Этот документ — контракт публичного и приватного REST API Avino версии **v1**.

В scope:
- Все HTTP-эндпоинты MVP: auth, профили, роли/админ, listings, медиа, поиск,
  гео-поиск, избранное, сохранённые поиски, чат, уведомления, промо, модерация.
- Единые соглашения: версионирование, заголовки, пагинация, сортировка,
  фильтрация, формат ошибок, коды статусов.
- Требования client-neutral: один и тот же контракт обслуживает web (RTK Query)
  и будущее Flutter-приложение.

Не в scope:
- Backend-код (controllers/services/DTO) — генерируется позже из этого контракта.
- Online payments (Phase 1.5, после подтверждения провайдера — `ARCHITECTURE` §10/§26).
- WebSocket-транспорт чата (MVP — polling; добавляется без изменения контракта).

**Источник имён и enum'ов.** Имена полей и значения enum берутся строго из
`DB_SCHEMA.md`. JSON-ключи в запросах/ответах используют **snake_case**
(совпадает с именами колонок БД и фиксированными именами `initiator_id` /
`owner_id`). Значения enum — **UPPERCASE** (`SALE`, `ACTIVE`, `VIP`, `UZ` и т.д.).

---

## 2. Base URL, versioning & headers

### Base URL

```text
Production:  https://www.avino.uz/api/v1
```

Все маршруты идут через глобальный префикс `api` + версию `v1` (URI versioning,
`ARCHITECTURE` §5):

```text
/api/v1/<resource>
```

**Unversioned routes запрещены.** `v2` не создаётся, пока нет реального breaking
change. В MVP реализуется только `v1`.

### Headers

| Header | Применение | Пример |
|---|---|---|
| `Authorization` | `Bearer <access_token>` на всех защищённых эндпоинтах | `Authorization: Bearer eyJ...` |
| `Accept-Language` | Желаемый язык ответа: `uz` / `ru` / `en` | `Accept-Language: ru` |
| `Content-Type` | `application/json` для JSON-тел; `multipart/form-data` для proxy-загрузки файла | `application/json` |
| `Idempotency-Key` | Идемпотентность для retriable POST (промо-активация, callbacks) — ADR-006/§24 | `Idempotency-Key: 8f3a...` |
| `X-Request-Id` | Опционально; если не задан — генерируется сервером и возвращается в ошибках | `X-Request-Id: req_abc` |

**Язык ответа (ADR-005/012).** Язык определяется по `Accept-Language`; можно
переопределить query-параметром `?lang=uz|ru|en`. Маппинг на enum `language`:
`uz→UZ`, `ru→RU`, `en→EN`. Для листингов отдаётся перевод запрошенного языка из
`listing_translations`; при отсутствии — фолбэк на `original_language`. Если язык
не распознан — используется `default_language` пользователя или `RU`.

---

## 3. Authentication & tokens

Авторизация — **JWT Bearer**. Логин — **passwordless OTP** по SMS (Eskiz.uz) или
email (`ARCHITECTURE` §6). Пароля в MVP нет (`DB_SCHEMA` §4).

Токены:
- **access** — короткоживущий JWT (Bearer на каждом запросе);
- **refresh** — долгоживущий, хранится **хэшированным**, ротация при каждом
  использовании; повторное использование ротированного токена отзывает всю
  session family (`DB_SCHEMA` §4 `refresh_tokens`, §24 п.2).

OTP-коды хранятся хэшированными, с истечением и лимитом попыток; request и verify
rate-limited (per destination + per IP) — `DB_SCHEMA` §4 / §15.

Flow: `request → verify (выдаёт access+refresh) → refresh → logout`.

### POST /api/v1/auth/otp/request

Запросить OTP. Auth: **public (GUEST)**.

Body:
```json
{ "channel": "SMS", "destination": "+998901234567" }
```
`channel`: `SMS | EMAIL` (enum `otp_channel`). `destination` — телефон (E.164) для
SMS или email для EMAIL.

200:
```json
{ "request_id": "otp_8f3a", "channel": "SMS", "expires_in": 120, "resend_after": 60 }
```
Errors: `400 VALIDATION_ERROR`, `429 RATE_LIMITED`.

### POST /api/v1/auth/otp/verify

Подтвердить OTP, создать/обновить пользователя, выдать токены. Auth: **public**.

Body:
```json
{ "channel": "SMS", "destination": "+998901234567", "code": "123456" }
```

200:
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": { "id": "u1", "phone": "+998901234567", "email": null,
            "default_language": "RU", "status": "ACTIVE", "roles": ["USER"],
            "is_phone_verified": true }
}
```
Errors: `400 OTP_INVALID`, `400 OTP_EXPIRED`, `429 OTP_ATTEMPTS_EXCEEDED`, `403 USER_BLOCKED`.

### POST /api/v1/auth/google

Вход через Google: верифицирует Google ID-token, создаёт/обновляет пользователя
(связывание по верифицированному email, login=signup), выдаёт токены. Тело
ответа идентично `otp/verify`. Auth: **public** (TASK-195, ADR-0065).

Body:
```json
{ "id_token": "eyJ... (Google ID-token из GIS)" }
```

200: тот же контракт, что `otp/verify` (`access_token`, `refresh_token`,
`token_type`, `expires_in`, `user`). Аккаунт создаётся с ролью `USER`,
`is_email_verified: true`.

Errors: `401 UNAUTHORIZED` (невалидный токен или `email_verified=false`),
`403 USER_BLOCKED`, `503 AUTH_PROVIDER_UNAVAILABLE` (не задан `GOOGLE_CLIENT_ID`).

### POST /api/v1/auth/refresh

Ротация refresh-токена. Auth: **valid refresh token** (в теле).

Body: `{ "refresh_token": "eyJ..." }`

200:
```json
{ "access_token": "eyJ...", "refresh_token": "eyJ...", "token_type": "Bearer", "expires_in": 900 }
```
Errors: `401 TOKEN_INVALID`, `401 TOKEN_REUSED` (отзыв всей family), `401 TOKEN_EXPIRED`.

### POST /api/v1/auth/logout

Отозвать текущий refresh (session family). Auth: **Bearer**.

Body: `{ "refresh_token": "eyJ..." }` → 204 No Content.

### GET /api/v1/auth/me

Текущий пользователь + профиль + роли. Auth: **Bearer**.

200:
```json
{
  "id": "u1", "phone": "+998901234567", "email": null,
  "status": "ACTIVE", "default_language": "RU",
  "is_phone_verified": true, "is_email_verified": false,
  "roles": ["USER", "AGENT"],
  "profile": { "first_name": "Ali", "last_name": "Valiev",
               "display_name": "Ali V.", "avatar_url": null,
               "contact_phone": "+998901234567", "preferred_language": "RU" }
}
```
Errors: `401 UNAUTHORIZED`.

---

## 4. Common conventions

### Pagination

Единый envelope для коллекций:
```json
{ "data": [ /* items */ ], "meta": { "limit": 20, "total": 134, "next_cursor": "eyJpZCI6..." } }
```

Параметры:
- `limit` — размер страницы (default `20`, max `100`).
- **Keyset (cursor) — основной режим** для поиска/листингов (`ARCHITECTURE` §12,
  ADR-007): `cursor` = непрозрачный токен последней позиции; ответ возвращает
  `next_cursor` (или `null`, если страниц больше нет). Keyset предпочтителен над
  OFFSET для глубоких выборок.
- Для простых справочных/админ-списков допускается `page` (1-based) + `limit`;
  тогда `meta.total` обязателен. Envelope тот же.

### Sorting

Параметр `sort` (значения — `ARCHITECTURE` §12):
```text
promotion_priority_desc   (default для публичного поиска/листингов)
price_asc | price_desc
date_desc
area_asc | area_desc
```

**Детерминированный ключ сортировки по умолчанию** (ADR-006/007, `DB_SCHEMA` §8):
```text
(effective_promotion_tier DESC, created_at DESC, id DESC)
```
где `effective_promotion_tier` — time-guarded: листинг считается `VIP`/`TOP`
только пока `promotion_expires_at > now()`, иначе трактуется как `NORMAL`.
Хвостовой `id` гарантирует стабильный total order для keyset-пагинации.

### Filtering

Фильтры передаются query-параметрами (см. §9). Неизвестные параметры
игнорируются (forward-compatible). Диапазоны: `price_min`/`price_max`,
`area_min`/`area_max`. Price-range применяется **в пределах одной валюты**
(`currency`); FX-конвертации нет (`ARCHITECTURE` §8/§12).

### Error format

Единый формат ошибки на всех эндпоинтах:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "price_min must be a positive number",
    "details": [ { "field": "price_min", "issue": "must be >= 0" } ],
    "request_id": "req_abc123"
  }
}
```
- `code` — стабильный машинно-читаемый код (каталог — §17).
- `message` — человекочитаемое описание (язык по `Accept-Language`).
- `details` — опционально, пер-полевые ошибки валидации.
- `request_id` — коррелирует с логами.

### HTTP status codes

| Код | Значение |
|---|---|
| `200` | OK |
| `201` | Created |
| `204` | No Content (logout, delete) |
| `400` | Validation / bad request |
| `401` | Unauthorized (нет/невалиден токен) |
| `403` | Forbidden (роль/право не позволяет — RBAC, ADR-011) |
| `404` | Not Found |
| `409` | Conflict (дубликат: favorite, chat thread, активная промо) |
| `413` | Payload Too Large (загрузка медиа) |
| `415` | Unsupported Media Type (MIME вне allow-list) |
| `422` | Unprocessable (валидное тело, но бизнес-правило нарушено) |
| `429` | Rate limited (OTP, общий throttle) |
| `500` | Internal error |

---

## 5. Users & profile

### GET /api/v1/users/me
Алиас `auth/me`. Auth: **Bearer**.

### PATCH /api/v1/users/me
Обновить базовые поля пользователя. Auth: **Bearer**.

Body (любое подмножество):
```json
{ "email": "ali@mail.uz", "default_language": "UZ" }
```
- Смена `email`/`phone` инициирует verify-flow (OTP), поэтому `is_email_verified`
  сбрасывается до подтверждения. Уникальность контакта — только среди
  non-DELETED аккаунтов (ADR-013).
200 → объект пользователя. Errors: `400 VALIDATION_ERROR`, `409 CONTACT_TAKEN`.

### PATCH /api/v1/users/me/profile
Обновить профиль (`user_profiles`). Auth: **Bearer**.

Body:
```json
{ "first_name": "Ali", "last_name": "Valiev", "display_name": "Ali V.",
  "avatar_url": "https://cdn.avino.uz/a/u1.webp", "contact_phone": "+998901112233",
  "preferred_language": "RU" }
```
200 → объект профиля.

### DELETE /api/v1/users/me
Soft-delete собственного аккаунта (ADR-013): `status → DELETED`, `deleted_at`
устанавливается; строка сохраняется (referential history), контакт освобождается
для повторной регистрации. Auth: **Bearer**. → `204`.

---

## 6. Roles & admin user management

RBAC — guard на базе матрицы прав (role → действия), ADR-011. `GUEST` нигде не
хранится. Роли: `USER | OWNER | AGENT | AGENCY | LANDLORD | PROPERTY_MANAGER |
MODERATOR | ADMIN` (`DB_SCHEMA` §3).

### GET /api/v1/admin/users
Список пользователей. Auth: **ADMIN**. Query: `status`, `role`, `q` (поиск по
контакту/имени), `page`, `limit`.

200 → пагинированный список пользователей (с `roles`, `status`).

### GET /api/v1/admin/users/:id
Карточка пользователя. Auth: **ADMIN**.

### PATCH /api/v1/admin/users/:id
Сменить `status` (`ACTIVE | BLOCKED | DELETED`). Auth: **ADMIN**. Действие пишется
в `audit_logs` (`ADMIN_USER_UPDATE`, ADR-004).
```json
{ "status": "BLOCKED", "reason": "spam" }
```

### POST /api/v1/admin/users/:id/roles
Назначить роль. Auth: **ADMIN**. `audit_logs(ROLE_CHANGE)`.
```json
{ "role": "AGENT" }
```
201 → обновлённый список ролей. Errors: `409 ROLE_ALREADY_GRANTED`.

### DELETE /api/v1/admin/users/:id/roles/:role
Снять роль. Auth: **ADMIN**. → `204`. `audit_logs(ROLE_CHANGE)`.

### GET /api/v1/roles
Справочник ролей (seeded dictionary, без `GUEST`). Auth: **ADMIN/MODERATOR**.

---

## 7. Listings (CRUD + lifecycle)

Листинг — ядро системы. Текст создаётся на одном языке (`original_language`),
переводы генерируются **после** перехода в `ACTIVE` (ADR-005). Все листинги
проходят moderation queue: создание → `NEW` (`ARCHITECTURE` §9, `DB_SCHEMA` §6).

Статусы (`listing_status`): `NEW | ACTIVE | DRAFT | REJECTED | DELETED | ARCHIVED
| SOLD | RENTED`.

### POST /api/v1/listings
Создать листинг (статус `NEW`). Auth: `USER`-уровень с правом создания
(`OWNER | AGENT | AGENCY | LANDLORD | PROPERTY_MANAGER`).

Body:
```json
{
  "transaction_type": "RENT",
  "property_type": "APARTMENT",
  "original_language": "RU",
  "price": "4500000.00", "currency": "UZS",
  "area": "62.50", "rooms": 2, "floor": 4, "total_floors": 9, "year_built": 2018,
  "city_id": "c1", "district_id": "d1", "address": "Yunusobod 12-23",
  "latitude": "41.350000", "longitude": "69.290000",
  "agency_id": null,
  "feature_ids": ["f1", "f2"],
  "translation": { "title": "2-комн квартира", "description": "Светлая...",
                   "address_note": "рядом метро", "features_text": "балкон, кондиционер" }
}
```
- `price`/`area` — строки-Decimal (никогда float, ADR-002). `latitude`/`longitude`
  — источник для `location` (PostGIS синхронизируется на бэке, ADR-001).
- Координаты берутся только из map-picker, **не** из EXIF фото (ADR-008).

201:
```json
{ "id": "l1", "status": "NEW", "transaction_type": "RENT", "property_type": "APARTMENT",
  "original_language": "RU", "price": "4500000.00", "currency": "UZS",
  "created_at": "2026-06-02T08:00:00Z" }
```
Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`.

### GET /api/v1/listings/:id
Детали листинга. Auth: **public** для `ACTIVE`; владелец/AGENCY/MODERATOR/ADMIN
видят и непубличные статусы. Перевод — по `Accept-Language`/`?lang` с фолбэком на
`original_language` (ADR-012). `district_name` — имя района по языку ответа
(`null`, если `district_id` не найден в справочнике; TASK-209, ADR-0068).
`contact` — публичный контакт автора (TASK-210, ADR-0069): `display_name`,
`type` (`owner`/`agent`/`agency`, выведен из ролей владельца), `is_pro`
(MVP-эвристика: agent/agency), `phone` (`contact_phone` профиля → телефон
аккаунта). Телефон **публичен** на `ACTIVE`-объявлениях.

200:
```json
{
  "id": "l1", "status": "ACTIVE",
  "transaction_type": "RENT", "property_type": "APARTMENT",
  "price": "4500000.00", "currency": "UZS", "area": "62.50",
  "rooms": 2, "floor": 4, "total_floors": 9, "year_built": 2018,
  "city_id": "c1", "district_id": "d1", "district_name": "Юнусабад",
  "address": "Yunusobod 12-23",
  "latitude": "41.350000", "longitude": "69.290000",
  "promotion_type": "VIP", "promotion_expires_at": "2026-06-20T00:00:00Z",
  "owner_id": "u1", "agency_id": null,
  "contact": { "display_name": "Алишер", "type": "owner",
               "is_pro": false, "phone": "+998901234567" },
  "language": "RU",
  "title": "2-комн квартира", "description": "Светлая...",
  "address_note": "рядом метро", "features_text": "балкон, кондиционер",
  "features": [ { "id": "f1", "code": "balcony", "name": "Балкон" } ],
  "media": [ { "id": "m1", "url": "https://cdn.avino.uz/l1/1.webp",
               "thumbnail_url": "https://cdn.avino.uz/l1/1_thumb.webp",
               "sort_order": 0, "type": "IMAGE" } ],
  "published_at": "2026-06-01T10:00:00Z", "created_at": "2026-05-30T09:00:00Z"
}
```
Errors: `404 NOT_FOUND`.

### PATCH /api/v1/listings/:id
Обновить собственный листинг. Auth: **владелец / agency-admin / AGENT с правом**.
Редактирование текста после `ACTIVE` ре-генерирует затронутые переводы
(`translate_listing`) и может вернуть листинг в модерацию (ADR-005).
```json
{ "price": "4300000.00", "rooms": 2, "translation": { "title": "Обновлённый заголовок" } }
```
200 → обновлённый листинг. Errors: `403 FORBIDDEN`, `404 NOT_FOUND`, `422 INVALID_STATUS_TRANSITION`.

### PATCH /api/v1/listings/:id/status
Изменить статус собственного листинга. Auth: **Bearer, владелец** (сервис проверяет ownership).
Действие передаётся в теле:
```json
{ "action": "HIDE" }
```
Допустимые значения `action` и переходы:
- `HIDE` → `ARCHIVED` (из `ACTIVE`, `NEW`, `DRAFT`, `REJECTED`; скрыть объявление)
- `MARK_SOLD` → `SOLD` (из `ACTIVE`, `ARCHIVED`, `NEW`, `DRAFT`, `REJECTED`; только если `transaction_type = SALE`)
- `MARK_RENTED` → `RENTED` (из `ACTIVE`, `ARCHIVED`, `NEW`, `DRAFT`, `REJECTED`; только если `transaction_type = RENT`)
- `REACTIVATE` → `ACTIVE` если листинг ранее был опубликован и не редактировался в скрытом состоянии (`edited_since_hidden = false`), иначе → `NEW`; из `SOLD`/`RENTED` всегда → `NEW`

200 → обновлённый листинг (тот же формат, что `PATCH /api/v1/listings/:id`). Errors: `403 FORBIDDEN`, `404 NOT_FOUND` (листинг удалён или не существует), `422 INVALID_STATUS_TRANSITION` (недопустимый исходный статус или несовпадение `transaction_type`).

See: ADR-0088.

### GET /api/v1/listings/:id/translations
Все переводы листинга (uz/ru/en). Auth: **владелец/MODERATOR/ADMIN**.

### DELETE /api/v1/listings/:id
Soft-delete (`status → DELETED`). Auth: **владелец / MODERATOR / ADMIN**. Строка
сохраняется; исключается из всех read-path (поиск, избранное, чат). → `204`.

### GET /api/v1/listings/mine
Листинги текущего пользователя (любые статусы). Auth: **Bearer**. Query:
`status`, `page`, `limit`.

Жизненный цикл (moderation): `NEW → ACTIVE | DRAFT | REJECTED | DELETED`
(меняется только модератором/админом — §16). Владелец может перевести `ACTIVE`
→ `SOLD`/`RENTED`/`ARCHIVED` через `PATCH /:id/status` (ADR-0088), а также реактивировать скрытый/проданный листинг обратно.

---

## 8. Listing media & uploads

Файлы хранятся в **S3-compatible storage**, никогда на FS приложения
(`ARCHITECTURE` §14, ADR-008). Allowed MIME (MVP): `image/jpeg`, `image/png`,
`image/webp`. VIDEO — Phase 2. **EXIF (в т.ч. GPS) стрипается** при обработке
(`process_uploaded_image`); `thumbnail_url` и web-вариант генерируются воркером
`media_processing_queue`.

**Целевой flow — direct-to-S3 через presigned PUT** (proxy через API допустим для
MVP). DB-запись `listing_media` — source of truth; осиротевшие S3-объекты
подчищаются cleanup-джобой.

### GET /api/v1/listings/:id/media
Медиа листинга по `sort_order`. Auth: **public** для `ACTIVE`; непубличные статусы
видят владелец/MODERATOR/ADMIN (зеркалит видимость карточки, ADR-0019). 200 →
массив объектов media `{ id, url, thumbnail_url, sort_order, type }`.

### POST /api/v1/listings/:id/media/presign
Получить presigned PUT URL. Auth: **владелец листинга**.

Body:
```json
{ "content_type": "image/webp", "size_bytes": 824133, "file_name": "front.webp" }
```
201:
```json
{
  "upload_url": "https://s3.avino.uz/avino/tmp/abc?...signature",
  "method": "PUT",
  "headers": { "Content-Type": "image/webp" },
  "object_key": "tmp/abc.webp",
  "expires_in": 300
}
```
Errors: `415 UNSUPPORTED_MEDIA_TYPE`, `413 FILE_TOO_LARGE`, `422 MEDIA_LIMIT_EXCEEDED`.

### POST /api/v1/listings/:id/media/confirm
Подтвердить загруженный объект → создать запись `listing_media` (запускает
EXIF-strip + thumbnail). Auth: **владелец**.
```json
{ "object_key": "tmp/abc.webp", "sort_order": 0 }
```
201 → `{ "id": "m1", "url": "...", "thumbnail_url": null, "sort_order": 0, "type": "IMAGE" }`
(`thumbnail_url` заполняется асинхронно).

### POST /api/v1/listings/:id/media (proxy, MVP)
Альтернатива: `multipart/form-data` с полем `file`. Auth: **владелец**. Бэк
валидирует MIME/размер, грузит в S3, создаёт запись. 201 → объект media.

### PATCH /api/v1/listings/:id/media/reorder
Переупорядочить. Auth: **владелец**. `{ "order": ["m2","m1","m3"] }` → 200.

### DELETE /api/v1/listings/:id/media/:mediaId
Удалить медиа. Auth: **владелец**. → `204`.

---

## 9. Search (filters + promotion-priority sorting)

Публичный поиск. Auth: **public**. **Возвращает ТОЛЬКО `status = ACTIVE`**
(`DELETED` и прочие непубличные статусы всегда исключены — `DB_SCHEMA` §15).

### GET /api/v1/search

Query-фильтры (`ARCHITECTURE` §12):

| Параметр | Тип | Описание |
|---|---|---|
| `q` | string | свободный текст (TASK-208, ADR-0067): ILIKE-подстрока (pg_trgm GIN, case-insensitive) по `listing_translations.title`/`description` на **любом** языке (uz/ru/en) и по `listings.address`; пустая строка игнорируется; максимум 200 символов |
| `city_id`, `district_id` | uuid | локация |
| `transaction_type` | `SALE \| RENT` | |
| `property_type` | `APARTMENT \| HOUSE \| NEW_BUILDING \| LAND \| COMMERCIAL` | |
| `price_min`, `price_max` | decimal | в пределах `currency`, без FX |
| `currency` | `UZS \| USD` | валюта диапазона цен |
| `area_min`, `area_max` | decimal | |
| `rooms` | int | число комнат: 0..3 — точное совпадение; **4 = «4+»** (`rooms >= 4`) |
| `floor`, `total_floors`, `year_built` | int | |
| `feature_ids` | uuid[] | амenities (CSV или повтор параметра) |
| `promotion_type` | `NORMAL \| TOP \| VIP` | фильтр по тиру (опц.) |
| `sort` | `date_desc \| price_asc \| price_desc \| area_desc` | вторичный ключ сортировки; **умолчание** `date_desc`; невалидное значение → 400 |
| `cursor`, `limit` | | keyset-пагинация |

**Сортировка** (TASK-207, ADR-0004):
Promotion-тир **всегда первичен**: `VIP > TOP > NORMAL` (time-guarded: `promotion_expires_at > now()`, иначе `NORMAL`).
Вторичный ключ задаётся параметром `sort`:
- `date_desc` — `created_at DESC` (поведение по умолчанию и при отсутствии `sort`)
- `price_asc` — `price ASC`
- `price_desc` — `price DESC`
- `area_desc` — `area DESC`; объявления без площади (`area = NULL`) — последними

Tie-break по `id DESC` гарантирует детерминированность keyset-пагинации.

200:
```json
{
  "data": [
    { "id": "l9", "status": "ACTIVE", "transaction_type": "SALE",
      "property_type": "APARTMENT", "price": "950000000.00", "currency": "UZS",
      "rooms": 3, "city_id": "c1", "district_id": "d2", "district_name": "Чиланзар",
      "latitude": "41.31", "longitude": "69.28",
      "promotion_type": "VIP", "promotion_expires_at": "2026-06-25T00:00:00Z",
      "effective_tier": "VIP",
      "language": "RU", "title": "3-комн в центре",
      "thumbnail_url": "https://cdn.avino.uz/l9/1_thumb.webp",
      "created_at": "2026-06-01T12:00:00Z" }
  ],
  "meta": { "limit": 20, "total": 134, "next_cursor": "eyJ0aWVyIjoyLCJjcmVhdGVkX2F0Ijoi..." }
}
```
- `effective_tier` отражает time-guarded тир (expired промо → `NORMAL`).
- `district_name` — имя района по `Accept-Language`/`?lang` (`null`, если
  `district_id` нет в справочнике районов; TASK-209, ADR-0068). Справочник —
  `GET /api/v1/geo/districts` (§10).
Errors: `400 VALIDATION_ERROR`.

---

## 10. Map / geo search

Геопоиск — **PostgreSQL + PostGIS** на бэке (`location geography(Point,4326)`,
ADR-001). Карты — Yandex Maps (клиент). Все гео-эндпоинты возвращают только
`ACTIVE` и применяют то же promotion-упорядочивание, что и `/search`.

### GET /api/v1/geo/districts
Справочник районов для дропдаунов и резолва `district_id → name` (TASK-209,
ADR-0068). Auth: **public**. Без параметров. MVP — районы Ташкента (плоский
список, без гео-геометрии).
200:
```json
[
  { "id": "d0000000-0000-4000-8000-000000000011", "code": "yunusobod",
    "name_uz": "Yunusobod", "name_ru": "Юнусабад", "name_en": "Yunusabad" }
]
```
Имена доступны на трёх языках; клиент выбирает нужный. В элементах `/search`
(§9) и детали `/listings/:id` (§7) бэкенд уже встраивает готовое `district_name`
по `Accept-Language`.

### GET /api/v1/search/radius
Поиск по радиусу (`ST_DWithin`). Auth: **public**.
Query: `lat`, `lng`, `radius_m` (метры) + любые фильтры из §9.
```text
GET /api/v1/search/radius?lat=41.31&lng=69.28&radius_m=2000&transaction_type=RENT
```
`radius_m` — метры (1..50000). 200 → тот же envelope/keyset, что `/search`,
promotion-упорядочивание; каждый элемент несёт `distance_m` (метры, `ST_Distance`).

### GET /api/v1/search/bounds
Поиск по видимой области карты (`ST_MakeEnvelope`/`ST_Within`). Auth: **public**.
Query: `sw_lat`, `sw_lng`, `ne_lat`, `ne_lng` + фильтры.
```text
GET /api/v1/search/bounds?sw_lat=41.2&sw_lng=69.1&ne_lat=41.4&ne_lng=69.4
```
200 → список листингов внутри bbox.

### GET /api/v1/search/near-me
Ближайшие к точке (`ORDER BY location <-> point`). Auth: **public** (для mobile).
Query: `lat`, `lng`, `limit` + фильтры.
200 → тот же envelope, что `/search` (`next_cursor = null`, одна страница
размером `limit`); листинги отсортированы по `distance_m` ASC (промо — вторичный
ключ при равенстве), каждый элемент несёт `distance_m` (метры, `ST_Distance`).

### GET /api/v1/search/polygon
Поиск по произвольному полигону (freehand-ласо, `ST_MakePolygon`/`ST_Within`,
TASK-193). Auth: **public**.

Query: `points` (обязательный) + любые фильтры из §9 (`cursor`, `limit`, и др.).

```text
GET /api/v1/search/polygon?points=41.30,69.27;41.30,69.29;41.32,69.29;41.32,69.27
```

**Параметр `points`** — строка вершин кольца в формате `lat,lng;lat,lng;...`:
- разделитель вершин: `;`;
- каждая вершина: `lat,lng` (широта, долгота WGS84);
- минимум **3 вершины**;
- `lat` ∈ [−90, 90], `lng` ∈ [−180, 180], числовые значения;
- кольцо **замыкается на сервере**: если первая и последняя вершина не совпадают,
  первая добавляется в конец (`ST_MakePolygon` требует замкнутое кольцо ≥ 4 точек).

Невалидный `points` (менее 3 вершин, нечисловые координаты, выход за диапазон) →
`400 VALIDATION_ERROR`.

**Семантика фильтра.** Точный `ST_Within(location::geometry, polygon)` + GIST-префильтр
`&&` по geography. Листинги без координат (`NULL location`) исключаются. Тот же
promotion-приоритетный keyset, что и `/search/bounds` (`date_desc`); `distance_m` не
возвращается (центральной точки нет).

**Ограничение MVP.** Полигон должен быть простым (без самопересечений); для
невыпуклых ласо из рук пользователя — ожидается простое кольцо. `ST_MakeValid`
не применяется.

200 → тот же `CursorPaginatedResponse<SearchListItem>` envelope/keyset, что
`/search/bounds`.
Errors: `400 VALIDATION_ERROR`.

### GET /api/v1/search/clusters
Кластеризация маркеров для зума карты. Auth: **public**.
Query: `sw_lat`, `sw_lng`, `ne_lat`, `ne_lng`, `zoom` + фильтры.
200:
```json
{
  "clusters": [
    { "lat": 41.32, "lng": 69.27, "count": 42, "bbox": [69.25,41.30,69.30,41.34] }
  ],
  "points": [
    { "id": "l9", "lat": 41.311, "lng": 69.281, "price": "950000000.00",
      "currency": "UZS", "promotion_type": "VIP" }
  ]
}
```
`clusters` — агрегаты при дальнем зуме; `points` — одиночные маркеры при ближнем.
Errors: `400 VALIDATION_ERROR`.

---

## 11. Favorites

Только авторизованные. `GUEST` не может (ADR/`DB_SCHEMA` §9). Дубликат запрещён
(`UNIQUE (user_id, listing_id)`). `DELETED` листинги не отдаются в списке.

### GET /api/v1/favorites
Список избранного пользователя. Auth: **Bearer**. Query: `cursor`, `limit`.
200 → пагинированный список листингов (карточки как в `/search`).

### POST /api/v1/favorites
Добавить в избранное. Auth: **Bearer**.
```json
{ "listing_id": "l9" }
```
201 → `{ "id": "fav1", "listing_id": "l9", "created_at": "..." }`.
Errors: `409 ALREADY_FAVORITED`, `404 NOT_FOUND`.

### DELETE /api/v1/favorites/:listingId
Убрать из избранного. Auth: **Bearer**. → `204`.

---

## 12. Saved searches

Авторизованные сохраняют фильтры. `filters_json` **версионируется** (ADR-009):
`{ "schemaVersion": <int>, "filters": { ... } }`. Matcher толерантен к старым
`schemaVersion`. Только `ACTIVE`-листинги триггерят алерты; MVP — email-алерт о
новом совпадении (polling-matcher, `check_saved_searches`, de-dup по
`last_checked_at`).

### GET /api/v1/saved-searches
Список. Auth: **Bearer**.
200:
```json
{ "data": [ { "id": "s1", "name": "2-комн Юнусабад до 5 млн", "is_active": true,
    "filters_json": { "schemaVersion": 1, "filters": { "city_id": "c1",
      "transaction_type": "RENT", "rooms": 2, "price_max": "5000000.00",
      "currency": "UZS" } },
    "last_checked_at": "2026-06-02T06:00:00Z", "created_at": "..." } ],
  "meta": { "limit": 20, "total": 3 } }
```

### POST /api/v1/saved-searches
Создать. Auth: **Bearer**.
```json
{ "name": "2-комн Юнусабад",
  "filters_json": { "schemaVersion": 1, "filters": { "city_id": "c1", "rooms": 2 } } }
```
201 → объект сохранённого поиска. Errors: `400 VALIDATION_ERROR`,
`422 UNSUPPORTED_FILTER_SCHEMA`.

### PATCH /api/v1/saved-searches/:id
Обновить `name` / `filters_json` / `is_active`. Auth: **владелец**. 200.

### DELETE /api/v1/saved-searches/:id
Удалить. Auth: **владелец**. → `204`.

---

## 13. Chat (threads & messages)

Внутренний чат привязан к листингу. Поля — **`initiator_id` / `owner_id`**
(НЕ buyer/seller; листинги бывают SALE и RENT — ADR-003). Тред уникален по
`(listing_id, initiator_id, owner_id)`. `GUEST` не пишет; новый тред на `DELETED`
листинге запрещён. MVP — polling.

### GET /api/v1/chat/threads
Треды текущего пользователя (как `initiator` или `owner`). Auth: **Bearer**.
Query: `cursor`, `limit`. Сортировка по `last_message_at DESC`.
`counterparty` (профиль второго участника) и `last_message` (превью последней
реплики) — optional non-breaking-поля (`null`, если профиль/сообщений нет): имя
из `UserProfile` (`display_name` → «first last» → `null`), `last_message` — самая
свежая реплика треда.
200:
```json
{ "data": [ { "id": "t1", "listing_id": "l9",
    "initiator_id": "u2", "owner_id": "u1",
    "last_message_at": "2026-06-02T07:30:00Z", "unread_count": 2,
    "listing_preview": { "title": "3-комн в центре",
      "thumbnail_url": "https://cdn.avino.uz/l9/1_thumb.webp",
      "price": "950000000.00", "currency": "UZS", "status": "ACTIVE" },
    "counterparty": { "id": "u1", "name": "Тимур Сафаров",
      "avatar_url": "https://cdn.avino.uz/u1/avatar.webp" },
    "last_message": { "id": "msg6", "sender_id": "u1",
      "body": "Да, конечно. Адрес отправлю здесь же.", "is_read": false,
      "created_at": "2026-06-02T07:30:00Z" } } ],
  "meta": { "limit": 20, "total": 5 } }
```

### POST /api/v1/chat/threads
Создать/получить тред с создателем листинга. Auth: **Bearer (USER)**.
`owner_id` выводится из листинга; `initiator_id` = текущий пользователь.
```json
{ "listing_id": "l9", "body": "Здравствуйте, ещё актуально?" }
```
201 (или 200, если тред уже есть — идемпотентно по unique-ключу):
```json
{ "id": "t1", "listing_id": "l9", "initiator_id": "u2", "owner_id": "u1",
  "created_at": "..." }
```
Errors: `403 FORBIDDEN` (GUEST / сам себе), `404 NOT_FOUND`,
`422 LISTING_NOT_AVAILABLE` (листинг DELETED/непубличен).

### GET /api/v1/chat/threads/:id/messages
Сообщения треда. Auth: **участник треда (initiator/owner) или MODERATOR/ADMIN
для complaint-flow**. Query: `cursor`, `limit` (по `created_at`).
200:
```json
{ "data": [ { "id": "msg1", "thread_id": "t1", "sender_id": "u2",
    "body": "Здравствуйте...", "is_read": true, "created_at": "..." } ],
  "meta": { "limit": 30, "next_cursor": null } }
```

### POST /api/v1/chat/threads/:id/messages
Отправить сообщение. Auth: **участник треда**. Создаёт `new_chat_message`
notification (`notify_chat_message`).
```json
{ "body": "Да, актуально" }
```
201 → объект сообщения. Errors: `403 FORBIDDEN`, `422 LISTING_NOT_AVAILABLE`.

### POST /api/v1/chat/threads/:id/read
Отметить входящие прочитанными (`is_read=true`). Auth: **участник**. → `204`.

---

## 14. Notifications (+ device registration)

Типы (`notification_type`): `SAVED_SEARCH_NEW_LISTING | FAVORITE_PRICE_DROP |
NEW_CHAT_MESSAGE | LISTING_MODERATION_STATUS_CHANGED | NEW_LEAD |
PROMOTION_ACTIVATED | PROMOTION_EXPIRED`. Каналы: `EMAIL | PUSH | IN_APP`. MVP
надёжно доставляет `EMAIL + IN_APP`; `PUSH` (FCM/APNs) — задокументированный stub
через реестр устройств (ADR-010). Все отправки — BullMQ-джобы.

### GET /api/v1/notifications
In-app лента уведомлений. Auth: **Bearer**. Query: `status` (`PENDING|SENT|
FAILED|READ`), `type`, `cursor`, `limit`.
200:
```json
{ "data": [ { "id": "n1", "type": "NEW_CHAT_MESSAGE", "channel": "IN_APP",
    "status": "SENT", "title": "Новое сообщение",
    "body": "У вас новое сообщение по объявлению",
    "data_json": { "thread_id": "t1", "listing_id": "l9" },
    "read_at": null, "created_at": "..." } ],
  "meta": { "limit": 20, "total": 12, "unread": 3 } }
```

### POST /api/v1/notifications/:id/read
Отметить уведомление прочитанным (`read_at`, `status → READ`). Auth: **владелец**. → `204`.

### POST /api/v1/notifications/read-all
Отметить все прочитанными. Auth: **Bearer**. → `204`.

### POST /api/v1/notifications/devices
Регистрация push-устройства (stub, ADR-010). Auth: **Bearer**.
```json
{ "platform": "ANDROID", "push_token": "fcm:abc123..." }
```
`platform`: `ANDROID | IOS | WEB`. `UNIQUE (push_token)`.
201 → `{ "id": "dev1", "platform": "ANDROID", "is_active": true }`.
Errors: `409 DEVICE_TOKEN_EXISTS`.

### DELETE /api/v1/notifications/devices/:id
Отвязать устройство (`is_active=false`/удаление). Auth: **владелец**. → `204`.

---

## 15. Promotions (public plans + admin actions)

Промо-тиры: `NORMAL | TOP | VIP` (приоритет `VIP > TOP > NORMAL`). Периоды:
`7 | 14 | 30` дней. `listing_promotions` — source of truth (ledger); колонки
`promotion_*` на `listings` — синхронизируемый read-cache (ADR-006). Не более
одной `ACTIVE` промо на листинг. Online-оплаты в MVP нет — `payment_status =
NOT_REQUIRED`, активация вручную админом.

### GET /api/v1/promotions/plans
Публичный каталог планов (тир × период × цена). Auth: **public**. Отдаёт **только
активные** планы (`is_active = true`) из таблицы `promotion_plans` (DB-backed,
ADR-0060). Ранее каталог был статической константой в коде (ADR-0032).
200:
```json
{ "plans": [
  { "type": "TOP", "period_days": 7,  "price": "50000.00",  "currency": "UZS" },
  { "type": "TOP", "period_days": 14, "price": "90000.00",  "currency": "UZS" },
  { "type": "TOP", "period_days": 30, "price": "150000.00", "currency": "UZS" },
  { "type": "VIP", "period_days": 7,  "price": "120000.00", "currency": "UZS" },
  { "type": "VIP", "period_days": 14, "price": "210000.00", "currency": "UZS" },
  { "type": "VIP", "period_days": 30, "price": "350000.00", "currency": "UZS" }
] }
```

### GET /api/v1/admin/listings/:id/promotions
История промо листинга (ledger). Auth: **ADMIN**.
200 → список `listing_promotions` (с `type`, `status`, `period_days`, `starts_at`,
`expires_at`, `payment_status`).

### POST /api/v1/admin/listings/:id/promotions
Активировать VIP/TOP вручную (`activate_vip`/`activate_top`). Auth: **ADMIN**.
Идемпотентно по `Idempotency-Key`/`payment_reference` (§24 п.4). Закрывает
предыдущую активную промо, обновляет cache на `listings` атомарно. Пишет
`promotion_logs` + `audit_logs(LISTING_PROMOTION_CHANGE)`.
```json
{ "type": "VIP", "period_days": 30 }
```
201:
```json
{ "id": "pr1", "listing_id": "l9", "type": "VIP", "status": "ACTIVE",
  "period_days": 30, "starts_at": "2026-06-02T08:00:00Z",
  "expires_at": "2026-07-02T08:00:00Z", "payment_status": "NOT_REQUIRED" }
```
Errors: `422 INVALID_PERIOD` (не 7/14/30), `409 ACTIVE_PROMOTION_EXISTS`
(если не разрешён auto-supersede), `404 NOT_FOUND`.

### PATCH /api/v1/admin/listing-promotions/:id/cancel
Отменить промо (`status → CANCELLED`, cache → `NORMAL`). Auth: **ADMIN**.
`promotion_logs(CANCEL_PROMOTION)`.
```json
{ "reason": "по запросу владельца" }
```
200 → обновлённая промо.

### PATCH /api/v1/admin/listing-promotions/:id/extend
Продлить (`expires_at` += период). Auth: **ADMIN**.
`promotion_logs(EXTEND_PROMOTION)`.
```json
{ "period_days": 14 }
```
200 → обновлённая промо (новый `expires_at`). Errors: `422 INVALID_PERIOD`,
`422 PROMOTION_NOT_ACTIVE`.

> Истечение промо обрабатывается фоновой джобой `expire_listing_promotions`
> (`promotion_queue`), но корректность сортировки не зависит от джобы — тир
> time-guarded в SQL (ADR-006).

### Admin: редактируемые тарифы и интервал истечения

Тарифная матрица (`promotion_plans`) и интервал sweep-джобы (`app_settings`)
редактируются админом без деплоя (ADR-0060, supersedes ADR-0032). Цена
снапшотится в `listing_promotions.price` при активации, поэтому правка плана не
меняет уже активные промо.

#### GET /api/v1/admin/promotion-plans
Все 6 планов матрицы (включая неактивные). Auth: **ADMIN**.
200:
```json
{ "plans": [
  { "id": "pp1", "type": "TOP", "period_days": 7,  "price": "50000.00",  "currency": "UZS", "is_active": true },
  { "id": "pp2", "type": "TOP", "period_days": 14, "price": "90000.00",  "currency": "UZS", "is_active": true },
  { "id": "pp3", "type": "TOP", "period_days": 30, "price": "150000.00", "currency": "UZS", "is_active": true },
  { "id": "pp4", "type": "VIP", "period_days": 7,  "price": "120000.00", "currency": "UZS", "is_active": true },
  { "id": "pp5", "type": "VIP", "period_days": 14, "price": "210000.00", "currency": "UZS", "is_active": true },
  { "id": "pp6", "type": "VIP", "period_days": 30, "price": "350000.00", "currency": "UZS", "is_active": true }
] }
```

#### PATCH /api/v1/admin/promotion-plans/:id
Изменить цену и/или активность плана. Auth: **ADMIN**. Пишет
`audit_logs(PROMOTION_PLAN_UPDATE)` (metadata: old/new `price` + `is_active`).
```json
{ "price": "99000.00", "isActive": true }
```
Оба поля опциональны (`price?: string`, `isActive?: boolean`).
200 → обновлённый план (та же форма, что в списке). Errors: `404 NOT_FOUND`.

#### GET /api/v1/admin/promotion-settings
Текущий интервал истечения промо (preset). Auth: **ADMIN**.
200:
```json
{ "expiryIntervalHours": 12 }
```
`expiryIntervalHours` — один из пресетов `6 | 12` (соответствует cron
`0 */6 * * *` / `0 */12 * * *` в `app_settings.promotion_expiry_cron`).

#### PATCH /api/v1/admin/promotion-settings
Сменить интервал истечения промо. Auth: **ADMIN**. Маппит preset → cron,
персистит в `app_settings`, перерегистрирует repeatable BullMQ-джобу в рантайме
(`PromotionQueue.rescheduleExpiry`). Пишет `audit_logs(PROMOTION_SETTINGS_UPDATE)`.
```json
{ "expiryIntervalHours": 6 }
```
200 → `{ "expiryIntervalHours": 6 }`. Errors: `422` (значение вне `6 | 12`).

#### GET /api/v1/admin/telegram-settings
Текущее состояние Telegram-алертов админу. Auth: **ADMIN** (TASK-195, ADR-0065).
200:
```json
{ "notificationsEnabled": true }
```
Значение: строка `app_settings['telegram_notifications_enabled']` если задана,
иначе env-дефолт `TELEGRAM_NOTIFICATION_STATE` (не задан → dev=true / prod=false).

#### PATCH /api/v1/admin/telegram-settings
Включить/выключить Telegram-алерты в рантайме (без пересборки). Auth: **ADMIN**.
Персистит в `app_settings`, пишет `audit_logs(TELEGRAM_SETTINGS_UPDATE)`.
```json
{ "enabled": false }
```
200 → `{ "notificationsEnabled": false }`. Errors: `400 VALIDATION_ERROR`.

---

## 16. Moderation & admin

Все листинги проходят moderation queue. Каждое действие логируется
(`moderation_logs` + `audit_logs(LISTING_STATUS_CHANGE)`). Auth: **MODERATOR /
ADMIN**.

### GET /api/v1/admin/listings
Очередь модерации и админ-список. Query: `status` (например `NEW`),
`property_type`, `transaction_type`, `q`, `page`, `limit`.
```text
GET /api/v1/admin/listings?status=NEW
```
200 → пагинированный список листингов (любые статусы). Каждый элемент несёт
`owner_id`, `created_at`, `published_at` и инлайн-профиль автора `owner`
(ADR-0084) — чтобы карточка модерации показывала «кто и когда создал» без
ADMIN-only `GET /admin/users/:id`:
```json
{
  "id": "l1",
  "status": "NEW",
  "owner_id": "u1",
  "created_at": "2026-06-02T08:00:00Z",
  "published_at": null,
  "owner": {
    "id": "u1",
    "display_name": "Алишер У.",
    "first_name": "Алишер",
    "last_name": "Усманов",
    "email": "seller@example.com",
    "phone": "+998901234567",
    "contact_phone": "+998907654321",
    "status": "ACTIVE",
    "roles": ["OWNER"],
    "created_at": "2026-05-20T10:00:00Z"
  }
}
```
`owner.*` профильные поля (`display_name`/`first_name`/`last_name`/
`contact_phone`) — `null`, если профиль не заполнен. Поле `owner` добавлено как
optional response field (non-breaking, §14).

### PATCH /api/v1/admin/listings/:id/status
Сменить статус (модерация). Auth: **MODERATOR / ADMIN**. Действие — одно из
`moderation_action`: `APPROVE | SEND_TO_DRAFT | REJECT | DELETE`. Маппинг на
`listing_status`: `ACTIVE | DRAFT | REJECTED | DELETED`. `APPROVE` → `ACTIVE`
запускает авто-перевод (`translate_listing`, ADR-005) и `published_at`.
```json
{ "action": "APPROVE", "reason": null }
```
или
```json
{ "action": "REJECT", "reason": "недостаточно фото" }
```
200:
```json
{ "id": "l1", "status": "ACTIVE", "published_at": "2026-06-02T08:10:00Z" }
```
Создаёт `LISTING_MODERATION_STATUS_CHANGED` notification владельцу.
Errors: `403 FORBIDDEN`, `422 INVALID_STATUS_TRANSITION`, `404 NOT_FOUND`.

### GET /api/v1/admin/listings/:id/moderation-logs
История модерации листинга. Auth: **MODERATOR / ADMIN**.
200 → список `moderation_logs` (`action`, `old_status`, `new_status`,
`moderator_id`, `reason`, `created_at`).

### Complaints

#### POST /api/v1/complaints
Пожаловаться на листинг. Auth: **Bearer (USER)**.
```json
{ "listing_id": "l9", "reason": "fake", "details": "Фото не соответствуют" }
```
201 → `{ "id": "cmp1", "status": "NEW" }`.

#### GET /api/v1/admin/complaints
Список жалоб. Auth: **MODERATOR / ADMIN**. Query: `status`
(`NEW|IN_REVIEW|RESOLVED|REJECTED`), `listing_id`, `page`, `limit`.

#### PATCH /api/v1/admin/complaints/:id
Обработать жалобу (`status`, `handled_by`, `handled_at`). Auth: **MODERATOR /
ADMIN**.
```json
{ "status": "RESOLVED" }
```
200 → обновлённая жалоба.

### Admin logs

Read-only журналы для админ-панели (TASK-131, ADR-0042). Все — **ADMIN**-only
(не MODERATOR), пагинация page-based (`meta.total` обязателен, §4), сортировка
`created_at DESC, id DESC`. Все фильтры опциональны и комбинируются через AND.

#### GET /api/v1/admin/audit-logs
Security audit-лог (`audit_logs`, ADR-004). Query: `action`, `actor_id`,
`entity_type`, `entity_id`, `page`, `limit`.
200 → пагинированный список (`id`, `actor_id`, `action`, `entity_type`,
`entity_id`, `ip`, `user_agent`, `metadata`, `created_at`).

#### GET /api/v1/admin/moderation-logs
Глобальный журнал модерации (`moderation_logs`) по всем объявлениям — в отличие
от per-listing `GET /admin/listings/:id/moderation-logs`. Query: `listing_id`,
`moderator_id`, `action` (`APPROVE|SEND_TO_DRAFT|REJECT|DELETE`), `page`, `limit`.
200 → список (`id`, `listing_id`, `moderator_id`, `action`, `old_status`,
`new_status`, `reason`, `created_at`).

#### GET /api/v1/admin/promotion-logs
Журнал админских действий над промо VIP/TOP (`promotion_logs`). Query:
`listing_id`, `admin_id`, `action`
(`ACTIVATE_VIP|ACTIVATE_TOP|CANCEL_PROMOTION|EXTEND_PROMOTION`), `page`, `limit`.
200 → список (`id`, `listing_promotion_id`, `listing_id`, `admin_id`, `action`,
`old_type`, `new_type`, `old_expires_at`, `new_expires_at`, `reason`,
`created_at`).

#### GET /api/v1/admin/notification-logs
Глобальный журнал уведомлений (`notifications`). Query: `user_id`, `type`,
`channel` (`EMAIL|PUSH|IN_APP`), `status` (`PENDING|SENT|FAILED|READ`), `page`,
`limit`.
200 → список (`id`, `user_id`, `type`, `channel`, `status`, `title`, `body`,
`data_json`, `read_at`, `sent_at`, `created_at`).

#### GET /api/v1/admin/stats
Сводные счётчики дашборда админ-панели (ADMIN-15). Auth: **MODERATOR / ADMIN**.
Без query-параметров.
200 → `{ listings_new, complaints_new, users_total, promotions_active }`:
- `listings_new` — листинги в очереди модерации (`ListingStatus.NEW`);
- `complaints_new` — необработанные жалобы (`ComplaintStatus.NEW`);
- `users_total` — все пользователи (как `meta.total` в `/admin/users` без фильтра);
- `promotions_active` — активные промо VIP/TOP (`PromotionStatus.ACTIVE`).

---

## 17. Error catalog

Формат тела — см. §4. Коды (`error.code`) стабильны и являются частью контракта.

| code | HTTP | Когда |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Невалидное тело/параметры (см. `details`) |
| `UNAUTHORIZED` | 401 | Нет/невалиден access-токен |
| `TOKEN_INVALID` | 401 | Невалиден refresh-токен |
| `TOKEN_EXPIRED` | 401 | Токен истёк |
| `TOKEN_REUSED` | 401 | Повторное использование ротированного refresh → отозвана session family |
| `OTP_INVALID` | 400 | Неверный OTP-код |
| `OTP_EXPIRED` | 400 | OTP истёк |
| `OTP_ATTEMPTS_EXCEEDED` | 429 | Превышен лимит попыток ввода OTP |
| `RATE_LIMITED` | 429 | Общий/OTP throttle |
| `USER_BLOCKED` | 403 | `status = BLOCKED` |
| `AUTH_PROVIDER_UNAVAILABLE` | 503 | Внешний провайдер входа не настроен (напр. Google без `GOOGLE_CLIENT_ID`) |
| `FORBIDDEN` | 403 | Роль/право не позволяет действие (RBAC) |
| `NOT_FOUND` | 404 | Ресурс не найден |
| `CONTACT_TAKEN` | 409 | Phone/email уже занят среди non-DELETED аккаунтов |
| `ROLE_ALREADY_GRANTED` | 409 | Роль уже назначена |
| `ALREADY_FAVORITED` | 409 | Листинг уже в избранном |
| `DEVICE_TOKEN_EXISTS` | 409 | push_token уже зарегистрирован |
| `ACTIVE_PROMOTION_EXISTS` | 409 | Уже есть активная промо на листинг |
| `LISTING_NOT_AVAILABLE` | 422 | Листинг DELETED/непубличен (чат/действие невозможно) |
| `INVALID_STATUS_TRANSITION` | 422 | Недопустимый переход статуса листинга |
| `INVALID_PERIOD` | 422 | period_days не в {7,14,30} |
| `PROMOTION_NOT_ACTIVE` | 422 | Промо не в статусе ACTIVE (extend/cancel) |
| `UNSUPPORTED_FILTER_SCHEMA` | 422 | Неизвестный `schemaVersion` в filters_json |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | MIME вне allow-list (jpeg/png/webp) |
| `FILE_TOO_LARGE` | 413 | Превышен max размер файла |
| `MEDIA_LIMIT_EXCEEDED` | 422 | Превышено число файлов на листинг |
| `INTERNAL_ERROR` | 500 | Внутренняя ошибка |

Примеры тел:
```json
{ "error": { "code": "OTP_EXPIRED", "message": "Код подтверждения истёк",
  "request_id": "req_a1" } }
```
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request body",
  "details": [ { "field": "period_days", "issue": "must be one of 7,14,30" } ],
  "request_id": "req_b2" } }
```

---

## 18. Mobile API compatibility notes

Backend client-neutral — один контракт для web (RTK Query) и Flutter
(`ARCHITECTURE` §21). Гарантии для мобильного клиента:

- **Только versioned routes** `/api/v1/...`; unversioned запрещены. Breaking
  change → `/api/v2` (не раньше реальной необходимости).
- **Язык** — `Accept-Language` (или `?lang=`); листинги отдают перевод нужного
  языка с фолбэком на оригинал (ADR-005/012). Значения: `uz|ru|en` → `UZ|RU|EN`.
- **Auth идентичен web**: OTP request/verify, refresh с ротацией, logout, me.
  Токены в `Authorization: Bearer`. Refresh хранится клиентом безопасно.
- **Гео для мобайла**: `near-me` (геолокация устройства), `radius`, `bounds`,
  `clusters` — всё на PostGIS-бэке; клиенту достаточно координат/bbox/zoom.
- **Push**: устройство регистрируется через `POST /notifications/devices`
  (`ANDROID|IOS|WEB`); транспорт FCM/APNs — stub до интеграции Flutter (ADR-010).
- **Загрузка медиа**: presigned-PUT flow подходит мобайлу (загрузка напрямую в
  S3), либо proxy-эндпоинт для MVP. EXIF/GPS стрипается на сервере (ADR-008).
- **Стабильные имена/enum**: JSON snake_case, enum UPPERCASE, чат —
  `initiator_id`/`owner_id`. Эти имена зафиксированы, чтобы не вызвать v2 после
  выпуска клиентов.
- **Единые envelope/ошибки/пагинация** — §4 — одинаковы для всех клиентов.
- Полный мобильный гайд ведётся в `docs/MOBILE_API_GUIDE.md`.
