# API.md — Avino REST API (v1)

> Контракт REST API портала недвижимости **Avino** (Узбекистан).
> Документ согласован с `ARCHITECTURE.md` (ADR-001…013, §28) и `DB_SCHEMA.md`.
> При конфликте с кодом — этот документ и `ARCHITECTURE.md`/`DB_SCHEMA.md` выигрывают.
> Breaking changes требуют новой версии API (`/api/v2`) и одобрения Team Lead.
>
> ⏳ **Planned** — эндпоинт описан в этом контракте, но ещё **не реализован в коде**:
> не вызывается на живом API и отсутствует в `apps/api/openapi.*.json`. Помечен
> бейджем у соответствующего заголовка ниже (важно для Flutter-клиента, который
> генерируется из `openapi.public.json`).

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
Errors: `400 VALIDATION_ERROR`, `429 RATE_LIMITED`, `503 AUTH_PROVIDER_UNAVAILABLE`
(канал `SMS` выключен админ-тогглом `sms_enabled`, ADR-0090 — клиенту стоит
предложить другой канал).

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

### POST /api/v1/auth/apple

Вход через Apple (Sign in with Apple): верифицирует Apple ID-token офлайн
(audience = Service ID из `APPLE_CLIENT_ID`), создаёт/обновляет пользователя
(связывание по верифицированному email, login=signup), выдаёт токены. Тело
ответа идентично `otp/verify`. Auth: **public** (ADR-0097).

Body:
```json
{ "id_token": "eyJ... (Apple ID-token из Sign in with Apple JS)",
  "first_name": "Имя (опц., только при первой авторизации)",
  "last_name": "Фамилия (опц.)" }
```

200: тот же контракт, что `otp/verify` (`access_token`, `refresh_token`,
`token_type`, `expires_in`, `user`). Аккаунт создаётся с ролью `USER`,
`is_email_verified: true`.

Errors: `401 UNAUTHORIZED` (невалидный токен или `email_verified` ≠ true),
`403 USER_BLOCKED`, `503 AUTH_PROVIDER_UNAVAILABLE` (не задан `APPLE_CLIENT_ID`).

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

### GET /api/v1/auth/sessions

Активные сессии (session families refresh-токенов) текущего пользователя
(ADR-0143). Auth: **Bearer**. `is_current` метится по `fid` предъявленного
access-токена (refresh-токен не передаётся).

200:
```json
[
  {
    "id": "3f1c...-fid",
    "created_at": "2026-07-01T10:00:00.000Z",
    "last_rotated_at": "2026-07-12T08:30:00.000Z",
    "user_agent": "Mozilla/5.0 ...",
    "ip": "203.0.113.7",
    "is_current": true
  }
]
```
`created_at` — момент логина, `last_rotated_at` — последняя ротация refresh
(равно `created_at`, если ротаций не было). Errors: `401 UNAUTHORIZED`.

Лимит: активных сессий не больше `AUTH_MAX_SESSIONS` (дефолт 5). Логин сверх
лимита не отклоняется — тихо отзывается сессия, дольше всех неактивная по
`last_rotated_at`; её устройство получит `401` на следующем `/auth/refresh`
(ADR-0143).

### DELETE /api/v1/auth/sessions/:fid

Отозвать конкретную сессию по её id (session family, ADR-0143). Auth: **Bearer**.
Только свою: чужой или несуществующий `fid` → `404 NOT_FOUND` (существование
чужой сессии не раскрывается). После отзыва refresh-токены family перестают
ротироваться (`401 TOKEN_REUSED` на `/auth/refresh`); повторный отзыв своей
family идемпотентен.

204 No Content. Errors: `400 VALIDATION_ERROR` (не-UUID `fid`),
`401 UNAUTHORIZED`, `404 NOT_FOUND`.

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

### POST /api/v1/users/me/avatar
Загрузка аватара (TASK-248, ADR-0134). Auth: **Bearer**. `multipart/form-data`,
поле `file` (`image/jpeg|png|webp`, ≤10 MiB) — та же proxy-загрузка, что у медиа
объявлений. Файл кладётся в R2 (`user_profiles.avatar_storage_key`), `avatar_url`
подписывается заново на каждое чтение (sign-on-read, ADR-0086) и **не**
перезаписывает `avatar_url` фото OAuth-провайдера.
→ `201 { "avatar_url": "https://..." }`. Errors: `400 VALIDATION_ERROR` (нет
файла), `415 UNSUPPORTED_MEDIA_TYPE`, `413 FILE_TOO_LARGE`.

### DELETE /api/v1/users/me/avatar
Убрать загруженный аватар (`avatar_storage_key → null`, объект в R2 удаляется
best-effort). Auth: **Bearer**. → `204`. После этого `avatar_url` снова отдаёт
фото OAuth-провайдера или `null`. Чтение аватара (в `/users/me`, `/auth/me`,
`/chat/threads`) резолвит подписанную ссылку из `avatar_storage_key`, если задан.

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
409 `CONTACT_TAKEN` — возврат DELETED-аккаунта в живой статус, когда его
phone/email уже занят другим не-удалённым пользователем (уникальность контактов
частичная, ADR-0154).

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
- `year_built` **обязателен** для `property_type = APARTMENT | HOUSE` (иначе 400
  `VALIDATION_ERROR`): категория «новостройка» вычисляется из него. Значение
  **может быть в будущем** — недострой («сдача в 2028», квартиру перепродают до
  сдачи дома). Для `LAND | COMMERCIAL` — опционален.

201:
```json
{ "id": "l1", "status": "NEW", "transaction_type": "RENT", "property_type": "APARTMENT",
  "original_language": "RU", "price": "4500000.00", "currency": "UZS",
  "created_at": "2026-06-02T08:00:00Z" }
```
Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `422 PROFILE_INCOMPLETE`
(профиль автора без имени, фамилии или телефона, ADR-0125).

