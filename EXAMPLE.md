# EXAMPLE.md — Создание объявления: единый контракт для всех клиентов

Этот документ показывает **как именно web-клиент создаёт объявление** через API, и формализует
поток так, чтобы **mobile-приложение (iOS / Android) слало точно такой же запрос** — те же поля,
те же форматы, та же последовательность. Цель: объявление, созданное с телефона, неотличимо
от созданного из браузера.

> **Источник правды — не UI, а DTO бэкенда** (`apps/api/src/listings/dto/create-listing.dto.ts`).
> Web-клиент — лишь один из потребителей этого контракта; mobile должен опираться на тот же DTO.
> Полный справочник маршрутов — `docs/API.md` и `apps/api/openapi.public.json`; свежие изменения —
> `LAST_CHANGED_API.md`.

---

## 0. TL;DR — золотое правило

1. **Авторизация** → получаем `access_token` (Bearer JWT).
2. **`POST /api/v1/listings`** с телом объявления → в ответ приходит `id` и `status: "NEW"`.
3. **Для каждого фото** (по очереди): **`POST /api/v1/listings/{id}/media`**, `multipart/form-data`,
   поле `file`. Первое загруженное фото = обложка (`sort_order: 0`).
4. (Опц.) **`PATCH /api/v1/listings/{id}/media/reorder`** — изменить порядок/обложку.

Новое объявление создаётся со статусом **`NEW`** и попадает в очередь модерации (публикация = `ACTIVE`
делает модератор). Сначала создаётся объявление, **потом** к нему грузятся фото (media-эндпоинту нужен
`listingId`) — иначе нельзя.

**Базовые правила контракта (одинаковы для web и mobile):**

| Правило | Значение |
|---|---|
| Base URL + версия | `<host>/api/v1` (префикс `api` + версия `1` в URI) |
| Регистр полей тела | **snake_case** (`transaction_type`, `property_type`, `lot_area`, …) |
| Деньги и площади | **строка-Decimal**, никогда не число: `"4500000"` / `"62.5"` (не `4500000`) |
| Авторизация | заголовок `Authorization: Bearer <access_token>` |
| Тело create | `Content-Type: application/json` |
| Тело media | `Content-Type: multipart/form-data` (boundary ставит HTTP-клиент сам) |
| Язык ответов/ошибок | `Accept-Language: uz | ru | en` (для `GET /search` обязателен) |
| Лишние поля | **отвергаются → 400** (`whitelist + forbidNonWhitelisted`). Шлите только поля из DTO. |
| Неизвестный enum | → **400** |

---

## 1. Шаг 0 — авторизация (получить JWT)

Любой авторизованный пользователь может создавать объявления (роль `OWNER` присваивается при первом
объявлении). Токен получают одним из способов: OTP (SMS/email), Google, Apple.

### 1.1. OTP — запрос кода

```
POST /api/v1/auth/otp/request
Content-Type: application/json

{
  "channel": "SMS",                 // SMS | EMAIL
  "destination": "+998901234567"    // телефон (E.164) или email, ≤255 символов
}
```

> Куда приходит код: на staging — в SMS/email/Telegram-алерт; в dev — печатается в логи api-контейнера.
> Rate-limit: при превышении — **429**.

### 1.2. OTP — подтверждение → токены

```
POST /api/v1/auth/otp/verify
Content-Type: application/json

{
  "channel": "SMS",
  "destination": "+998901234567",
  "code": "123456"                  // ровно 6 цифр
}
```

**Ответ `200`:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "phone": "+998901234567",
    "email": null,
    "default_language": "RU",
    "status": "ACTIVE",
    "roles": ["USER"],
    "is_phone_verified": true,
    "is_email_verified": false
  }
}
```

`access_token` кладём в заголовок `Authorization` всех последующих запросов. Когда он истекает
(`expires_in`, секунды) — обновляем через `POST /api/v1/auth/refresh` с телом `{ "refresh_token": "..." }`
(в ответ — новая пара токенов; старый refresh после ротации недействителен).

### 1.3. Соц-логин (альтернатива OTP)

```
POST /api/v1/auth/google      { "id_token": "<Google ID token>" }
POST /api/v1/auth/apple       { "id_token": "<Apple ID token>", "first_name": "...", "last_name": "..." }
```

Ответ — такой же, как у `otp/verify` (пара токенов + `user`). Для Apple `first_name`/`last_name`
приходят только при первом входе и опциональны.

---

## 2. Шаг 1 — создать объявление (`POST /api/v1/listings`)

### 2.1. Поля тела запроса

> Полное определение: `apps/api/src/listings/dto/create-listing.dto.ts`.

| Поле | Обяз. | Тип | Формат / ограничения |
|---|:---:|---|---|
| `transaction_type` | ✅ | enum | `SALE` \| `RENT` |
| `property_type` | ✅ | enum | `APARTMENT` \| `HOUSE` \| `NEW_BUILDING` \| `LAND` \| `COMMERCIAL` |
| `original_language` | ✅ | enum | `UZ` \| `RU` \| `EN` — язык, на котором автор пишет объявление |
| `price` | ✅ | string | Decimal: до 12 цифр целой части и до 2 дробных (`"4500000"`, `"125000.50"`) |
| `currency` | ✅ | enum | `UZS` \| `USD` |
| `translation` | ✅ | object | авторский текст на `original_language` (см. ниже) |
| `area` | — | string | Decimal, **м²** |
| `lot_area` | — | string | Decimal, **соток** — для `HOUSE` / `LAND` |
| `rooms` | — | int | 0…32767 (для студии шлём `0`) |
| `bathrooms` | — | int | 0…32767 |
| `parking_type` | — | enum | `YARD` \| `COVERED` \| `GARAGE` \| `UNDERGROUND` |
| `amenities` | — | enum[] | массив `Amenity` (см. ниже) |
| `floor` | — | int | 0…32767 |
| `total_floors` | — | int | 0…32767 |
| `year_built` | — | int | 0…32767 |
| `address` | — | string | ≤500 символов |
| `city_id` | — | uuid | **сюда кладётся UUID региона** (см. §2.3) |
| `district_id` | — | uuid | UUID района |
| `agency_id` | — | uuid | UUID агентства (если от агентства) |
| `latitude` | — | string | широта, только из map-picker (не из EXIF фото) |
| `longitude` | — | string | долгота |
| `tours_enabled` | — | bool | включить запись на просмотр |
| `tour_windows` | — | object[] | до 6 окон `{ "start": "HH:MM", "end": "HH:MM" }` |

**Вложенный объект `translation`:**

| Поле | Обяз. | Тип | Ограничения |
|---|:---:|---|---|
| `title` | ✅ | string | ≤255 символов |
| `description` | — | string | многострочный текст |
| `address_note` | — | string | заметка к адресу |
| `features_text` | — | string | произвольный текст «об особенностях» |

> Машинные переводы на остальные 2 языка генерируются автоматически **после** одобрения модератором —
> клиент их не шлёт.

### 2.2. Справочник enum-значений (отправлять ровно эти строки)

```
TransactionType : SALE | RENT
PropertyType    : APARTMENT | HOUSE | NEW_BUILDING | LAND | COMMERCIAL
Currency        : UZS | USD
Language        : UZ | RU | EN
ParkingType     : YARD | COVERED | GARAGE | UNDERGROUND
Amenity         : AIR_CONDITIONING | FURNITURE | APPLIANCES | INTERNET |
                  ELEVATOR | BALCONY | HEATING | SECURITY
OtpChannel      : SMS | EMAIL
```

**Условная видимость полей (как делает web, повторить на mobile):**
- `LAND` / `COMMERCIAL` → **не шлём** `rooms`, `bathrooms`, `floor`, `total_floors`.
- `lot_area` имеет смысл только для `HOUSE` / `LAND`.
- `parking_type` опускаем целиком, если парковки нет (не шлём пустую строку).

### 2.3. Локация: что именно слать

- **Координаты** `latitude` / `longitude` — строки, берутся **только из карты** (map-picker), не из EXIF.
  Серверный триггер сам соберёт из них PostGIS-точку `location` для гео-поиска — клиент `location` не шлёт.
- **Регион и район** выбираются каскадом:
  - `GET /api/v1/geo/regions` → список регионов `{ id, code, name_uz, name_ru, name_en }`.
  - `GET /api/v1/geo/districts?region_id=<uuid>` → районы выбранного региона.
  - ⚠️ В теле create **UUID региона кладётся в `city_id`**, UUID района — в `district_id`.
    Отдельного поля `region_id` у create-эндпоинта нет (оно есть только в фильтрах `GET /search`).

### 2.4. Полный пример тела (то, что строит web-клиент)

```json
{
  "transaction_type": "SALE",
  "property_type": "APARTMENT",
  "original_language": "RU",
  "price": "4500000",
  "currency": "UZS",
  "translation": {
    "title": "2-комн квартира в центре",
    "description": "Светлая, тёплая, рядом метро.",
    "address_note": "Yunusobod 12-23"
  },
  "area": "62",
  "rooms": 2,
  "bathrooms": 1,
  "floor": 4,
  "total_floors": 9,
  "year_built": 2018,
  "city_id": "c0000001-0000-0000-0000-000000000000",
  "district_id": "d0000001-0000-0000-0000-000000000000",
  "address": "Yunusobod 12-23",
  "latitude": "41.350000",
  "longitude": "69.290000",
  "parking_type": "GARAGE",
  "amenities": ["AIR_CONDITIONING", "ELEVATOR"],
  "tours_enabled": true,
  "tour_windows": [
    { "start": "09:00", "end": "12:00" },
    { "start": "14:00", "end": "17:00" }
  ]
}
```

**curl:**

```bash
curl -X POST "$BASE/api/v1/listings" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept-Language: ru" \
  -d @listing.json