### GET /api/v1/listings/:id
Детали листинга. Auth: **public** для `ACTIVE`; владелец/AGENCY/MODERATOR/ADMIN
видят и непубличные статусы. Перевод — по `Accept-Language`/`?lang` с фолбэком на
`original_language` (ADR-012). `district_name` — имя района по языку ответа
(`null`, если `district_id` не найден в справочнике; TASK-209, ADR-0068).
`contact` — публичный контакт автора (TASK-210, ADR-0069): `display_name`,
`type` (`owner`/`agent`/`agency`, выведен из ролей владельца), `is_pro`
(MVP-эвристика: agent/agency), `phone` (`contact_phone` профиля → телефон
аккаунта). Телефон **публичен** на `ACTIVE`-объявлениях.
`price_history` — массив событий изменения цены (ADR-0121, append-only), от старых
к новым: `[{ "price": "<decimal>", "currency": "<UZS|USD>", "created_at": "<ISO8601>" }]`.
Первая запись — цена при создании объявления. Используется для отображения динамики
цены на клиенте.
`reference` — публичный человекочитаемый номер объявления (ADR-0137, `Int`,
нумерация со сдвига от 100000); короткий id, по которому объявление можно найти/
продиктовать. UUID `id` остаётся каноническим ключом для всех связей и ссылок.

200:
```json
{
  "id": "l1", "reference": 100042, "status": "ACTIVE",
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
  "published_at": "2026-06-01T10:00:00Z", "created_at": "2026-05-30T09:00:00Z",
  "price_history": [ { "price": "4500000.00", "currency": "UZS", "created_at": "2026-05-30T09:00:00Z" } ]
}
```
Errors: `404 NOT_FOUND`.

### GET /api/v1/listings/by-ref/:reference
То же, что `GET /api/v1/listings/:id`, но поиск по публичному номеру
(`listings.reference`, ADR-0137) вместо UUID. `:reference` — целое число.
Ответ и правила видимости идентичны `GET :id`. Errors: `404 NOT_FOUND`.

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
> ⏳ **Planned — не реализовано в коде** (нет роута в `listings.controller.ts`). Сейчас
> удаление недоступно; владелец скрывает листинг через `PATCH /api/v1/listings/:id/status`
> (`action: "HIDE"` → `ARCHIVED`, ADR-0088).

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
> ⏳ **Planned — не реализовано в коде** (целевой direct-to-S3 flow). Сейчас аплоад
> только через `POST /api/v1/listings/:id/media` (proxy, MVP).

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
> ⏳ **Planned — не реализовано в коде** (часть direct-to-S3 flow, см. `/presign` выше).

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
| `property_type` | `APARTMENT \| HOUSE \| LAND \| COMMERCIAL` | `NEW_BUILDING` удалён: «новостройка» — не тип, а вычисляемая категория (см. `new_construction`) |
| `price_min`, `price_max` | decimal | в пределах `currency`, без FX |
| `currency` | `UZS \| USD` | валюта диапазона цен |
| `area_min`, `area_max` | decimal | |
| `rooms` | int (повтор.) | число комнат, **повторяющийся** параметр → OR/IN (`rooms=2&rooms=3&rooms=5`). Каждое **0..4 — ТОЧНОЕ** совпадение (`4` = ровно 4, **BREAKING** vs прежнего «4+»); **`5` = «5+»** (`rooms >= 5`). Одиночный скаляр совместим. Для «4+» — `rooms_min=4`. TASK-247/ADR-0133 |
| `floor`, `total_floors`, `year_built` | int | |
| `new_construction` | bool | «Новостройка»: `year_built` за последние 3 календарных года **или в будущем** (недострой — «сдача в 2028»). Порог вычисляет сервер (URL стабилен); `year_built IS NULL` не проходит. Работает во всех поисковых эндпоинтах (`/search`, `/search/bounds`, `/search/radius`, `/search/polygon`, `/search/clusters`, price-distribution) |
| `price_reduced` | boolean | «Цена снижена»: только объявления, у которых последнее изменение цены было снижением (в той же валюте). `false`/отсутствие — без фильтра. Работает во всех поисковых эндпоинтах (`/search`, `/search/bounds`, `/search/radius`, `/search/polygon`, `/search/clusters`) |
| `feature_ids` | uuid[] | амenities (CSV или повтор параметра) |
| `points` | string | необязательная нарисованная территория `lat,lng;lat,lng;…` (≥3 вершин); пересечение с контуром (`ST_Within`) поверх остальных фильтров и bbox. Тот же формат, что `/search/polygon`; невалидная строка → `400 VALIDATION_ERROR`. Принимается и в `/search/bounds`. TASK-249/ADR-0133 |
| `agent_id` | uuid | только объявления этого владельца (страница агента, ADR-0140, §21): применяется к `owner_id` без проверки роли — `owner_id` и так публичен в detail-ответе (§7). Наследован во всех гео-эндпоинтах `/search/*` (их DTO расширяют этот) — отдельного `/agents/:id/listings` нет |
| `promotion_type` | `NORMAL \| TOP \| VIP` | фильтр по тиру (опц.) |
| `sort` | `date_desc \| price_asc \| price_desc \| area_desc` | ключ сортировки; **умолчание** `date_desc`; невалидное значение → 400. При явном выборе — гибрид (см. ниже): закреплённое промо + строгий ключ; `price_*` нормализуется по курсу (ADR-0117) |
| `cursor`, `limit` | | keyset-пагинация |

**Сортировка** (TASK-207, ADR-0004, ADR-0117):

- **«Рекомендуемые» (без `sort`)** — полный promotion-приоритет:
  `effective_tier DESC, created_at DESC, id DESC` (`VIP > TOP > NORMAL`,
  time-guarded: `promotion_expires_at > now()`, иначе `NORMAL`).
- **Явный `sort`** (`price_asc`/`price_desc`/`area_desc`/`date_desc`) — **гибрид**
  (ADR-0117): топ-**3** промо (по тиру) закреплены в начале 1-й страницы как
  «витрина», остальное **строго** по выбранному ключу — промо НЕ доминирует над
  всей выдачей. Закреплённые исключены из основного потока на всех страницах (без
  дублей).

Ключ по `sort`:
- `date_desc` — `created_at DESC` (умолчание при отсутствии `sort`)
- `price_asc` / `price_desc` — по цене, **нормализованной в USD по текущему курсу
  ЦБУ** (UZS делится на курс; USD как есть), чтобы UZS/USD сравнивались по реальной
  стоимости; курса нет → деградация к сырой цене
- `area_desc` — `area DESC`; объявления без площади (`area = NULL`) — последними

Tie-break по `id DESC` гарантирует детерминированность keyset-пагинации. На 1-й
странице явной сортировки выдача = закреплённое промо (≤3) + страница потока,
поэтому может содержать до 3 элементов сверх `limit`.

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
Агрегаты кластерной сетки карты для широких зумов (схема Zillow/Airbnb,
TASK-225, ADR-0126) — вместо страницы листингов отдаёт ячейки сетки с числом
объявлений и ценовыми агрегатами; клиент рисует кластерные кружки и при
< ~200 объектов в боксе переключается на обычные пины `/search/bounds`.
Auth: **public**.

Query: `sw_lat`, `sw_lng`, `ne_lat`, `ne_lng`, `zoom` (0..22, обязателен),
`currency` (валюта ценовых агрегатов, default `USD`) + любые фильтры из §9.
`limit`/`cursor`/`sort` наследуются DTO, но игнорируются
— ответ не пагинируется (агрегат, не список).

```text
GET /api/v1/search/clusters?sw_lat=41.0&sw_lng=69.0&ne_lat=41.6&ne_lng=69.5&zoom=5
```

**Сетка.** `GROUP BY ST_SnapToGrid(location::geometry, cell, cell)`, где
`cell = 360 / 2^zoom / 8` градусов (~8 ячеек на тайл 256px — плотность
supercluster). Координата ячейки в ответе — центроид (avg) координат её
листингов, а не угол/узел сетки. bbox-фильтр — как у `/search/bounds`:
чанкованный geography-префильтр (TASK-226, широкие bbox режутся на куски
≤ 90° по долготе) + точный `ST_Within`.