```

**Ответ `201`** (краткая карточка, Decimal/даты — строки):

```json
{
  "id": "0a3b2c10-1111-2222-3333-444455556666",
  "status": "NEW",
  "transaction_type": "SALE",
  "property_type": "APARTMENT",
  "original_language": "RU",
  "price": "4500000.00",
  "currency": "UZS",
  "created_at": "2026-06-29T15:30:45.123Z"
}
```

Из ответа берём `id` — он нужен для загрузки фото.

---

## 3. Шаг 2 — загрузка фото (`POST /api/v1/listings/{id}/media`)

Фото грузятся **прокси-загрузкой через API** (`multipart/form-data`), **не** напрямую в облако.
(Прямая загрузка по presigned-URL в R2 — целевой план на будущее; в текущем MVP так.)

```
POST /api/v1/listings/{id}/media
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

  поле: file = <бинарные данные изображения>
```

**Ограничения:**

| Параметр | Значение |
|---|---|
| Имя поля | `file` (ровно одно изображение за запрос) |
| MIME | `image/jpeg`, `image/png`, `image/webp` |
| Размер | ≤ **10 MiB** на файл |
| Кол-во | ≤ **20** медиа на объявление |

Грузим **по одному фото за запрос, по очереди**. Порядок загрузки = порядок в галерее; первое = обложка.
Если одно фото не загрузилось — web-клиент не валит весь процесс, а считает количество ошибок и
показывает объявление как опубликованное. Повторить такое поведение на mobile.

**Ответ `201` (один медиа-объект):**

```json
{
  "id": "9f1e...",
  "url": "https://<r2-signed-url>/.../1.jpg",
  "thumbnail_url": "https://<r2-signed-url>/.../1_thumb.jpg",
  "sort_order": 0,
  "type": "IMAGE"
}
```

**curl:**

```bash
curl -X POST "$BASE/api/v1/listings/$LISTING_ID/media" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@photo1.jpg;type=image/jpeg"
```

> **Важно про `url`/`thumbnail_url`:** это **presigned-ссылки с TTL (~1 ч)**, заново подписываются
> при каждом чтении из `storage_key`. **Не кэшируйте URL надолго** — берите свежий из ответа `GET`.

**Изменить порядок / обложку** (опционально):

```
PATCH /api/v1/listings/{id}/media/reorder
{ "order": ["<mediaId-2>", "<mediaId-1>", "<mediaId-3>"] }
```

Массив `order` — полная перестановка id всех медиа объявления; первый = новая обложка.
Удалить фото: `DELETE /api/v1/listings/{id}/media/{mediaId}` → `204`.

---

## 4. Полная последовательность (end-to-end)

Как web-клиент выполняет «нажал Опубликовать»:

```
1. POST /api/v1/auth/otp/verify         → { access_token, ... }        (один раз, токен переиспользуется)

2. POST /api/v1/listings                → { id: "<L>", status: "NEW" }
        body = собранное тело объявления (см. §2.4)

3. POST /api/v1/listings/<L>/media       (фото №1, multipart, file)     → { id, sort_order: 0, ... }
4. POST /api/v1/listings/<L>/media       (фото №2)                       → { sort_order: 1, ... }
5. POST /api/v1/listings/<L>/media       (фото №3)                       → { sort_order: 2, ... }
   ... по одному на каждое фото, по очереди ...

6. (опц.) PATCH /api/v1/listings/<L>/media/reorder   { order: [...] }