200:
```json
{
  "data": [
    { "latitude": 41.315, "longitude": 69.281, "count": 42,
      "min_price": 45000.5, "avg_price": 78250.0 }
  ],
  "currency": "USD"
}
```
`min_price`/`avg_price` FX-нормализуются к `currency` (query-параметр,
default `USD`) по текущему курсу ЦБУ — та же логика, что и ценовой фильтр §9
(`priceInCurrencySql`); если строки курса нет, цены отдаются сырыми, без
конвертации (деградация как в ADR-0117). Ответ не пагинируется; guard
`LIMIT 2000` ячеек по `count DESC` защищает от патологического bbox×zoom
(вся планета на максимальном зуме).
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
PROMOTION_ACTIVATED | PROMOTION_EXPIRED | AGENT_APPLICATION_RESOLVED`. Каналы:
`EMAIL | PUSH | IN_APP`. MVP надёжно доставляет `EMAIL + IN_APP`; `PUSH`
(FCM/APNs) — задокументированный stub через реестр устройств (ADR-010).
Фактический набор каналов на тип задаёт routing-конфиг
(`notification-routing.ts`); большинство типов идут в `EMAIL + IN_APP`,
`AGENT_APPLICATION_RESOLVED` (решение по заявке «Стать агентом», ADR-0140,
§21) — **только `IN_APP`** (`data_json: { application_id, status,
reject_reason }`). Все отправки — BullMQ-джобы.

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
Регистрация push-устройства (stub, ADR-0010 / ADR-0098). Auth: **Bearer**.
> ⏳ **Planned — не реализовано в коде** (нет роута в `notifications.controller.ts`;
> push-доставка — stub, ADR-010). Появится вместе с push-воркером.

Регистрация push-устройства (stub, ADR-010). Auth: **Bearer**.
```json
{ "platform": "ANDROID", "push_token": "fcm:abc123..." }
```
`platform`: `ANDROID | IOS | WEB`. **Идемпотентно** по `push_token` (`UNIQUE`,
upsert): один и тот же токен клиент FCM/APNs переотправляет при каждом запуске и
ротации — повторная регистрация реактивирует строку (`is_active=true`,
`last_seen_at=now`) и переназначает её текущему пользователю (claim, если
устройство сменило аккаунт). Коллизии `UNIQUE (push_token)` не возникает —
`409` не возвращается.
201 → `{ "id": "dev1", "platform": "ANDROID", "is_active": true }`.

### DELETE /api/v1/notifications/devices/:id
Отвязать своё устройство (**hard delete** — строка удаляется, токен освобождается
для повторной регистрации). Auth: **владелец**; чужое/несуществующее → `404`. → `204`.
> ⏳ **Planned — не реализовано в коде** (см. `POST …/devices` выше).

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

#### GET /api/v1/admin/sms-settings
Текущее состояние отправки SMS. Auth: **ADMIN** (ADR-0090).
200:
```json
{ "smsEnabled": true }
```
Значение: строка `app_settings['sms_enabled']` если задана, иначе env-дефолт
`ESKIZ_ENABLED` (не задан → `true`).

#### PATCH /api/v1/admin/sms-settings
Включить/выключить отправку SMS в рантайме (без пересборки). Auth: **ADMIN**.
Персистит в `app_settings`, пишет `audit_logs(SMS_SETTINGS_UPDATE)`. При
выключенном канале `POST /auth/otp/request` с `channel:"SMS"` отвечает
`503 AUTH_PROVIDER_UNAVAILABLE` (§3), чтобы клиент предложил другой канал.
```json
{ "enabled": false }
```
200 → `{ "smsEnabled": false }`. Errors: `400 VALIDATION_ERROR`.

---

## 16. Moderation & admin

Все листинги проходят moderation queue. Каждое действие логируется
(`moderation_logs` + `audit_logs(LISTING_STATUS_CHANGE)`). Auth: **MODERATOR /
ADMIN**.

### GET /api/v1/admin/listings
Очередь модерации и админ-список. Query: `status` (например `NEW`),
`property_type`, `transaction_type`, `reference` (точный поиск по номеру
объявления, ADR-0137), `q`, `page`, `limit`.
```text
GET /api/v1/admin/listings?status=NEW
GET /api/v1/admin/listings?reference=100042
```
200 → пагинированный список листингов (любые статусы). Каждый элемент несёт
`owner_id`, `created_at`, `published_at`, `photo_url` (обложка) и инлайн-профиль
автора `owner` (ADR-0084) — чтобы карточка модерации показывала «кто и когда
создал» без ADMIN-only `GET /admin/users/:id`:
```json
{
  "id": "l1",
  "reference": 100042,
  "status": "NEW",
  "owner_id": "u1",
  "created_at": "2026-06-02T08:00:00Z",
  "published_at": null,
  "photo_url": "https://cdn/listings/l1/cover.jpg?...",
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
optional response field (non-breaking, §14). `photo_url` — свежий URL первой
фотографии по `sort_order` (sign-on-read, ADR-0086) или `null`, если фото нет;
тоже optional response field (non-breaking, §14, ADR-0101).

### PATCH /api/v1/admin/listings/:id/status
Сменить статус (модерация). Auth: **MODERATOR / ADMIN**. Действие — одно из
`moderation_action`: `APPROVE | SEND_TO_DRAFT | REJECT | DELETE`. Маппинг на
`listing_status`: `ACTIVE | DRAFT | REJECTED | DELETED`. `APPROVE` → `ACTIVE`
**требует наличия переводов на все языки** (UZ/RU/EN), иначе
`422 VALIDATION_ERROR` (ADR-0091); при успехе выставляет `published_at`.
Авто-перевод по очереди удалён — переводы создаёт модератор вручную через
`POST .../translations/generate` до публикации (см. ниже).
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
Errors: `403 FORBIDDEN`, `422 INVALID_STATUS_TRANSITION`,
`422 VALIDATION_ERROR` (нет переводов на все языки), `404 NOT_FOUND`.

### POST /api/v1/admin/listings/:id/translations/generate
Синхронно сгенерировать машинный перевод объявления на остальные языки
(ADR-0091). Auth: **MODERATOR / ADMIN**. Переводит `title/description/
address_note/features_text` с `original_language` на остальные (UZ/RU/EN);
**не перезаписывает** строки с `is_auto_translated=false` (ручные правки).
Идемпотентно. Тела запроса нет.
200 → тот же контракт, что `GET /listings/:id/translations` (полный набор с
`source`/`is_auto_translated`).
Errors: `403 FORBIDDEN`, `404 NOT_FOUND`, `502` (сбой провайдера перевода).

### PATCH /api/v1/admin/listings/:id/translations/:language
Ручная правка одного языкового перевода модератором (ADR-0091).
Auth: **MODERATOR / ADMIN**. `:language` ∈ `UZ|RU|EN`. Ставит
`is_auto_translated=false` (защищается при повторной генерации). Редактировать
`original_language` нельзя.
```json
{ "title": "...", "description": "...", "address_note": null, "features_text": null }
```
200 → полный набор переводов (как `GET /listings/:id/translations`).
Errors: `403 FORBIDDEN`, `404 NOT_FOUND`,
`422 VALIDATION_ERROR` (попытка править оригинальный язык).

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

### Blocks — блокировка пользователей

Блокировка пользователей (Apple Guideline 1.2, спека 2026-08-19). Auth:
**Bearer** (любая роль, `GUEST` без токена → `401`). Блок — направленный
(`blocker_id → blocked_id`), не взаимный: видит и разблокирует только
инициатор.

#### POST /api/v1/blocks
Заблокировать пользователя.
```json
{ "user_id": "u2" }
```
201 → `{ "id": "blk1", "user_id": "u2", "created_at": "2026-08-19T10:00:00Z" }`.
Повторный блок — идемпотентно `201` с той же строкой (unique
`(blocker_id, blocked_id)`, без TOCTOU-предпроверки, как favorites).
Errors: `400 VALIDATION_ERROR` (self-block), `404 NOT_FOUND` (нет пользователя
или он `DELETED`), `401` без токена.

#### DELETE /api/v1/blocks/:userId
Разблокировать. `204` всегда — идемпотентно, даже если блока не было.

#### GET /api/v1/blocks
Список заблокированных текущим пользователем, свежие сверху, без пагинации.
200 → `{ "data": [{ "user_id", "name", "avatar_url", "blocked_at" }] }`.

**Серверная фильтрация (эффект блока, без действий клиента):**
- все `/search*`, включая price-distribution — исключают объявления
  заблокированных авторов из выдачи и карты для авторизованного viewer'а;
- `GET /chat/threads` — скрывает тред у блокирующей стороны;
- отправка сообщения в тред при блоке в любую сторону → `403 FORBIDDEN`;
- создание **нового** треда (`POST /chat/threads`) под блоком → `403`; повторный
  `POST` на уже существующий тред проходит (это чтение, не создание);
- детальная страница листинга по прямой ссылке (`GET /listings/:id`) остаётся
  доступной — блок скрывает из discovery, не из прямого доступа;
- избранное (`/favorites`) и превью объявления в списке чатов **не
  фильтруются**.

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
200 → `{ listings_new, complaints_new, users_total, promotions_active,
listings_active, listings_archived, listings_sale, listings_rent,
agent_applications_new, support_requests_new }`:
- `listings_new` — листинги в очереди модерации (`ListingStatus.NEW`);
- `complaints_new` — необработанные жалобы (`ComplaintStatus.NEW`);
- `users_total` — все пользователи (как `meta.total` в `/admin/users` без фильтра);
- `promotions_active` — активные промо VIP/TOP (`PromotionStatus.ACTIVE`);
- `agent_applications_new` — заявки «Стать агентом» в очереди (`PENDING`);
- `support_requests_new` — новые обращения в поддержку (`SupportRequestStatus.NEW`).

#### GET /api/v1/admin/analytics
Ряды для графиков дашборда и лента «Последних действий» (ADR-0101). Auth:
**MODERATOR / ADMIN**. Без query-параметров. Везде исключён `DELETED`.
200 → `{ listings_over_time, buy_rent, by_district, recent_activity }`:
- `listings_over_time` — 12 помесячных счётчиков (старые→новые), включая нулевые
  месяцы: `[{ "month": "2025-07", "count": 5 }, …]`;
- `buy_rent` — сырые счётчики `{ "buy": 64, "rent": 36 }` (SALE/RENT); проценты
  считает клиент;
- `by_district` — топ-6 районов по числу объявлений с локализованными именами:
  `[{ "district_id": "d1", "name_ru": "Чиланзар", "name_uz": "Chilonzor", "name_en": "Chilanzar", "count": 21 }, …]`;
- `recent_activity` — последние 6 записей журнала модерации (свежие сверху):
  `[{ "id": "log1", "action": "APPROVE", "new_status": "ACTIVE", "listing_id": "l1", "listing_title": "2-комн квартира", "moderator_name": "Алишер У.", "created_at": "2026-06-20T10:00:00Z" }, …]`;
  `listing_title`/`moderator_name` — `null`, если перевода/имени нет.

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
| `TOUR_REQUEST_DUPLICATE` | 409 | Повторная своя активная заявка на тот же слот тура |
| `TOUR_SLOT_TAKEN` | 409 | Слот тура (листинг+дата+окно) занят чужой активной (PENDING/CONFIRMED) заявкой |
| `LISTING_NOT_AVAILABLE` | 422 | Листинг DELETED/непубличен (чат/действие невозможно) |
| `INVALID_STATUS_TRANSITION` | 422 | Недопустимый переход статуса листинга |
| `INVALID_PERIOD` | 422 | period_days не в {7,14,30} |
| `PROMOTION_NOT_ACTIVE` | 422 | Промо не в статусе ACTIVE (extend/cancel) |
| `UNSUPPORTED_FILTER_SCHEMA` | 422 | Неизвестный `schemaVersion` в filters_json |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | MIME вне allow-list (jpeg/png/webp) |
| `FILE_TOO_LARGE` | 413 | Превышен max размер файла |
| `MEDIA_LIMIT_EXCEEDED` | 422 | Превышено число файлов на листинг |
| `AGENT_APPLICATION_PENDING` | 409 | Заявка «Стать агентом» уже на рассмотрении |
| `ALREADY_AGENT` | 409 | У пользователя уже есть роль AGENT/AGENCY |
| `AMENITY_CODE_TAKEN` | 409 | `code` удобства уже занят (или не удалось сгенерировать slug из label_en) |
| `LEGAL_DRAFT_EXISTS` | 422 | Черновик этого типа документа уже существует; удалите его или опубликуйте перед созданием нового |
| `LEGAL_NOT_DRAFT` | 422 | Документ не в статусе DRAFT (операция доступна только для черновиков) |
| `LEGAL_TRANSLATIONS_INCOMPLETE` | 422 | Не все 6 полей (title_ru/uz/en, body_md_ru/uz/en) заполнены для публикации |
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
- **Realtime (foreground)**: socket.io-канал `/rt` с тонкими инвалидациями —
  §20 и `docs/GUIDE_MOBILE_REALTIME_WS.md`; фон остаётся за FCM.
- Полный мобильный гайд ведётся в `docs/MOBILE_API_GUIDE.md`.

---

## 19. Exchange rate (USD→UZS)

Курс ЦБ РУз (`cbu.uz`), обновляется ежедневно repeatable-джобой
`refresh_exchange_rate` (дефолт `0 6 * * *`, TZ `Asia/Tashkent`; env — `ENV.md`
§6.1). «Текущий курс» = последняя строка `exchange_rates` (история + ручной
оверрайд `source=MANUAL`). При сбое запроса к ЦБ последний курс сохраняется (новая
строка не пишется). **Только отображение**: нативная валюта листинга не меняется,
backend search не конвертирует цены (кросс-валютный фильтр — Phase 2). Клиент сам
переводит цены в выбранную валюту по этому курсу.

`ExchangeRateView` (везде ниже):
```json
{ "base": "USD", "quote": "UZS", "rate": "12650.180000", "fetched_at": "2026-06-19T06:00:00.000Z", "source": "CBU" }
```
`source`: `CBU` (из ЦБ) | `MANUAL` (ручной оверрайд админа).

### GET /api/v1/exchange-rate
Текущий курс USD→UZS. Auth: **public** (кэшируемый). `404` если курса ещё нет.
200 → `ExchangeRateView`.

### GET /api/v1/admin/exchange-rate
Текущий курс + недавняя история. Auth: **ADMIN**.
200:
```json
{ "current": { "base": "USD", "quote": "UZS", "rate": "12650.180000", "fetched_at": "2026-06-19T06:00:00.000Z", "source": "CBU" }, "history": [ /* …последние строки ExchangeRateView */ ] }
```

### PUT /api/v1/admin/exchange-rate
Ручной оверрайд курса. Auth: **ADMIN**. Вставляет строку `source=MANUAL` (становится
текущей) и пишет `audit_logs` (`action=EXCHANGE_RATE_MANUAL_SET`). Следующий
успешный прогон ЦБ заместит ручное значение.
Body: `{ "rate": "12700" }` — decimal до 6 знаков дроби. 200 → новый `ExchangeRateView`.

### POST /api/v1/admin/exchange-rate/refresh
Немедленный прогон обновления из ЦБ. Auth: **ADMIN**. 200 → текущий `ExchangeRateView`.

---

## 20. Realtime WebSocket (`/rt`)

Push-сигналы об устаревании данных чата/уведомлений/туров (ADR-0138). Это **не
REST** и не входит в `openapi.*.json` (OpenAPI не описывает WS): канал —
socket.io v4, namespace `/rt` на том же хосте, транспорт `websocket`, путь
engine.io стандартный `/socket.io/`.

Ключевой инвариант: сокет **не несёт данных** — только тонкий сигнал
инвалидации; источником истины остаются REST-эндпоинты этого документа.
Канал односторонний (сервер → клиент), клиентских событий нет.

**Auth** — access JWT (тот же, что REST) в `handshake.auth.token` (без
`Bearer `). Невалидный/протухший токен → немедленный disconnect; клиент
обновляет токен через `POST /auth/refresh` и переподключается. Успешный
handshake джойнит сокет в комнату `user:<id>` автоматически.

**Событие `invalidate`:**

```json
{ "type": "thread" | "thread_list" | "notification" | "tour", "id"?: "<uuid>" }
```

| `type` | Перезапросить |
|--------|---------------|
| `thread` (`id`=threadId) | `GET /chat/threads/{id}/messages` |
| `thread_list` | `GET /chat/threads` |
| `notification` | `GET /notifications` |
| `tour` | `GET /tour-requests/incoming` + `/outgoing` |

Сигнал шлётся **только получателю** (после commit транзакции): новое сообщение —
собеседнику; создание тура — владельцу листинга; смена статуса тура — второй
стороне. Пропущенные за разрыв события не реплеятся — при `connect`/reconnect
клиент обязан перезапросить все три подсистемы (gap-fill). Неизвестные значения
`type` игнорировать (канал расширяемый без версии).

WS — канал foreground; фон/закрытое приложение покрывает FCM push (§14).
Полный гайд для Flutter: `docs/GUIDE_MOBILE_REALTIME_WS.md`.

---

## 21. Agents & agent applications

Заявка «Стать агентом» (риелтор) + модерация + публичный каталог агентов
(ADR-0140). Лимит активных объявлений обычного клиента
(`app_settings.active_listing_limit`, default 2, `0` = без лимита) публичен в
`GET /api/v1/settings/public → activeListingLimit`; агент/агентство (роль
`AGENT`/`AGENCY`) публикуют без лимита. Бейдж «риелтор» на detail-странице
объявления — уже существующее поле `contact.type` (`owner`/`agent`/`agency`,
§7); отдельного поля `owner_is_agent` не добавлялось.

### POST /api/v1/users/me/agent-application
Подать заявку. Auth: **Bearer**. Анкета-минимум: имя/телефон/аватар берутся
из профиля пользователя.
```json
{ "agency_name": "Ideal Estate", "about": "10 лет на рынке недвижимости Ташкента" }
```
`agency_name` опционален (`null` — частный маклер, макс. 255 симв.); `about`
обязателен (макс. 2000 симв.).
201:
```json
{ "id": "aa1", "status": "PENDING", "agency_name": "Ideal Estate",
  "about": "10 лет на рынке недвижимости Ташкента", "reject_reason": null,
  "created_at": "2026-07-12T10:00:00Z", "resolved_at": null }
```
После `REJECTED` повторная подача разрешена — создаётся новая запись, история
предыдущих сохраняется. Errors: `400 VALIDATION_ERROR`,
`409 AGENT_APPLICATION_PENDING` (уже есть заявка на рассмотрении),
`409 ALREADY_AGENT` (уже есть роль `AGENT`/`AGENCY`, §17).

### GET /api/v1/users/me/agent-application
Последняя заявка текущего пользователя (любой статус). Auth: **Bearer**.
200 → тот же контракт, что ответ `POST` выше. Errors: `404 NOT_FOUND` (заявок
ещё не было, либо последняя заявка `APPROVED`, но роль `AGENT`/`AGENCY` с тех
пор отозвана админом — такая заявка считается историей и не блокирует
повторную подачу).

### GET /api/v1/admin/agent-applications
Модерационный список заявок. Auth: **MODERATOR / ADMIN**. Query: `status`
(`PENDING|APPROVED|REJECTED`), `page`, `limit`.
200 → пагинированный список; каждый элемент — контракт `POST` выше + заявитель
и модератор:
```json
{ "data": [ { "id": "aa1", "status": "PENDING", "agency_name": "Ideal Estate",
    "about": "10 лет на рынке недвижимости Ташкента", "reject_reason": null,
    "created_at": "2026-07-12T10:00:00Z", "resolved_at": null,
    "moderator_id": null,
    "user": { "id": "u1", "name": "Алишер Усманов", "phone": "+998901234567",
      "avatar_url": "https://cdn.avino.uz/u1/avatar.webp?..." } } ],
  "meta": { "page": 1, "limit": 20, "total": 1 } }
```
`user.avatar_url` — общий хелпер `resolveAvatarUrl` (ADR-0134): storageKey
(загружен через `POST /users/me/avatar`) → sign-on-read; иначе внешний
`avatarUrl` (Google/Apple) как есть; иначе `null`. `user.name` — `display_name`
профиля либо «first last», иначе `null`.

### POST /api/v1/admin/agent-applications/:id/approve
Одобрить заявку. Auth: **MODERATOR / ADMIN**. Тела запроса нет. В одной
транзакции: статус → `APPROVED` + `resolved_at`/`moderator_id`, выдаётся роль
`AGENT` (`upsert` — идемпотентно, переживает роль, выданную админом вручную
ранее), запись `audit_logs(ROLE_CHANGE)`, уведомление заявителю (см. ниже).
200 → тот же контракт, что элемент `GET /admin/agent-applications`.
Errors: `404 NOT_FOUND`, `422 INVALID_STATUS_TRANSITION` (заявка не в
`PENDING`, §17).

### POST /api/v1/admin/agent-applications/:id/reject
Отклонить заявку. Auth: **MODERATOR / ADMIN**.
```json
{ "reason": "Недостаточно данных для проверки" }
```
`reason` опционален (макс. 2000 симв.). 200 → тот же контракт, что approve.
Errors: `404 NOT_FOUND`, `422 INVALID_STATUS_TRANSITION`.

Approve/reject создают уведомление `AGENT_APPLICATION_RESOLVED` заявителю в
одной транзакции со сменой статуса (канал — **только `IN_APP`**, §14):
`data_json: { application_id, status, reject_reason }`.

### GET /api/v1/agents
Публичный каталог агентов. Auth: **public**. Агент — `ACTIVE`-пользователь с
ролью `AGENT`/`AGENCY`, независимо от того, назначена роль по одобренной
заявке или админом вручную напрямую. Query: `page`, `limit`. Сортировка — по
числу активных объявлений, убыв.
200:
```json
{ "data": [ { "id": "u1", "name": "Алишер Усманов",
    "avatar_url": "https://cdn.avino.uz/u1/avatar.webp?...",
    "agency_name": "Ideal Estate", "about": "10 лет на рынке недвижимости Ташкента",
    "active_listings_count": 14 } ],
  "meta": { "page": 1, "limit": 20, "total": 6 } }
```
`agency_name`/`about` — из последней `APPROVED`-заявки пользователя; `null`
для агентов, назначенных админом напрямую без заявки.

### GET /api/v1/agents/:id
Публичный профиль агента. Auth: **public**. 200 → контракт элемента
`GET /agents` + контакты (ADR-0155):
```json
{ "id": "u1", "name": "Алишер Усманов",
  "avatar_url": "https://cdn.avino.uz/u1/avatar.webp?...",
  "agency_name": "Ideal Estate", "about": "10 лет на рынке недвижимости Ташкента",
  "active_listings_count": 14,
  "phone": "+998901234567", "email": "agent@example.com" }
```
`phone` — по тому же правилу, что `contact.phone` в detail-ответе объявления
(§7): подтверждённый `contact_phone` профиля, иначе телефон аккаунта, иначе
`null`. `email` — e-mail аккаунта или `null`. Контакты отдаёт **только этот
эндпоинт**: в списке `GET /agents` их нет намеренно — иначе один запрос
выгружал бы телефоны и почты всех агентов сразу.
Errors: `404 NOT_FOUND` (пользователь не найден или не является агентом).

### Объявления агента — `GET /search?agent_id=`

Отдельного `GET /agents/:id/listings` нет: страница профиля агента
переиспользует публичный поиск (§9) с фильтром `agent_id` (значение —
`users.id` агента, применяется к `owner_id`). Параметр наследован во всех
гео-эндпоинтах (`/search/bounds`, `/search/radius`, `/search/near-me`,
`/search/polygon`, `/search/clusters`) — их DTO расширяют
`SearchListingsQueryDto`.
```text
GET /api/v1/search?agent_id=u1&transaction_type=SALE
```
200 → тот же envelope/card-shape, что `/search` (§9); только `status = ACTIVE`.

## 22. Amenities (справочник удобств)

Справочник удобств объявления (ADR-0111): таблица `amenities`
(`code`/`label_ru`/`label_uz`/`label_en`/`is_active`/`sort_order`), а не enum.
Soft-delete-only — скрытие через `PATCH { is_active:false }`, жёсткого `DELETE`
нет. Сортировка списков — `sort_order asc, code asc`.

Контракт элемента (везде одинаковый, snake_case):
```json
{ "id": "am1", "code": "PARKING", "label_ru": "Парковка",
  "label_uz": "Avtoturargoh", "label_en": "Parking",
  "is_active": true, "sort_order": 0 }
```

### GET /api/v1/amenities
Публичный список для форм/фильтров. Auth: **public**. Только `is_active =
true`. 200 → массив элементов (без пагинации).

### GET /api/v1/admin/amenities
Полный список (активные + скрытые). Auth: **ADMIN**. 200 → массив элементов.

### POST /api/v1/admin/amenities
Создать удобство. Auth: **ADMIN**.
```json
{ "label_ru": "Парковка", "label_uz": "Avtoturargoh", "label_en": "Parking",
  "sort_order": 0 }
```
`label_ru`/`label_uz`/`label_en` обязательны. `code` опционален — если не
передан, генерируется slug из `label_en` (UPPER_SNAKE, напр. `Video
surveillance` → `VIDEO_SURVEILLANCE`); если передан вручную — только
`A-Z0-9_`, начинается с буквы. `sort_order` (default `0`) и `is_active`
(default `true`) опциональны.
201 → созданный элемент. Errors: `400 VALIDATION_ERROR`,
`409 AMENITY_CODE_TAKEN` (`code` уже занят, §17).

### PATCH /api/v1/admin/amenities/:id
Править лейблы/порядок/видимость. Auth: **ADMIN**. `code` неизменяем — DTO его
не принимает.
```json
{ "is_active": false }
```
200 → обновлённый элемент. Errors: `400 VALIDATION_ERROR`,
`404 NOT_FOUND`.

## 23. Legal documents (версионированные юр-документы + согласие)

Юридические документы (Условия использования, Политика конфиденциальности) —
версионируемые многоязычные тексты. Хранятся в трёх локалях (uz/ru/en) и имеют
три статуса: DRAFT (в редакции), PUBLISHED (опубликована, заморожена),
ARCHIVED (заменена новой версией). Старая PUBLISHED версия при публикации новой
архивируется. При публикации с `requires_consent=true` бампится
`legal_consent_version` — все пользователи получат блок-модалку повторного согласия
при следующем входе.

Контракт полного документа (admin, snake_case):
```json
{
  "id": "uuid",
  "kind": "TERMS" | "PRIVACY",
  "version": 1,
  "status": "DRAFT" | "PUBLISHED" | "ARCHIVED",
  "published_at": "2026-07-21T12:00:00.000Z" | null,
  "created_at": "2026-07-20T12:00:00.000Z",
  "updated_at": "2026-07-21T12:00:00.000Z",
  "title_ru": "Условия использования",
  "title_uz": "Foydalanish shartlari",
  "title_en": "Terms of Use",
  "body_md_ru": "## Общие положения {#general}\nТекст раздела...",
  "body_md_uz": "## Umumiy qoidalar {#general}\nBo'lim matni...",
  "body_md_en": "## General provisions {#general}\nSection text..."
}
```

### GET /api/v1/legal/:kind
Получить опубликованную версию юр-документа одной локали. Auth: **public**.
`:kind` = `terms` или `privacy` (слаги, строчные). Accept-Language определяет
локаль (`uz*` → uz, `en*` → en, иначе ru; дефолт ru).

```bash
GET /api/v1/legal/terms
Accept-Language: ru-RU
```

200 → контракт одной локали:
```json
{
  "kind": "terms",
  "version": 1,
  "title": "Условия использования",
  "body_md": "## Общие положения {#general}\nТекст раздела...",
  "published_at": "2026-07-21T12:00:00.000Z"
}
```

404 → `{ "code": "NOT_FOUND", "message": "..." }` — пока нет опубликованной
версии или неизвестный kind (клиент должен иметь встроенный fallback).

### GET /api/v1/admin/legal-documents
Список всех версий (метаданные, без тел). Auth: **ADMIN**.

Query parameters:
- `?kind=TERMS` или `?kind=PRIVACY` — фильтр (опционально).

200 → массив элементов (без `title_*` и `body_md_*`):
```json
[
  {
    "id": "uuid",
    "kind": "TERMS",
    "version": 1,
    "status": "PUBLISHED",
    "published_at": "2026-07-21T12:00:00.000Z",
    "created_at": "2026-07-20T12:00:00.000Z",
    "updated_at": "2026-07-21T12:00:00.000Z"
  },
  {
    "id": "uuid",
    "kind": "TERMS",
    "version": 2,
    "status": "DRAFT",
    "published_at": null,
    "created_at": "2026-07-21T13:00:00.000Z",
    "updated_at": "2026-07-21T13:00:00.000Z"
  }
]
```

### GET /api/v1/admin/legal-documents/:id
Получить полный документ (все 3 локали + метаданные). Auth: **ADMIN**.

```bash
GET /api/v1/admin/legal-documents/uuid
```

200 → полный контракт (см. выше). Errors: `404 NOT_FOUND`.

### POST /api/v1/admin/legal-documents
Создать черновик (DRAFT). Копирует тексты из последней PUBLISHED версии
(если существует). Auth: **ADMIN**.

Request body:
```json
{ "kind": "TERMS" }
```

`kind` обязателен (TERMS или PRIVACY).

201 → новый DRAFT контракт. Errors: `422 LEGAL_DRAFT_EXISTS` (черновик по этому
типу уже существует; удалите старый или опубликуйте его перед созданием нового),
`400 VALIDATION_ERROR`.

### PATCH /api/v1/admin/legal-documents/:id
Редактировать тексты DRAFT версии (любое подмножество 6 полей). Auth: **ADMIN**.

Request body (опциональные поля):
```json
{
  "title_ru": "...",
  "title_uz": "...",
  "title_en": "...",
  "body_md_ru": "...",
  "body_md_uz": "...",
  "body_md_en": "..."
}
```

DTO допускает пустые строки — гейт непустоты применяется только при публикации
(см. ниже `POST .../publish`, `422 LEGAL_TRANSLATIONS_INCOMPLETE`), не на PATCH.

200 → обновлённый документ. Errors: `422 LEGAL_NOT_DRAFT` (документ не черновик,
статус не DRAFT), `404 NOT_FOUND`.

### POST /api/v1/admin/legal-documents/:id/publish
Опубликовать DRAFT версию. Старая PUBLISHED архивируется (status → ARCHIVED),
новая получает version = max+1. При `requires_consent=true` также бампится
`legal_consent_version`. Auth: **ADMIN**.

Request body:
```json
{ "requires_consent": true }
```

`requires_consent` обязателен (boolean: true или false). При `true` бампится
`legal_consent_version`, что приведёт к блок-модалке согласия для всех пользователей
при следующем входе.

201 → опубликованный документ (status = PUBLISHED, version увеличена).
Errors: `422 LEGAL_NOT_DRAFT` (только черновики можно публиковать),
`422 LEGAL_TRANSLATIONS_INCOMPLETE` (не все 6 полей title_*/body_md_* непусты),
`404 NOT_FOUND`.

### DELETE /api/v1/admin/legal-documents/:id
Удалить DRAFT версию. Auth: **ADMIN**.

```bash
DELETE /api/v1/admin/legal-documents/uuid
```

204 → успешно удалён. Errors: `422 LEGAL_NOT_DRAFT` (только черновики можно
удалять), `404 NOT_FOUND`.