→ Готово. Объявление в статусе NEW, ждёт модерации.
```

---

## 5. Маппинг «значение UI → поле API» (чтобы mobile слал идентично web)

Web собирает тело функцией `buildListingBody()` в
`apps/client/src/features/listing-new/ListingNew.tsx`. Mobile должен повторить те же преобразования,
чтобы payload совпадал с точностью до поля:

| Значение в UI | Поле API | Преобразование |
|---|---|---|
| тип сделки `SALE`/`RENT` | `transaction_type` | без изменений |
| тип `APARTMENT`/… | `property_type` | без изменений |
| язык `RU`/`UZ`/`EN` | `original_language` | без изменений |
| цена «4 500 000» | `price` | вычистить всё кроме цифр и точки → строка `"4500000"` |
| валюта `USD`/`UZS` | `currency` | без изменений |
| заголовок | `translation.title` | `.trim()` |
| описание | `translation.description` | `.trim()`, пусто → не слать |
| адрес | `address` **и** `translation.address_note` | `.trim()` (web дублирует адрес в заметку) |
| комнаты «студия» | `rooms` | `studio → 0` |
| комнаты «2», «5+» | `rooms` | `parseInt` (`5+ → 5`) |
| санузлы «4+» | `bathrooms` | `parseInt` (`4+ → 4`) |
| площадь «62» | `area` | строка как есть |
| участок «0.5» | `lot_area` | строка как есть (соток) |
| этаж/этажность/год | `floor` / `total_floors` / `year_built` | `parseInt` |
| координаты `[41.35, 69.29]` | `latitude` / `longitude` | каждое → строка (`String()`) |
| регион (UUID) | `city_id` | без изменений ⚠️ (регион → `city_id`) |
| район (UUID) | `district_id` | без изменений |
| парковка `''` (нет) | `parking_type` | пусто → **не слать**; иначе значение enum |
| удобства | `amenities` | массив enum как есть (нет — `[]` или не слать) |
| тур вкл/окна | `tours_enabled` / `tour_windows` | без изменений |

**Условные поля:** для `LAND`/`COMMERCIAL` web вообще не добавляет в тело `rooms`, `bathrooms`,
`floor`, `total_floors` — mobile тоже не должен.

---

## 6. Коды ошибок (чек-лист интеграции)

| Код | Когда | Что делать на клиенте |
|---|---|---|
| `400` `VALIDATION_ERROR` | плохой формат, неизвестный enum, **лишнее поле**, отсутствует обязательное | проверить тело по §2.1; не слать поля вне DTO |
| `401` | нет/протух `access_token` | обновить через `auth/refresh`, затем повторить |
| `403` | правка/медиа чужого объявления | объявление принадлежит другому пользователю |
| `413` | фото > 10 MiB | сжать/уменьшить перед загрузкой |
| `415` `UNSUPPORTED_MEDIA_TYPE` | MIME не из allow-list | только jpeg/png/webp |
| `422` | > 20 медиа, либо невалидный переход статуса | ограничить число фото |
| `429` | rate-limit (OTP, соц-логин) | подождать и повторить |

**Формат тела ошибки** (envelope един для API):

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Invalid request body",
  "details": [
    { "field": "translation.title", "issue": "title must be a string" },
    { "field": "price", "issue": "price must be a decimal string with up to 2 fraction digits" }
  ],
  "request_id": "f1e2d3c4-..."
}
```

Вложенные поля адресуются через точку (`translation.title`). `request_id` дублируется в заголовке
ответа — указывайте его в баг-репортах.

---

## 7. Чек-лист для mobile-разработчика

- [ ] Base URL берётся из конфигурации, суффикс **всегда** `/api/v1`.
- [ ] Все ключи тела — **snake_case**.
- [ ] `price` (и `area`/`lot_area`) — **строки**, не числа.
- [ ] enum-поля — ровно строки из §2.2 (верхний регистр).
- [ ] Не слать поля вне DTO (иначе `400`).
- [ ] Последовательность: токен → `POST /listings` → `id` → `POST .../media` по одному фото.
- [ ] Координаты только из карты, не из EXIF.
- [ ] Регион → `city_id`, район → `district_id` (поля `region_id` на create нет).
- [ ] Фото: поле `file`, ≤10 MiB, jpeg/png/webp, ≤20 шт.; первое = обложка.
- [ ] presigned `url`/`thumbnail_url` не кэшировать дольше ~часа.
- [ ] Частичный сбой загрузки фото не должен «ронять» создание объявления.

---

### Ссылки на источники правды

| Что | Файл |
|---|---|
| Тело create (DTO) | `apps/api/src/listings/dto/create-listing.dto.ts` |
| enum-ы | `apps/api/prisma/schema.prisma` |
| Контроллер listings | `apps/api/src/listings/listings.controller.ts` |
| Контроллер media | `apps/api/src/listing-media/listing-media.controller.ts` |
| Авторизация | `apps/api/src/auth/auth.controller.ts` |
| Сборка тела на web | `apps/client/src/features/listing-new/ListingNew.tsx` (`buildListingBody`) |
| RTK-мутации web | `apps/client/src/store/api/createListingApi.ts` |
| Полный справочник API | `docs/API.md`, `apps/api/openapi.public.json` |
| Свежие изменения API | `LAST_CHANGED_API.md` |
