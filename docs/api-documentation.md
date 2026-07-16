# Avino API — документация для мобильных разработчиков (Flutter)

> Полный справочник публичного REST API портала недвижимости **Avino** (Узбекистан).
> Ориентирован на интеграцию Flutter-приложения. Для каждого эндпоинта указаны метод, URL,
> параметры (query/path/body) с Dart-типами и обязательностью, форматы успешных ответов и ошибок,
> требования к авторизации.
>
> Источник истины — контроллеры в `apps/api/src/**`. Документ описывает версию API **v1**.

---

## Содержание

- [Общие сведения](#общие-сведения)
- [Базовый URL и версионирование](#базовый-url-и-версионирование)
- [Авторизация (Bearer JWT)](#авторизация-bearer-jwt)
- [Формат ошибок](#формат-ошибок)
- [Языки и мультиязычность](#языки-и-мультиязычность)
- [Rate limiting](#rate-limiting)
- [Справочник enum-значений](#справочник-enum-значений)
- [Клиент на Dart: базовый набросок](#клиент-на-dart-базовый-набросок)
- **Модули API:**
  - [Auth (Аутентификация)](#auth-аутентификация)
  - [Listings (Объявления)](#listings-объявления)
  - [Listing Media (Фото)](#listing-media-фото)
  - [Translations (Переводы)](#translations-переводы)
  - [Promotions (VIP/TOP)](#promotions-viptop)
  - [Search (Поиск и фильтры)](#search-поиск-и-фильтры)
  - [Geo (Регионы и районы)](#geo-регионы-и-районы)
  - [Exchange Rate (Курс валют)](#exchange-rate-курс-валют)
  - [Users (Профиль)](#users-профиль)
  - [Favorites (Избранное)](#favorites-избранное)
  - [Saved Searches (Сохранённые поиски)](#saved-searches-сохранённые-поиски)
  - [Settings (Публичные настройки)](#settings-публичные-настройки)
  - [Roles (Роли)](#roles-роли)
  - [Chat (Чат)](#chat-чат)
  - [Notifications (Уведомления)](#notifications-уведомления)
  - [Tour Requests (Запросы на просмотр)](#tour-requests-запросы-на-просмотр)
  - [Complaints (Жалобы)](#complaints-жалобы)
  - [Health (Проверка доступности)](#health-проверка-доступности)

---

## Общие сведения

Avino — портал недвижимости для Узбекистана. Backend — NestJS + PostgreSQL/PostGIS + Redis + Prisma.
API спроектирован клиент-нейтрально и полностью пригоден для мобильного приложения (Flutter) наравне
с веб-клиентами.

- Все запросы и ответы — `application/json; charset=utf-8` (кроме загрузки фото — `multipart/form-data`).
- Именование полей в JSON — **snake_case** (`access_token`, `preferred_language`, `created_at`).
- Даты/время — строки ISO-8601 в UTC (`"2026-07-03T12:34:56.000Z"`). В Dart парси через `DateTime.parse()`.
- Денежные значения приходят «сырыми» (число + валюта); форматирование/конвертацию делает клиент.
- Геопоиск реализован на PostGIS; координаты — `latitude`/`longitude` (double).

---

## Базовый URL и версионирование

Все маршруты идут через глобальный префикс `api` и версию `v1`:

```
{BASE}/api/v1/<resource>
```

| Окружение | BASE |
|-----------|------|
| Локально  | `http://localhost:4000` |
| Staging   | `http://<staging-host>` (уточнить у Team Lead) |
| Prod      | `https://<prod-host>` |

Итоговый префикс всех эндпоинтов — `http://localhost:4000/api/v1`. Неверсионированные маршруты
запрещены. Breaking-изменения будут выходить в новую версию (`v2`); клиент всегда обращается только
к версионированным путям.

```dart
const String kApiBase = 'http://localhost:4000/api/v1';
```

---

## Авторизация (Bearer JWT)

Аутентификация — по паре токенов: короткоживущий **access_token** (JWT) и **refresh_token**.

**Как авторизовать запрос:** передавай access-токен в заголовке:

```
Authorization: Bearer <access_token>
```

**Уровни защиты эндпоинтов** (в каждом эндпоинте ниже поле **Авторизация**):

| Метка | Guard | Поведение |
|-------|-------|-----------|
| **Публичный** | нет | Токен не нужен. |
| **Bearer (обязательно)** | `JwtAuthGuard` | Без валидного токена → `401 UNAUTHORIZED`. |
| **Bearer (опционально)** | `OptionalJwtAuthGuard` | Без токена — доступ как гость; с токеном — расширенная видимость (например владелец видит свои непубличные объявления). Невалидный токен всё равно → `401`. |
| **Bearer + роли: …** | `JwtAuthGuard` + `RolesGuard` + `@Roles(...)` | Нужен токен И одна из перечисленных ролей, иначе `403 FORBIDDEN`. |

**Роли пользователей:** `GUEST` (неаутентифицированный, неявно), `USER`, `OWNER`, `AGENT`,
`AGENCY`, `LANDLORD`, `PROPERTY_MANAGER`, `MODERATOR`, `ADMIN`.

### Жизненный цикл сессии

1. Получить OTP: `POST /auth/otp/request` (SMS/email) — или войти через Google/Apple.
2. Подтвердить: `POST /auth/otp/verify` → пара токенов.
3. Использовать `access_token` в `Authorization` для защищённых запросов.
4. Когда access истёк (`401 TOKEN_EXPIRED`) — обновить пару: `POST /auth/refresh`.
5. Выйти: `POST /auth/logout` (отзывает всю session family).

> **Ротация refresh:** каждый `refresh` выдаёт новый refresh-токен и инвалидирует прежний.
> Повторное использование старого refresh-токена отзывает всю семью сессий (`TOKEN_REUSED`) —
> храни всегда только последний.

---

## Формат ошибок

Все ошибки возвращаются в едином конверте:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": [ { "field": "destination", "message": "..." } ],
    "request_id": "b3f1c2a4-...."
  }
}
```

- `code` — стабильный машинночитаемый код (см. таблицу ниже). Ориентируйся в клиенте на **`code`**, не на текст.
- `details` — опционально, чаще для `VALIDATION_ERROR` (список полей).
- `request_id` — идентификатор запроса для отладки/поддержки (дублируется в заголовке ответа).

### Коды ошибок

| Code | Типичный HTTP | Значение |
|------|---------------|----------|
| `VALIDATION_ERROR` | 400 | Невалидное тело/параметры (DTO). |
| `UNAUTHORIZED` | 401 | Нет/невалидный токен. |
| `TOKEN_INVALID` | 401 | Токен повреждён. |
| `TOKEN_EXPIRED` | 401 | Access/refresh истёк. |
| `TOKEN_REUSED` | 401 | Повторно использован ротированный refresh → сессия отозвана. |
| `OTP_INVALID` | 400/401 | Неверный OTP-код. |
| `OTP_EXPIRED` | 400/401 | OTP-код истёк. |
| `OTP_ATTEMPTS_EXCEEDED` | 429 | Исчерпаны попытки ввода OTP. |
| `RATE_LIMITED` | 429 | Превышен лимит запросов. |
| `USER_BLOCKED` | 403 | Пользователь заблокирован. |
| `AUTH_PROVIDER_UNAVAILABLE` | 503 | Google/Apple/SMS-провайдер не настроен. |
| `ACCOUNT_LINK_REQUIRED` | 409 | Требуется привязка аккаунта (email уже занят другим способом входа). |
| `FORBIDDEN` | 403 | Недостаточно прав/ролей. |
| `NOT_FOUND` | 404 | Ресурс не найден. |
| `CONTACT_TAKEN` | 409 | Телефон/email уже используется. |
| `ROLE_ALREADY_GRANTED` | 409 | Роль уже выдана. |
| `ALREADY_FAVORITED` | 409 | Объявление уже в избранном. |
| `DEVICE_TOKEN_EXISTS` | 409 | Push-токен устройства уже зарегистрирован. |
| `ACTIVE_PROMOTION_EXISTS` | 409 | По объявлению уже есть активное продвижение. |
| `LISTING_NOT_AVAILABLE` | 409 | Объявление недоступно (не ACTIVE). |
| `INVALID_STATUS_TRANSITION` | 422 | Недопустимый переход статуса. |
| `TOUR_REQUEST_DUPLICATE` | 409 | Дубликат запроса на просмотр. |
| `TOUR_SLOT_TAKEN` | 409 | Слот просмотра уже занят. |
| `CONSENT_INCOMPLETE` | 422 | Не приняты обязательные юр-согласия / нет всех переводов. |
| `INVALID_PERIOD` | 400 | Неверный период (продвижение/фильтр). |
| `PROMOTION_NOT_ACTIVE` | 409 | Продвижение неактивно. |
| `UNSUPPORTED_FILTER_SCHEMA` | 400 | Неподдерживаемая схема фильтра. |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Неподдерживаемый тип файла. |
| `FILE_TOO_LARGE` | 413 | Файл слишком большой. |
| `MEDIA_LIMIT_EXCEEDED` | 409 | Превышен лимит фото на объявление. |
| `INTERNAL_ERROR` | 500 | Внутренняя ошибка (детали только в логах). |

---

## Языки и мультиязычность

Поддерживаемые языки: **`UZ` | `RU` | `EN`**.

- Язык контента объявления клиент выбирает заголовком:
  ```
  Accept-Language: ru
  ```
- Для эндпоинтов поиска (`/search*`) **параметр `?lang` не поддерживается** и вернёт `400` —
  используй только заголовок `Accept-Language`.
- Объявление создаётся на одном языке (авторский перевод). Переводы на остальные языки генерирует
  модератор вручную; объявление публикуется (становится `ACTIVE`) только когда есть все три языка.

---

## Rate limiting

Действует глобальный throttling; на чувствительных auth-эндпоинтах — строже:

| Эндпоинт | Лимит |
|----------|-------|
| `POST /auth/otp/request` | 10 запросов / 60 сек |
| `POST /auth/otp/verify` | 10 запросов / 60 сек |
| `POST /auth/google`, `/auth/apple`, `/auth/refresh`, `/auth/logout` | 20 запросов / 60 сек |

При превышении — `429` с кодом `RATE_LIMITED`.

---

## Справочник enum-значений

| Enum | Значения |
|------|----------|
| **Language** | `UZ`, `RU`, `EN` |
| **UserStatus** | `ACTIVE`, `BLOCKED`, `DELETED` |
| **OtpChannel** | `SMS`, `EMAIL` |
| **ListingStatus** | `NEW`, `ACTIVE`, `DRAFT`, `REJECTED`, `DELETED`, `ARCHIVED`, `SOLD`, `RENTED` |
| **PropertyType** | `APARTMENT`, `HOUSE`, `NEW_BUILDING`, `LAND`, `COMMERCIAL` |
| **TransactionType** | `SALE`, `RENT` |
| **Currency** | `UZS`, `USD` |
| **ParkingType** | `YARD`, `COVERED`, `GARAGE`, `UNDERGROUND` |
| **Amenity** | `AIR_CONDITIONING`, `FURNITURE`, `APPLIANCES`, `INTERNET`, `ELEVATOR`, `BALCONY`, `HEATING`, `SECURITY`, `POOL` |
| **PromotionType** | `NORMAL`, `TOP`, `VIP` |
| **ComplaintStatus** | `NEW`, `IN_REVIEW`, `RESOLVED`, `REJECTED` |
| **TourRequestStatus** | `PENDING`, `CONFIRMED`, `DECLINED`, `CANCELLED` |
| **NotificationType** | `SAVED_SEARCH_NEW_LISTING`, `FAVORITE_PRICE_DROP`, `NEW_CHAT_MESSAGE`, `LISTING_MODERATION_STATUS_CHANGED`, `NEW_LEAD`, `PROMOTION_ACTIVATED`, `PROMOTION_EXPIRED`, `TOUR_REQUEST_STATUS_CHANGED`, `ADMIN_BROADCAST` |
| **DevicePlatform** | `ANDROID`, `IOS`, `WEB` |
| **TranslationSource** | `USER`, `GOOGLE`, `YANDEX` |

---

## Клиент на Dart: базовый набросок

Минимальный HTTP-клиент с Bearer-токеном и разбором конверта ошибок:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class AvinoApiException implements Exception {
  final int status;
  final String code;
  final String message;
  AvinoApiException(this.status, this.code, this.message);
  @override
  String toString() => 'AvinoApiException($status, $code): $message';
}

class AvinoApi {
  AvinoApi({required this.base, this.accessToken, this.lang = 'ru'});
  final String base;            // http://localhost:4000/api/v1
  String? accessToken;
  String lang;                  // uz | ru | en

  Map<String, String> _headers({bool json = true}) => {
        if (json) 'Content-Type': 'application/json',
        'Accept-Language': lang,
        if (accessToken != null) 'Authorization': 'Bearer $accessToken',
      };

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    final uri = Uri.parse('$base$path').replace(
      queryParameters: query?.map((k, v) => MapEntry(k, '$v')),
    );
    final res = await http.get(uri, headers: _headers(json: false));
    return _decode(res);
  }

  Future<dynamic> post(String path, {Object? body}) async {
    final res = await http.post(Uri.parse('$base$path'),
        headers: _headers(), body: body == null ? null : jsonEncode(body));
    return _decode(res);
  }

  dynamic _decode(http.Response res) {
    final data = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode >= 400) {
      final err = (data?['error'] ?? {}) as Map<String, dynamic>;
      throw AvinoApiException(
          res.statusCode, err['code'] ?? 'UNKNOWN', err['message'] ?? '');
    }
    return data;
  }
}
```

---

## Auth (Аутентификация)

Вход по OTP (SMS/email) или через Google/Apple. Успешный вход возвращает пару токенов + краткий
профиль пользователя. `access_token` кладётся в `Authorization: Bearer`, `refresh_token` хранится
для ротации.

**Общая форма токен-ответа** (`otp/verify`, `google`, `apple`):

```json
{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "eyJhbGciOi...",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": {
    "id": "uuid",
    "phone": "+99890...",
    "email": null,
    "default_language": "RU",
    "status": "ACTIVE",
    "roles": ["USER"],
    "is_phone_verified": true,
    "is_email_verified": false
  }
}
```

Dart-модель `user`: `id String`, `phone String?`, `email String?`, `default_language String (enum Language)`,
`status String (enum UserStatus)`, `roles List<String>`, `is_phone_verified bool`, `is_email_verified bool`.

### `POST /api/v1/auth/otp/request`
**Назначение:** запросить одноразовый код на телефон (SMS) или email.
**Авторизация:** Публичный. Rate limit: 10/60 сек.
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `channel` | `String` (enum `SMS` \| `EMAIL`) | да | Канал доставки кода. |
| `destination` | `String` (≤255) | да | Телефон в E.164 (для `SMS`) или email (для `EMAIL`). |

**Ответ (200):** метаданные доставки (канал, замаскированный получатель, TTL/время следующей отправки). Код в ответ не входит.
```json
{ "channel": "SMS", "destination": "+99890***4567", "expires_in": 300 }
```
**Ошибки:** `VALIDATION_ERROR` (400), `RATE_LIMITED` (429), `AUTH_PROVIDER_UNAVAILABLE` (503 — SMS-провайдер выключен).
**Пример (curl):**
```bash
curl -X POST http://localhost:4000/api/v1/auth/otp/request \
  -H 'Content-Type: application/json' \
  -d '{"channel":"SMS","destination":"+998901234567"}'
```

### `POST /api/v1/auth/otp/verify`
**Назначение:** подтвердить OTP-код и получить сессию (при первом входе создаётся пользователь).
**Авторизация:** Публичный. Rate limit: 10/60 сек.
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `channel` | `String` (enum `SMS` \| `EMAIL`) | да | Тот же канал, что и в request. |
| `destination` | `String` (≤255) | да | Тот же контакт. |
| `code` | `String` (ровно 6 символов) | да | 6-значный OTP-код. |

**Ответ (200):** пара токенов + `user` (см. общую форму выше). HTTP-код принудительно `200`.
**Ошибки:** `VALIDATION_ERROR` (400), `OTP_INVALID`, `OTP_EXPIRED`, `OTP_ATTEMPTS_EXCEEDED` (429), `USER_BLOCKED` (403), `RATE_LIMITED` (429).
**Пример (curl):**
```bash
curl -X POST http://localhost:4000/api/v1/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"channel":"SMS","destination":"+998901234567","code":"123456"}'
```

### `POST /api/v1/auth/google`
**Назначение:** вход через Google (ID-token из Google Identity Services); первый вход = регистрация.
**Авторизация:** Публичный. Rate limit: 20/60 сек.
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `id_token` | `String` | да | Google ID-token, полученный на клиенте. |

**Ответ (200):** пара токенов + `user` (общая форма).
**Ошибки:** `VALIDATION_ERROR` (400), `AUTH_PROVIDER_UNAVAILABLE` (503 — Google не настроен), `USER_BLOCKED` (403), `ACCOUNT_LINK_REQUIRED` (409).
**Пример (curl):**
```bash
curl -X POST http://localhost:4000/api/v1/auth/google \
  -H 'Content-Type: application/json' -d '{"id_token":"<google-id-token>"}'
```

### `POST /api/v1/auth/apple`
**Назначение:** вход через Sign in with Apple (ID-token); первый вход = регистрация.
**Авторизация:** Публичный. Rate limit: 20/60 сек.
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `id_token` | `String` | да | Apple ID-token. |
| `first_name` | `String?` (≤100) | нет | Имя (Apple отдаёт только при первом входе; для посева профиля). |
| `last_name` | `String?` (≤100) | нет | Фамилия (только при первом входе). |

**Ответ (200):** пара токенов + `user` (общая форма).
**Ошибки:** `VALIDATION_ERROR` (400), `AUTH_PROVIDER_UNAVAILABLE` (503), `USER_BLOCKED` (403), `ACCOUNT_LINK_REQUIRED` (409).
**Пример (curl):**
```bash
curl -X POST http://localhost:4000/api/v1/auth/apple \
  -H 'Content-Type: application/json' \
  -d '{"id_token":"<apple-id-token>","first_name":"Ali","last_name":"Valiev"}'
```

### `GET /api/v1/auth/me`
**Назначение:** текущий пользователь + профиль + роли + состояние юр-согласия.
**Авторизация:** Bearer (обязательно).
**Path/Query/Body:** нет
**Ответ (200):**
```json
{
  "id": "uuid",
  "phone": "+99890...",
  "email": null,
  "status": "ACTIVE",
  "default_language": "RU",
  "is_phone_verified": true,
  "is_email_verified": false,
  "roles": ["USER"],
  "profile": {
    "first_name": null,
    "last_name": null,
    "display_name": null,
    "avatar_url": null,
    "contact_phone": null,
    "preferred_language": "RU"
  },
  "legal_consent": { "accepted_version": 2, "accepted_at": "2026-06-29T10:00:00.000Z" }
}
```
Dart: `profile` присутствует всегда (поля nullable, кроме `preferred_language`). `legal_consent.accepted_version int?` сравнивай с `legalConsentVersion` из `GET /settings/public`, чтобы решить, показывать ли модалку согласия.
**Ошибки:** `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl http://localhost:4000/api/v1/auth/me -H 'Authorization: Bearer <access_token>'
```

### `POST /api/v1/auth/refresh`
**Назначение:** ротация refresh-токена — выдаёт новую пару access+refresh.
**Авторизация:** Публичный (авторизует сам refresh-токен в теле). Rate limit: 20/60 сек.
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `refresh_token` | `String` (JWT) | да | Актуальный refresh-токен. |

**Ответ (200):** новая пара токенов **без** блока `user`:
```json
{ "access_token": "eyJ...", "refresh_token": "eyJ...", "token_type": "Bearer", "expires_in": 900 }
```
**Ошибки:** `VALIDATION_ERROR` (400), `TOKEN_INVALID`, `TOKEN_EXPIRED`, `TOKEN_REUSED` (401 — вся сессия отозвана).
**Пример (curl):**
```bash
curl -X POST http://localhost:4000/api/v1/auth/refresh \
  -H 'Content-Type: application/json' -d '{"refresh_token":"<refresh_token>"}'
```

### `POST /api/v1/auth/logout`
**Назначение:** отозвать session family текущего refresh-токена (идемпотентно).
**Авторизация:** Bearer (обязательно). Rate limit: 20/60 сек.
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `refresh_token` | `String` (JWT) | да | Refresh-токен отзываемой сессии. |

**Ответ:** `204 No Content` (тело пустое).
**Ошибки:** `UNAUTHORIZED` (401), `VALIDATION_ERROR` (400).
**Пример (curl):**
```bash
curl -X POST http://localhost:4000/api/v1/auth/logout \
  -H 'Authorization: Bearer <access_token>' -H 'Content-Type: application/json' \
  -d '{"refresh_token":"<refresh_token>"}'
```

## Listings (Объявления)

CRUD объявлений: создание (статус `NEW` → очередь модерации), публичная карточка, список собственных объявлений владельца, счётчики просмотров/звонков и владельческая смена статуса. Перевод карточки выбирается заголовком `Accept-Language` (или `?lang`) с фолбэком на язык оригинала. Все денежные/площадные поля — строки-Decimal (никогда float).

### `POST /api/v1/listings`
**Назначение:** создать объявление. Создаётся на одном языке (`original_language`) со статусом `NEW` и проходит очередь модерации. При первом объявлении автор без продавцовской роли авто-апгрейдится до `OWNER`.
**Авторизация:** Bearer + роли: `USER`, `OWNER`, `AGENT`, `AGENCY`, `LANDLORD`, `PROPERTY_MANAGER`
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `transaction_type` | String (enum) | да | `SALE` \| `RENT` |
| `property_type` | String (enum) | да | `APARTMENT` \| `HOUSE` \| `NEW_BUILDING` \| `LAND` \| `COMMERCIAL` |
| `original_language` | String (enum) | да | `UZ` \| `RU` \| `EN` — язык, на котором пишется объявление |
| `price` | String (Decimal) | да | Цена, строка-Decimal до 12 цифр целых + 2 дробных (напр. `"85000.00"`) |
| `currency` | String (enum) | да | `UZS` \| `USD` |
| `area` | String (Decimal) | нет | Общая площадь, м² |
| `lot_area` | String (Decimal) | нет | Площадь участка (соток), Decimal |
| `living_area` | String (Decimal) | нет | Жилая площадь, м² |
| `non_living_area` | String (Decimal) | нет | Нежилая площадь, м² |
| `rooms` | int | нет | Комнаты (0…32767) |
| `bathrooms` | double | нет | Санузлы, шаг 0.5 (0…99) |
| `parking_type` | String (enum) | нет | `YARD` \| `COVERED` \| `GARAGE` \| `UNDERGROUND` |
| `amenities` | List<String> (enum) | нет | Массив: `AIR_CONDITIONING`, `FURNITURE`, `APPLIANCES`, `INTERNET`, `ELEVATOR`, `BALCONY`, `HEATING`, `SECURITY`, `POOL` |
| `floor` | int | нет | Этаж (0…32767) |
| `is_basement` | bool | нет | Цокольный этаж (при `true` клиент обычно шлёт `floor: null`) |
| `total_floors` | int | нет | Этажность здания (0…32767) |
| `year_built` | int | нет | Год постройки (0…32767) |
| `address` | String | нет | Адрес (до 500 символов) |
| `city_id` | String (UUID) | нет | Город |
| `district_id` | String (UUID) | нет | Район |
| `agency_id` | String (UUID) | нет | Агентство |
| `latitude` | String | нет | Широта (только из map-picker, не из EXIF) |
| `longitude` | String | нет | Долгота |
| `tours_enabled` | bool | нет | Включены ли запросы на просмотр |
| `tour_windows` | List<Map> | нет | До 6 окон вида `{ "start": "HH:MM", "end": "HH:MM" }` |
| `translation` | Map | да | Авторский перевод (см. ниже) |

`translation` (объект):

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `title` | String | да | Заголовок (до 255) |
| `description` | String | нет | Описание |
| `address_note` | String | нет | Уточнение адреса |
| `features_text` | String | нет | Свободный текст особенностей |

**Ответ (2xx):** `201`, краткая форма `ListingResponse`
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "NEW",
  "transaction_type": "SALE",
  "property_type": "APARTMENT",
  "original_language": "RU",
  "price": "85000.00",
  "currency": "USD",
  "created_at": "2026-07-03T10:15:00.000Z"
}
```
**Ошибки:** `VALIDATION_ERROR` (400) — невалидное тело; `UNAUTHORIZED` (401) — нет токена; `FORBIDDEN` (403) — роль не входит в список
**Пример (curl):**
```bash
curl -X POST "http://localhost:4000/api/v1/listings" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"transaction_type":"SALE","property_type":"APARTMENT","original_language":"RU","price":"85000.00","currency":"USD","rooms":3,"translation":{"title":"3-комнатная в центре"}}'
```

### `GET /api/v1/listings/mine`
**Назначение:** список объявлений текущего пользователя (любой статус, кроме `DELETED`). Page-based пагинация.
**Авторизация:** Bearer (обязательно)
**Path-параметры:** нет
**Query-параметры:**

| Параметр | Тип (Dart) | Обяз. | Описание |
|----------|-----------|-------|----------|
| `status` | String (enum) | нет | Фильтр по статусу (`NEW`, `ACTIVE`, `DRAFT`, `REJECTED`, `ARCHIVED`, `SOLD`, `RENTED`); `DELETED` игнорируется |
| `page` | int | нет | Номер страницы (1-based, ≥1; по умолчанию 1) |
| `limit` | int | нет | Размер страницы (1…100; по умолчанию серверный) |

**Тело запроса:** нет
**Ответ (2xx):** `200`, `PaginatedResponse<ListingListItem>`
```json
{
  "data": [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "status": "ACTIVE",
      "transaction_type": "SALE",
      "property_type": "APARTMENT",
      "price": "85000.00",
      "currency": "USD",
      "area": "72.50",
      "lot_area": null,
      "rooms": 3,
      "bathrooms": 1.5,
      "parking_type": "YARD",
      "is_basement": false,
      "city_id": "b1c2...",
      "district_id": "d3e4...",
      "address": "Ташкент, Яшнабадский район, массив Городок",
      "promotion_type": "NORMAL",
      "promotion_expires_at": null,
      "original_language": "RU",
      "title": "3-комнатная в центре",
      "thumbnail_url": "https://cdn.../m1.jpg",
      "views_count": 42,
      "calls_count": 5,
      "likes_count": 3,
      "published_at": "2026-07-01T09:00:00.000Z",
      "created_at": "2026-06-30T12:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```
Типы полей элемента: `rooms`/`views_count`/`calls_count`/`likes_count` → int; `bathrooms` → double; `area`/`lot_area`/`price` → String (Decimal, nullable); даты → String (ISO, `promotion_expires_at`/`published_at` nullable); `thumbnail_url`/`address` → String (nullable).
**Ошибки:** `UNAUTHORIZED` (401); `VALIDATION_ERROR` (400) — невалидный query
**Пример (curl):**
```bash
curl "http://localhost:4000/api/v1/listings/mine?status=ACTIVE&page=1&limit=20" \
  -H "Authorization: Bearer <access_token>"
```

### `GET /api/v1/listings/:id`
**Назначение:** полная публичная карточка объявления с переводом на выбранный язык, контактом автора и медиа. Гость видит только `ACTIVE`; владелец/`MODERATOR`/`ADMIN` — и непубличные статусы (кроме `DELETED`).
**Авторизация:** Bearer (опционально)
**Path-параметры:**

| Параметр | Тип (Dart) | Обяз. | Описание |
|----------|-----------|-------|----------|
| `id` | String (UUID) | да | ID объявления |

**Query-параметры:**

| Параметр | Тип (Dart) | Обяз. | Описание |
|----------|-----------|-------|----------|
| `lang` | String | нет | Язык перевода (`uz`\|`ru`\|`en`); приоритетнее `Accept-Language` |

Дополнительно учитывается заголовок `Accept-Language`.
**Тело запроса:** нет
**Ответ (2xx):** `200`, `ListingDetailResponse`
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "ACTIVE",
  "transaction_type": "SALE",
  "property_type": "APARTMENT",
  "price": "85000.00",
  "currency": "USD",
  "area": "72.50",
  "lot_area": null,
  "living_area": "60.00",
  "non_living_area": "12.50",
  "rooms": 3,
  "bathrooms": 1.5,
  "parking_type": "YARD",
  "amenities": ["AIR_CONDITIONING", "ELEVATOR"],
  "floor": 4,
  "is_basement": false,
  "total_floors": 9,
  "year_built": 2015,
  "city_id": "b1c2...",
  "district_id": "d3e4...",
  "district_name": "Мирзо-Улугбекский",
  "address": "ул. Амира Темура, 15",
  "latitude": "41.311081",
  "longitude": "69.240562",
  "promotion_type": "VIP",
  "promotion_expires_at": "2026-07-20T00:00:00.000Z",
  "owner_id": "a0b1...",
  "agency_id": null,
  "contact": {
    "display_name": "Иван П.",
    "type": "owner",
    "is_pro": false,
    "phone": "+998901234567"
  },
  "language": "RU",
  "title": "3-комнатная в центре",
  "description": "Просторная квартира ...",
  "address_note": "Второй подъезд",
  "features_text": "Ремонт 2023",
  "media": [
    { "id": "m1", "url": "https://cdn.../m1.jpg", "thumbnail_url": null, "sort_order": 0, "type": "IMAGE" }
  ],
  "tours_enabled": true,
  "tour_windows": [ { "start": "10:00", "end": "18:00" } ],
  "views_count": 42,
  "calls_count": 5,
  "likes_count": 3,
  "published_at": "2026-07-01T09:00:00.000Z",
  "created_at": "2026-06-30T12:00:00.000Z"
}
```
Типы: `rooms`/`floor`/`total_floors`/`year_built`/`views_count`/`calls_count`/`likes_count` → int (nullable кроме счётчиков); `bathrooms` → double (nullable); `latitude`/`longitude`/площади/`price` → String; `amenities` → List<String>; `contact.type` → String (`owner`\|`agent`\|`agency`); `contact.is_pro` → bool.
**Ошибки:** `NOT_FOUND` (404) — не существует / `DELETED` / нет прав на непубличный статус
**Пример (curl):**
```bash
curl "http://localhost:4000/api/v1/listings/3fa85f64-5717-4562-b3fc-2c963f66afa6" \
  -H "Accept-Language: ru"
```

### `POST /api/v1/listings/:id/view`
**Назначение:** засчитать просмотр детали (атомарный инкремент, без дедупликации). Гость тоже считается.
**Авторизация:** Публичный
**Path-параметры:** `id` — String (UUID), обяз. — ID объявления
**Query-параметры:** нет
**Тело запроса:** нет
**Ответ (2xx):** `204 No Content`, без тела
**Ошибки:** `NOT_FOUND` (404) — несуществующее или не-`ACTIVE` объявление
**Пример (curl):**
```bash
curl -X POST "http://localhost:4000/api/v1/listings/3fa85f64-5717-4562-b3fc-2c963f66afa6/view"
```

### `POST /api/v1/listings/:id/call`
**Назначение:** засчитать намерение позвонить (клик по `tel:`-ссылке). Гость тоже считается.
**Авторизация:** Публичный
**Path-параметры:** `id` — String (UUID), обяз. — ID объявления
**Query-параметры:** нет
**Тело запроса:** нет
**Ответ (2xx):** `204 No Content`, без тела
**Ошибки:** `NOT_FOUND` (404) — несуществующее или не-`ACTIVE` объявление
**Пример (curl):**
```bash
curl -X POST "http://localhost:4000/api/v1/listings/3fa85f64-5717-4562-b3fc-2c963f66afa6/call"
```

### `PATCH /api/v1/listings/:id`
**Назначение:** обновить собственное объявление (PATCH-семантика — только переданные поля). Правка `ACTIVE`-объявления автоматически возвращает его в `NEW` на повторную модерацию. `original_language` и `status` через этот эндпоинт менять нельзя.
**Авторизация:** Bearer (обязательно) — ownership проверяет сервис
**Path-параметры:** `id` — String (UUID), обяз. — ID объявления
**Query-параметры:** нет
**Тело запроса:** те же поля, что и `CreateListingDto`, **все опциональны**; `translation` — вложенный объект с опциональными `title`/`description`/`address_note`/`features_text`. Поля `transaction_type`, `property_type`, `price`, `currency`, `area`, `lot_area`, `living_area`, `non_living_area`, `rooms`, `bathrooms`, `parking_type`, `amenities`, `floor`, `is_basement`, `total_floors`, `year_built`, `address`, `city_id`, `district_id`, `agency_id`, `latitude`, `longitude`, `tours_enabled`, `tour_windows` — типы и ограничения идентичны `POST`.
**Ответ (2xx):** `200`, краткая форма `ListingResponse` (как в `POST`)
**Ошибки:** `NOT_FOUND` (404) — не существует; `FORBIDDEN` (403) — не владелец; `UNAUTHORIZED` (401); `VALIDATION_ERROR` (400)
**Пример (curl):**
```bash
curl -X PATCH "http://localhost:4000/api/v1/listings/3fa85f64-5717-4562-b3fc-2c963f66afa6" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"price":"79000.00","translation":{"description":"Снижена цена"}}'
```

### `PATCH /api/v1/listings/:id/status`
**Назначение:** владельческая смена статуса своего листинга: скрыть / отметить проданным / сданным / вернуть в продажу.
**Авторизация:** Bearer (обязательно) — ownership проверяет сервис
**Path-параметры:** `id` — String (UUID), обяз. — ID объявления
**Query-параметры:** нет
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `action` | String (enum) | да | `HIDE` → `ARCHIVED`; `MARK_SOLD` → `SOLD` (только `transaction_type=SALE`); `MARK_RENTED` → `RENTED` (только `RENT`); `REACTIVATE` → `ACTIVE` или `NEW` |

**Ответ (2xx):** `200`, краткая форма `ListingResponse` (с обновлённым `status`)
**Ошибки:** `NOT_FOUND` (404) — не существует; `FORBIDDEN` (403) — не владелец; `INVALID_STATUS_TRANSITION` (422) — недопустимый переход из текущего статуса / несоответствие типа сделки; `UNAUTHORIZED` (401)
**Пример (curl):**
```bash
curl -X PATCH "http://localhost:4000/api/v1/listings/3fa85f64-5717-4562-b3fc-2c963f66afa6/status" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"action":"MARK_SOLD"}'
```

---

## Listing Media (Фото)

Управление галереей объявления: список, proxy-загрузка изображения (multipart), удаление и переупорядочивание. Все пути вложены в `/api/v1/listings/:listingId/media`. Модификация — только владелец или `ADMIN`; просмотр непубличного листинга — владелец/`MODERATOR`/`ADMIN`. Файлы хранятся в S3; `url`/`thumbnail_url` перевыпускаются presigned на каждом чтении (не протухают). Лимиты: до 20 медиа на объявление, файл до 10 MiB, MIME `image/jpeg`/`image/png`/`image/webp`.

### `GET /api/v1/listings/:listingId/media`
**Назначение:** медиа листинга, упорядоченные по `sort_order`. `ACTIVE` виден гостю; непубличные статусы — только владельцу/`MODERATOR`/`ADMIN`.
**Авторизация:** Bearer (опционально)
**Path-параметры:** `listingId` — String (UUID), обяз. — ID объявления
**Query-параметры:** нет
**Тело запроса:** нет
**Ответ (2xx):** `200`, `ListingMediaResponse[]`
```json
[
  { "id": "m1", "url": "https://cdn.../m1.jpg", "thumbnail_url": null, "sort_order": 0, "type": "IMAGE" },
  { "id": "m2", "url": "https://cdn.../m2.jpg", "thumbnail_url": null, "sort_order": 1, "type": "IMAGE" }
]
```
Типы: `sort_order` → int; `thumbnail_url` → String (nullable); `type` → String (enum, сейчас только `IMAGE`).
**Ошибки:** `NOT_FOUND` (404) — листинг не существует / `DELETED` / нет прав на непубличный статус
**Пример (curl):**
```bash
curl "http://localhost:4000/api/v1/listings/3fa85f64-5717-4562-b3fc-2c963f66afa6/media"
```

### `POST /api/v1/listings/:listingId/media`
**Назначение:** proxy-загрузка изображения (`multipart/form-data`, поле `file`). Запись создаётся в конец галереи.
**Авторизация:** Bearer (обязательно) — владелец или `ADMIN`
**Path-параметры:** `listingId` — String (UUID), обяз. — ID объявления
**Query-параметры:** нет
**Тело запроса:** `multipart/form-data`

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `file` | File (multipart) | да | Изображение `image/jpeg`/`image/png`/`image/webp`, до 10 MiB |

**Ответ (2xx):** `201`, один `ListingMediaResponse`
```json
{ "id": "m3", "url": "https://cdn.../m3.jpg", "thumbnail_url": null, "sort_order": 2, "type": "IMAGE" }
```
**Ошибки:** `VALIDATION_ERROR` (400) — файл отсутствует; `UNSUPPORTED_MEDIA_TYPE` (415) — недопустимый MIME; `FILE_TOO_LARGE` (413) — файл больше 10 MiB; `MEDIA_LIMIT_EXCEEDED` (422) — уже 20 медиа; `NOT_FOUND` (404) — листинг не существует / `DELETED`; `FORBIDDEN` (403) — не владелец и не `ADMIN`; `UNAUTHORIZED` (401)
**Пример (curl):**
```bash
curl -X POST "http://localhost:4000/api/v1/listings/3fa85f64-5717-4562-b3fc-2c963f66afa6/media" \
  -H "Authorization: Bearer <access_token>" \
  -F "file=@photo.jpg"
```

Пример на Dart (`http` + `MultipartFile`):
```dart
final req = http.MultipartRequest(
  'POST',
  Uri.parse('$kApiBase/listings/$listingId/media'),
)
  ..headers['Authorization'] = 'Bearer $accessToken'
  ..files.add(await http.MultipartFile.fromPath('file', '/path/photo.jpg'));
final res = await req.send();
```

### `PATCH /api/v1/listings/:listingId/media/reorder`
**Назначение:** переупорядочить галерею. `order` обязан быть полной перестановкой id медиа листинга (каждый id ровно один раз); позиция в массиве становится `sort_order`.
**Авторизация:** Bearer (обязательно) — владелец или `ADMIN`
**Path-параметры:** `listingId` — String (UUID), обяз. — ID объявления
**Query-параметры:** нет
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `order` | List<String> (UUID) | да | Непустой массив всех media-id листинга в желаемом порядке |

**Ответ (2xx):** `200`, `ListingMediaResponse[]` в новом порядке
**Ошибки:** `VALIDATION_ERROR` (400) — `order` не является полной перестановкой (пропуски/дубли/чужие id) либо пустой; `NOT_FOUND` (404) — листинг не существует / `DELETED`; `FORBIDDEN` (403) — не владелец и не `ADMIN`; `UNAUTHORIZED` (401)
**Пример (curl):**
```bash
curl -X PATCH "http://localhost:4000/api/v1/listings/3fa85f64-.../media/reorder" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"order":["m2","m1"]}'
```

### `DELETE /api/v1/listings/:listingId/media/:mediaId`
**Назначение:** удалить медиа объявления (DB-запись — source of truth; S3-объект удаляется best-effort).
**Авторизация:** Bearer (обязательно) — владелец или `ADMIN`
**Path-параметры:** `listingId` — String (UUID), обяз.; `mediaId` — String (UUID), обяз. — ID медиа
**Query-параметры:** нет
**Тело запроса:** нет
**Ответ (2xx):** `204 No Content`, без тела
**Ошибки:** `NOT_FOUND` (404) — листинг `DELETED`/не существует, либо медиа не принадлежит листингу; `FORBIDDEN` (403) — не владелец и не `ADMIN`; `UNAUTHORIZED` (401)
**Пример (curl):**
```bash
curl -X DELETE "http://localhost:4000/api/v1/listings/3fa85f64-.../media/m3" \
  -H "Authorization: Bearer <access_token>"
```

---

## Translations (Переводы)

Управленческий просмотр всех переводов объявления. Доступен только владельцу, `MODERATOR` и `ADMIN` — в ответе видно, где авторский текст (`source=USER`), а где машинный перевод. Ручная правка перевода модератором — отдельный админский эндпоинт (`PATCH /api/v1/admin/listings/:id/translations/:language`, не входит в этот контроллер).

### `GET /api/v1/listings/:listingId/translations`
**Назначение:** все переводы листинга с указанием источника и признака авто-перевода.
**Авторизация:** Bearer (обязательно) — владелец / `MODERATOR` / `ADMIN` (посторонний → 403)
**Path-параметры:** `listingId` — String (UUID), обяз. — ID объявления
**Query-параметры:** нет
**Тело запроса:** нет
**Ответ (2xx):** `200`, `ListingTranslationsResponse`
```json
{
  "listing_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "original_language": "RU",
  "translations": [
    {
      "language": "RU",
      "source": "USER",
      "is_auto_translated": false,
      "title": "3-комнатная в центре",
      "description": "Просторная квартира ...",
      "address_note": "Второй подъезд",
      "features_text": "Ремонт 2023"
    },
    {
      "language": "UZ",
      "source": "GOOGLE",
      "is_auto_translated": true,
      "title": "Markazda 3 xonali",
      "description": null,
      "address_note": null,
      "features_text": null
    }
  ]
}
```
Типы: `language` → String (`UZ`\|`RU`\|`EN`); `source` → String (`USER`\|`GOOGLE`\|`YANDEX`); `is_auto_translated` → bool; текстовые поля → String (nullable кроме `title`).
**Ошибки:** `NOT_FOUND` (404) — листинг не существует / `DELETED`; `FORBIDDEN` (403) — аутентифицированный посторонний; `UNAUTHORIZED` (401)
**Пример (curl):**
```bash
curl "http://localhost:4000/api/v1/listings/3fa85f64-.../translations" \
  -H "Authorization: Bearer <access_token>"
```

---

## Promotions (VIP/TOP)

Публичный каталог платных промо-планов (тир × период × цена). Активацию VIP/TOP делает админ вручную (online-оплаты в MVP нет) через отдельный админский контроллер — здесь только чтение каталога. Цены редактируются админом и берутся из таблицы `promotion_plans`; отдаются только активные планы.

### `GET /api/v1/promotions/plans`
**Назначение:** каталог доступных промо-планов (`TOP`/`VIP` × 7/14/30 дней).
**Авторизация:** Публичный
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:** нет
**Ответ (2xx):** `200`, `PromotionPlansResponse`
```json
{
  "plans": [
    { "type": "TOP", "period_days": 7,  "price": "50000.00",  "currency": "UZS" },
    { "type": "TOP", "period_days": 14, "price": "90000.00",  "currency": "UZS" },
    { "type": "TOP", "period_days": 30, "price": "150000.00", "currency": "UZS" },
    { "type": "VIP", "period_days": 7,  "price": "120000.00", "currency": "UZS" },
    { "type": "VIP", "period_days": 14, "price": "210000.00", "currency": "UZS" },
    { "type": "VIP", "period_days": 30, "price": "350000.00", "currency": "UZS" }
  ]
}
```
Типы: `type` → String (`TOP`\|`VIP`); `period_days` → int (7\|14\|30); `price` → String (Decimal); `currency` → String (`UZS`\|`USD`, в MVP `UZS`).
**Ошибки:** нет (публичный каталог всегда `200`)
**Пример (curl):**
```bash
curl "http://localhost:4000/api/v1/promotions/plans"
```

---

## Search (Поиск и фильтры)

Модуль публичного поиска объявлений (`SearchController`, все маршруты под `/api/v1/search`). Все эндпоинты **публичные** — ни один guard не подключён. Язык результатов (`title`, `district_name`) выбирается по заголовку `Accept-Language` (`uz` | `ru` | `en`) с фолбэком на язык оригинала объявления.

> **Важно про язык:** query-параметр `?lang` на `/api/v1/search` (и других эндпоинтах поиска) даёт **`400 VALIDATION_ERROR`** — глобальный `ValidationPipe` строгий (`forbidNonWhitelisted`), а `lang` не входит в DTO. Язык передавать **только** заголовком `Accept-Language`.

> **Про пагинацию:** используется **keyset (cursor)**, а не `page/limit`. Ответ — конверт `{ data, meta }`, где `meta.next_cursor` — непрозрачный base64url-токен позиции (или `null`, если страниц больше нет). Для следующей страницы клиент передаёт полученный `next_cursor` в query-параметре `cursor`. `meta.total` — общее число совпадений по фильтрам (без учёта курсора). Исключение — `/search/near-me`: одна страница, `next_cursor` всегда `null`.

### Форма карточки листинга (`SearchListItem`)

Единый объект для всех эндпоинтов поиска (`data[]`). Decimal-поля и координаты — **строки** (контрактный формат), даты — ISO-8601 строки.

```json
{
  "id": "0f8b7c4e-1a2b-4c3d-9e5f-6a7b8c9d0e1f",
  "status": "ACTIVE",
  "transaction_type": "SALE",
  "property_type": "APARTMENT",
  "price": "125000.00",
  "currency": "USD",
  "rooms": 3,
  "bathrooms": 1.5,
  "parking_type": "GARAGE",
  "is_basement": false,
  "lot_area": "4.50",
  "city_id": "a1b2c3d4-0000-0000-0000-000000000001",
  "district_id": "b2c3d4e5-0000-0000-0000-000000000002",
  "latitude": "41.311081",
  "longitude": "69.279737",
  "promotion_type": "VIP",
  "promotion_expires_at": "2026-08-01T00:00:00.000Z",
  "effective_tier": "VIP",
  "language": "RU",
  "title": "3-комнатная квартира в центре",
  "thumbnail_url": "https://cdn.example/r2/presigned/....jpg",
  "thumbnails": [
    "https://cdn.example/r2/presigned/....0.jpg",
    "https://cdn.example/r2/presigned/....1.jpg",
    "https://cdn.example/r2/presigned/....2.jpg"
  ],
  "created_at": "2026-06-15T09:30:00.000Z",
  "views_count": 342,
  "likes_count": 12,
  "distance_m": 850,
  "district_name": "Мирзо-Улугбекский район"
}
```

Пояснения к полям карточки для Flutter:

| Поле | Тип (Dart) | Описание |
|------|-----------|----------|
| `id` | String | UUID объявления |
| `status` | String | всегда `ACTIVE` в выдаче поиска |
| `transaction_type` | String | `SALE` \| `RENT` |
| `property_type` | String | `APARTMENT` \| `HOUSE` \| `NEW_BUILDING` \| `LAND` \| `COMMERCIAL` |
| `price` | String | Decimal с 2 знаками (`"125000.00"`) — парсить как `double`, не `int` |
| `currency` | String | `UZS` \| `USD` |
| `rooms` | int? | может быть `null` |
| `bathrooms` | double? | шаг 0.5 (`1.5`), число (не строка), может быть `null` |
| `parking_type` | String? | `YARD` \| `COVERED` \| `GARAGE` \| `UNDERGROUND` \| `null` |
| `is_basement` | bool | цокольный этаж |
| `lot_area` | String? | площадь участка в сотках, Decimal-строка, `null` если нет |
| `city_id` | String? | UUID |
| `district_id` | String? | UUID |
| `latitude` | String? | Decimal-строка 6 знаков, `null` если координат нет |
| `longitude` | String? | Decimal-строка 6 знаков, `null` если координат нет |
| `promotion_type` | String | сырое значение промо: `NORMAL` \| `TOP` \| `VIP` |
| `promotion_expires_at` | String? | ISO-дата или `null` |
| `effective_tier` | String | промо-тир с учётом времени: истёкшее промо → `NORMAL` |
| `language` | String | язык, на котором выбраны `title`/`district_name`: `UZ` \| `RU` \| `EN` |
| `title` | String | заголовок на выбранном языке (может быть пустой строкой) |
| `thumbnail_url` | String? | обложка (первое фото), presigned URL |
| `thumbnails` | List<String> | до 3 presigned URL фото (индекс 0 = обложка) |
| `created_at` | String | ISO-дата |
| `views_count` | int | счётчик просмотров |
| `likes_count` | int | число добавивших в избранное |
| `distance_m` | int? | дистанция в метрах — **только** в ответах `/search/radius` и `/search/near-me`; в остальных отсутствует |
| `district_name` | String? | имя района на языке карточки, `null` если район не найден |

> **Примечание:** presigned URL фото (`thumbnail_url`, `thumbnails`) имеют ограниченный TTL (~1 час) — не кэшировать надолго, перезапрашивать список при истечении.

### `GET /api/v1/search`
**Назначение:** фильтрованный список ACTIVE-объявлений с keyset-пагинацией и promotion-приоритетной сортировкой. Главный эндпоинт каталога — поддерживает весь набор фильтров.
**Авторизация:** Публичный.
**Path-параметры:** нет
**Query-параметры:** (все опциональны)

| Параметр | Тип (Dart) | Обяз. | Описание / значения |
|----------|-----------|-------|---------------------|
| `transaction_type` | String | нет | `SALE` \| `RENT` |
| `property_type` | List<String> | нет | мультивыбор (IN). Повторяющийся параметр `?property_type=APARTMENT&property_type=HOUSE`. Значения: `APARTMENT` \| `HOUSE` \| `NEW_BUILDING` \| `LAND` \| `COMMERCIAL` |
| `price_min` | String | нет | нижняя граница цены (Decimal-строка, до 2 знаков), в валюте `currency` |
| `price_max` | String | нет | верхняя граница цены (Decimal-строка, до 2 знаков), в валюте `currency` |
| `currency` | String | нет | `UZS` \| `USD`. Цены листингов другой валюты FX-нормализуются к ней по курсу ЦБУ; нет курса → сравниваются только листинги этой же валюты |
| `city_id` | String | нет | UUID города |
| `region_id` | String | нет | UUID региона (фильтрует по всем районам региона) |
| `district_id` | String | нет | UUID района |
| `sort` | String | нет | `date_desc` (умолчание) \| `price_asc` \| `price_desc` \| `area_desc`. Промо-тир всегда первичный ключ; при явном `sort` топ-3 промо закрепляются в начале 1-й страницы. Невалидное значение → 400 |
| `q` | String | нет | свободный текст (ILIKE-подстрока по адресу, заголовку и описанию на любом языке), макс. 200 символов |
| `rooms` | int | нет | ≥0. `0..3` — точное совпадение; `4` = «4 и более» |
| `rooms_min` | int | нет | ≥0. «N+ комнат» (rooms ≥ N) |
| `bathrooms_min` | double | нет | ≥0, шаг 0.5. «N+ санузлов» (bathrooms ≥ N); NULL-листинги исключаются |
| `parking_type` | List<String> | нет | мультивыбор (IN). `YARD` \| `COVERED` \| `GARAGE` \| `UNDERGROUND`. NULL-листинги исключаются |
| `amenities` | List<String> | нет | мультивыбор (AND — есть ВСЕ). `AIR_CONDITIONING` \| `FURNITURE` \| `APPLIANCES` \| `INTERNET` \| `ELEVATOR` \| `BALCONY` \| `HEATING` \| `SECURITY` \| `POOL` |
| `floor_min` | int | нет | ≥0. Минимальный этаж |
| `floor_max` | int | нет | ≥0. Максимальный этаж |
| `not_first_floor` | bool | нет | `true` → этаж > 1 |
| `not_last_floor` | bool | нет | `true` → этаж < total_floors |
| `is_basement` | bool | нет | `true` → только цокольные |
| `total_floors_min` | int | нет | ≥0. Минимальная этажность здания |
| `total_floors_max` | int | нет | ≥0. Максимальная этажность здания |
| `year_min` | int | нет | Год постройки от |
| `year_max` | int | нет | Год постройки до |
| `listing_source` | List<String> | нет | `OWNER` (agency_id IS NULL) \| `AGENCY` (agency_id IS NOT NULL). Фильтр применяется, только если выбрано ровно одно значение; оба/пусто → без фильтра |
| `tours_enabled` | bool | нет | `true` → только объявления с доступным туром |
| `area_min` | double | нет | ≥0. Площадь (м²) от |
| `area_max` | double | нет | ≥0. Площадь (м²) до |
| `lot_area_min` | double | нет | ≥0. Площадь участка (соток) от |
| `lot_area_max` | double | нет | ≥0. Площадь участка (соток) до |
| `promotion_type` | String | нет | `NORMAL` \| `TOP` \| `VIP` — валидируется, но **пока игнорируется** фильтром |
| `cursor` | String | нет | keyset-токен предыдущей страницы (из `meta.next_cursor`) |
| `limit` | int | нет | размер страницы, 1..100, дефолт **20** |

**Тело запроса:** нет
**Ответ (2xx):**
```json
{
  "data": [ /* SearchListItem[] — см. форму карточки выше */ ],
  "meta": {
    "limit": 20,
    "total": 137,
    "next_cursor": "eyJyYW5rIjoyLCJ2YWwiOiIyMDI2LTA2LTE1VDA5OjMwOjAwLjAwMFoiLCJpZCI6Ii4uLiJ9"
  }
}
```
**Ошибки:** `VALIDATION_ERROR` (400) — невалидный enum/тип параметра, `sort` не из списка, битый `cursor`, либо присутствует запрещённый параметр (например `lang`).
**Пример (curl):**
```bash
curl -G 'http://localhost:4000/api/v1/search' \
  -H 'Accept-Language: ru' \
  --data-urlencode 'transaction_type=SALE' \
  --data-urlencode 'property_type=APARTMENT' \
  --data-urlencode 'property_type=NEW_BUILDING' \
  --data-urlencode 'currency=USD' \
  --data-urlencode 'price_min=50000' \
  --data-urlencode 'price_max=150000' \
  --data-urlencode 'rooms_min=2' \
  --data-urlencode 'amenities=ELEVATOR' \
  --data-urlencode 'amenities=BALCONY' \
  --data-urlencode 'sort=price_asc' \
  --data-urlencode 'limit=20'
```

### `GET /api/v1/search/radius`
**Назначение:** ACTIVE-объявления в радиусе `radius_m` метров от точки (`ST_DWithin`, GIST-индекс). Порядок — promotion-приоритетный (keyset), каждый элемент содержит `distance_m`.
**Авторизация:** Публичный.
**Path-параметры:** нет
**Query-параметры:** все параметры `GET /api/v1/search` (см. выше) **плюс**:

| Параметр | Тип (Dart) | Обяз. | Описание / значения |
|----------|-----------|-------|---------------------|
| `lat` | double | **да** | широта центра (WGS84), −90..90 |
| `lng` | double | **да** | долгота центра (WGS84), −180..180 |
| `radius_m` | double | **да** | радиус в метрах, 1..50000 |

**Тело запроса:** нет
**Ответ (2xx):** конверт `{ data, meta }` как у `/search`; каждый элемент `data[]` дополнительно содержит `distance_m` (int, метры).
**Ошибки:** `VALIDATION_ERROR` (400) — отсутствуют/невалидны `lat`/`lng`/`radius_m`, radius вне 1..50000, битый `cursor`.
**Пример (curl):**
```bash
curl -G 'http://localhost:4000/api/v1/search/radius' \
  -H 'Accept-Language: ru' \
  --data-urlencode 'lat=41.311081' \
  --data-urlencode 'lng=69.279737' \
  --data-urlencode 'radius_m=3000' \
  --data-urlencode 'transaction_type=RENT'
```

### `GET /api/v1/search/bounds`
**Назначение:** ACTIVE-объявления внутри видимой области карты (bbox `ST_MakeEnvelope` + `ST_Within`). Маркеры для карты. Порядок — promotion-приоритетный (keyset); `distance_m` не возвращается.
**Авторизация:** Публичный.
**Path-параметры:** нет
**Query-параметры:** все параметры `GET /api/v1/search` **плюс** углы bbox:

| Параметр | Тип (Dart) | Обяз. | Описание / значения |
|----------|-----------|-------|---------------------|
| `sw_lat` | double | **да** | широта юго-западного угла, −90..90 |
| `sw_lng` | double | **да** | долгота юго-западного угла, −180..180 |
| `ne_lat` | double | **да** | широта северо-восточного угла, −90..90 |
| `ne_lng` | double | **да** | долгота северо-восточного угла, −180..180 |

Перевёрнутый/вырожденный bbox (`sw > ne`) → пустая выдача, не ошибка. Антимеридиан не поддерживается.
**Тело запроса:** нет
**Ответ (2xx):** конверт `{ data, meta }` как у `/search` (без `distance_m`).
**Ошибки:** `VALIDATION_ERROR` (400) — отсутствуют/невалидны углы bbox, битый `cursor`.
**Пример (curl):**
```bash
curl -G 'http://localhost:4000/api/v1/search/bounds' \
  -H 'Accept-Language: ru' \
  --data-urlencode 'sw_lat=41.28' \
  --data-urlencode 'sw_lng=69.20' \
  --data-urlencode 'ne_lat=41.35' \
  --data-urlencode 'ne_lng=69.32'
```

### `GET /api/v1/search/near-me`
**Назначение:** ближайшие к точке ACTIVE-объявления, отсортированные по дистанции (`ST_Distance` ASC); промо — вторичный ключ. **Одна страница** размером `limit`, keyset не применяется. Каждый элемент содержит `distance_m`.
**Авторизация:** Публичный.
**Path-параметры:** нет
**Query-параметры:** все параметры `GET /api/v1/search` **плюс**:

| Параметр | Тип (Dart) | Обяз. | Описание / значения |
|----------|-----------|-------|---------------------|
| `lat` | double | **да** | широта точки (WGS84), −90..90 |
| `lng` | double | **да** | долгота точки (WGS84), −180..180 |

(`cursor` принимается DTO, но игнорируется — выдаётся одна страница.)
**Тело запроса:** нет
**Ответ (2xx):** конверт `{ data, meta }`; `meta.next_cursor` всегда `null`; каждый элемент содержит `distance_m`.
**Ошибки:** `VALIDATION_ERROR` (400) — отсутствуют/невалидны `lat`/`lng`.
**Пример (curl):**
```bash
curl -G 'http://localhost:4000/api/v1/search/near-me' \
  -H 'Accept-Language: ru' \
  --data-urlencode 'lat=41.311081' \
  --data-urlencode 'lng=69.279737' \
  --data-urlencode 'limit=30'
```

### `GET /api/v1/search/polygon`
**Назначение:** ACTIVE-объявления внутри произвольного полигона (freehand-ласо на карте, `ST_MakePolygon`/`ST_Within`). Порядок — promotion-приоритетный (keyset); `distance_m` не возвращается.
**Авторизация:** Публичный.
**Path-параметры:** нет
**Query-параметры:** все параметры `GET /api/v1/search` **плюс**:

| Параметр | Тип (Dart) | Обяз. | Описание / значения |
|----------|-----------|-------|---------------------|
| `points` | String | **да** | вершины кольца — пары `lat,lng`, разделённые `;`. Минимум 3 вершины; каждая: lat ∈ [−90,90], lng ∈ [−180,180]. Кольцо замыкается на сервере. Пример: `41.30,69.27;41.30,69.29;41.32,69.29;41.32,69.27` |

**Тело запроса:** нет
**Ответ (2xx):** конверт `{ data, meta }` как у `/search` (без `distance_m`).
**Ошибки:** `VALIDATION_ERROR` (400) — невалидный формат/диапазон/число вершин `points`, битый `cursor`.
**Пример (curl):**
```bash
curl -G 'http://localhost:4000/api/v1/search/polygon' \
  -H 'Accept-Language: ru' \
  --data-urlencode 'points=41.30,69.27;41.30,69.29;41.32,69.29;41.32,69.27'
```

### `GET /api/v1/search/price-distribution`
**Назначение:** гистограмма распределения цены для слайдера фильтра (Zillow-вид). Глобально по (currency, transaction_type), только видимые ACTIVE-объявления. Домен `[0, max]`, 30 бакетов равной ширины, «хвост» `overflow_count` (дороже max).
**Авторизация:** Публичный.
**Path-параметры:** нет
**Query-параметры:**

| Параметр | Тип (Dart) | Обяз. | Описание / значения |
|----------|-----------|-------|---------------------|
| `currency` | String | **да** | `UZS` \| `USD`. Цены приводятся к ней; бакеты в её масштабе |
| `transaction_type` | String | **да** | `SALE` \| `RENT` |

**Тело запроса:** нет
**Ответ (2xx):**
```json
{
  "currency": "USD",
  "transaction_type": "SALE",
  "min": 0,
  "max": 500000,
  "buckets": [
    { "from": 0, "to": 16666.67, "count": 4 },
    { "from": 16666.67, "to": 33333.33, "count": 11 }
  ],
  "overflow_count": 7
}
```
Поля: `min` (double, всегда 0), `max` (double, округлённый p99-потолок), `buckets` (List — `from`/`to`/`count`, все числовые; полуинтервал `[from, to)`), `overflow_count` (int — объявлений строго дороже `max`). Пустая выборка → `max: 0`, `buckets: []`, `overflow_count: 0`.
**Ошибки:** `VALIDATION_ERROR` (400) — отсутствует/невалиден `currency` или `transaction_type`.
**Пример (curl):**
```bash
curl -G 'http://localhost:4000/api/v1/search/price-distribution' \
  --data-urlencode 'currency=USD' \
  --data-urlencode 'transaction_type=SALE'
```

---

## Geo (Регионы и районы)

Публичные гео-справочники (`GeoController`, `/api/v1/geo/*`). Используются для dropdown'ов фильтрации и разрешения `district_id`/`region_id` в имена. Все маршруты **публичные**. Ответы — плоские массивы (без конверта пагинации).

### `GET /api/v1/geo/regions`
**Назначение:** полный список регионов Узбекистана (в порядке `sort_order`).
**Авторизация:** Публичный.
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:** нет
**Ответ (2xx):**
```json
[
  {
    "id": "c1d2e3f4-0000-0000-0000-000000000001",
    "code": "toshkent",
    "name_uz": "Toshkent shahri",
    "name_ru": "город Ташкент",
    "name_en": "Tashkent city"
  }
]
```
Поля элемента: `id` (String, UUID), `code` (String, slug), `name_uz` / `name_ru` / `name_en` (String).
**Ошибки:** нет специфичных (стандартные 5xx при сбое БД).
**Пример (curl):**
```bash
curl 'http://localhost:4000/api/v1/geo/regions'
```

### `GET /api/v1/geo/districts`
**Назначение:** список районов; опционально фильтр по региону. Порядок — алфавитный по `name_ru`.
**Авторизация:** Публичный.
**Path-параметры:** нет
**Query-параметры:**

| Параметр | Тип (Dart) | Обяз. | Описание / значения |
|----------|-----------|-------|---------------------|
| `region_id` | String | нет | UUID региона для фильтрации; без параметра — все районы |

**Тело запроса:** нет
**Ответ (2xx):**
```json
[
  {
    "id": "b2c3d4e5-0000-0000-0000-000000000002",
    "code": "mirzo-ulugbek",
    "name_uz": "Mirzo Ulug'bek tumani",
    "name_ru": "Мирзо-Улугбекский район",
    "name_en": "Mirzo Ulugbek district",
    "region_id": "c1d2e3f4-0000-0000-0000-000000000001"
  }
]
```
Поля: `id` (String, UUID), `code` (String, slug), `name_uz`/`name_ru`/`name_en` (String), `region_id` (String?, UUID родительского региона — `null` только для legacy-записей без региона).
**Ошибки:** нет специфичных. Невалидный `region_id` не отдаёт 400 — просто вернётся пустой массив / все записи в зависимости от совпадения.
**Пример (curl):**
```bash
curl -G 'http://localhost:4000/api/v1/geo/districts' \
  --data-urlencode 'region_id=c1d2e3f4-0000-0000-0000-000000000001'
```

---

## Exchange Rate (Курс валют)

Публичный курс USD→UZS (`ExchangeRateController`, `/api/v1/exchange-rate`). Только чтение текущего курса. (Ручная установка курса — в отдельном admin-контроллере, не документируется здесь.)

### `GET /api/v1/exchange-rate`
**Назначение:** текущий (последний по времени) курс USD→UZS. Источник — официальный курс ЦБУ (`CBU`) либо ручной оверрайд администратора (`MANUAL`). Используется клиентом для конвертации/отображения цен.
**Авторизация:** Публичный.
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:** нет
**Ответ (2xx):**
```json
{
  "base": "USD",
  "quote": "UZS",
  "rate": "12650.00",
  "fetched_at": "2026-07-03T06:00:00.000Z",
  "source": "CBU"
}
```
Поля: `base` (String, всегда `"USD"`), `quote` (String, всегда `"UZS"`), `rate` (String — курс `1 USD = rate UZS`, Decimal-строка, парсить как `double`), `fetched_at` (String, ISO-дата), `source` (String, `CBU` \| `MANUAL`).
**Ошибки:** `404 Not Found` (`"No exchange rate available"`) — если в БД ещё нет ни одной записи курса.
**Пример (curl):**
```bash
curl 'http://localhost:4000/api/v1/exchange-rate'
```

---

## Users (Профиль)

Управление собственным аккаунтом авторизованного пользователя. Все эндпоинты объявлены под `@Controller({ path: 'users', version: '1' })` с классовым `@UseGuards(JwtAuthGuard)`, поэтому `:id` в путях нет — сервер всегда берёт `sub` из access-токена (`@CurrentUser('id')`) и работает только с записью текущего пользователя. Контракт ответа — snake_case. Важно: аккаунт со статусом `DELETED` невидим даже по валидному токену и отдаёт `401 UNAUTHORIZED`.

### `GET /api/v1/users/me`
**Назначение:** вернуть текущего пользователя со свежими (из БД) ролями и профилем.
**Авторизация:** Bearer (обязательно).
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:** нет
**Ответ (2xx):** `200 OK`
```json
{
  "id": "9c1e5f2a-3b7d-4a10-8e2f-1a2b3c4d5e6f",
  "phone": "+998901234567",
  "email": "user@example.com",
  "status": "ACTIVE",
  "default_language": "RU",
  "is_phone_verified": true,
  "is_email_verified": false,
  "roles": ["USER"],
  "profile": {
    "first_name": "Азиз",
    "last_name": "Каримов",
    "display_name": "Азиз К.",
    "avatar_url": "https://cdn.avino.uz/avatars/abc.jpg",
    "contact_phone": "+998901112233",
    "preferred_language": "RU"
  }
}
```
Поля ответа (Dart): `id` String (UUID); `phone` String?; `email` String?; `status` String (enum `ACTIVE`/`BLOCKED`/`DELETED`); `default_language` String (enum `UZ`/`RU`/`EN`); `is_phone_verified` bool; `is_email_verified` bool; `roles` List<String>; `profile` Map? (объект ниже или `null`, если профиль ещё не создан); `profile.first_name`/`last_name`/`display_name`/`avatar_url`/`contact_phone` String?; `profile.preferred_language` String? (enum `UZ`/`RU`/`EN`).
**Ошибки:** `UNAUTHORIZED` (401) — токен отсутствует/невалиден, либо аккаунт удалён/неактивен.
**Пример (curl):**
```bash
curl -X GET "http://localhost:4000/api/v1/users/me" \
  -H "Authorization: Bearer <access_token>"
```

### `PATCH /api/v1/users/me`
**Назначение:** обновить базовые поля аккаунта (`email`, `default_language`). Смена `email` сбрасывает `is_email_verified` в `false` (нужен повторный verify). Смена `phone` здесь не поддерживается намеренно (лишние поля отклоняются валидатором).
**Авторизация:** Bearer (обязательно).
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:** (все поля опциональны — PATCH-семантика)

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `email` | String? | нет | Валидный email, ≤255 символов. Если отличается от текущего — сбрасывает верификацию и проверяет уникальность |
| `default_language` | String? | нет | enum: `UZ`, `RU`, `EN` |

**Ответ (2xx):** `200 OK` — та же форма, что `GET /api/v1/users/me`.
**Ошибки:** `VALIDATION_ERROR` (400) — невалидный email/язык или переданы лишние поля (напр. `phone`); `UNAUTHORIZED` (401); `CONTACT_TAKEN` (409) — email уже занят другим не-удалённым аккаунтом.
**Пример (curl):**
```bash
curl -X PATCH "http://localhost:4000/api/v1/users/me" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"email":"new@example.com","default_language":"EN"}'
```

### `PATCH /api/v1/users/me/profile`
**Назначение:** частично обновить профиль пользователя. Профиль связан 1:1 с аккаунтом и создаётся автоматически при первом вызове (upsert). Непереданные поля не затираются.
**Авторизация:** Bearer (обязательно).
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:** (все поля опциональны)

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `first_name` | String? | нет | ≤100 символов |
| `last_name` | String? | нет | ≤100 символов |
| `display_name` | String? | нет | ≤150 символов |
| `avatar_url` | String? | нет | Валидный URL, ≤2048 символов |
| `contact_phone` | String? | нет | ≤20 символов |
| `preferred_language` | String? | нет | enum: `UZ`, `RU`, `EN` |

**Ответ (2xx):** `200 OK` — объект профиля (snake_case).
```json
{
  "first_name": "Азиз",
  "last_name": "Каримов",
  "display_name": "Азиз К.",
  "avatar_url": "https://cdn.avino.uz/avatars/abc.jpg",
  "contact_phone": "+998901112233",
  "preferred_language": "RU"
}
```
**Ошибки:** `VALIDATION_ERROR` (400) — превышение лимитов длины, невалидный URL/язык или лишние поля; `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -X PATCH "http://localhost:4000/api/v1/users/me/profile" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Азиз","display_name":"Азиз К.","preferred_language":"RU"}'
```

### `POST /api/v1/users/me/legal-consent`
**Назначение:** записать согласие пользователя с Правилами и Политикой конфиденциальности. Обе галочки обязаны быть `true`. Версия проставляется сервером (текущая версия документов); каждое согласие — новая append-only запись.
**Авторизация:** Bearer (обязательно).
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `terms_accepted` | bool | да | Согласие с Правилами. Должно быть `true` |
| `privacy_accepted` | bool | да | Согласие с Политикой конфиденциальности. Должно быть `true` |

**Ответ (2xx):** `201 Created`
```json
{ "accepted_version": 2, "accepted_at": "2026-07-03T09:15:00.000Z" }
```
`accepted_version` — int?; `accepted_at` — String? (ISO-дата).
**Ошибки:** `VALIDATION_ERROR` (400) — поля не переданы или не boolean; `UNAUTHORIZED` (401); `CONSENT_INCOMPLETE` (422) — одна из галочек `false`.
**Пример (curl):**
```bash
curl -X POST "http://localhost:4000/api/v1/users/me/legal-consent" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"terms_accepted":true,"privacy_accepted":true}'
```

---

## Favorites (Избранное)

Избранные объявления пользователя. Класс-уровневый `@UseGuards(JwtAuthGuard)` — гость без Bearer получает `401`. Список отдаётся keyset-пагинацией, свежие сверху (по времени добавления в избранное, а не по промо-тиру). Карточки в списке — те же, что в `/search` (форма `SearchListItem`; выбор языка перевода по `?lang` / `Accept-Language` с фолбэком на оригинал). `DELETED`-объявления в список не попадают и не могут быть добавлены.

### `GET /api/v1/favorites`
**Назначение:** список избранного текущего пользователя, keyset-пагинация.
**Авторизация:** Bearer (обязательно).
**Path-параметры:** нет
**Query-параметры:**

| Параметр | Тип (Dart) | Обяз. | Описание |
|----------|-----------|-------|----------|
| `cursor` | String? | нет | Непрозрачный keyset-токен позиции (значение `meta.next_cursor`) |
| `limit` | int? | нет | Размер страницы, 1–100, по умолчанию 20 |
| `lang` | String? | нет | Язык карточек: `uz` \| `ru` \| `en` (приоритетнее заголовка). При отсутствии — берётся `Accept-Language` |

**Тело запроса:** нет
**Ответ (2xx):** `200 OK` — конверт `{ data, meta }`. `data` — массив карточек объявлений (форма `SearchListItem`, см. модуль Search). В избранном поле `distance_m` отсутствует. `meta` — `{ limit: int, total: int, next_cursor: String? }`.
**Ошибки:** `VALIDATION_ERROR` (400) — невалидный `cursor` или `limit` вне диапазона; `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -X GET "http://localhost:4000/api/v1/favorites?limit=20&lang=ru" \
  -H "Authorization: Bearer <access_token>"
```

### `POST /api/v1/favorites`
**Назначение:** добавить объявление в избранное. Объявление должно существовать и быть не-`DELETED`.
**Авторизация:** Bearer (обязательно).
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `listing_id` | String (UUID) | да | ID добавляемого объявления |

**Ответ (2xx):** `201 Created` — квиток добавления (сама карточка приходит в `GET /favorites`).
```json
{
  "id": "7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d",
  "listing_id": "5f7c9a10-2b3d-4e5f-8a1b-2c3d4e5f6a7b",
  "created_at": "2026-07-03T09:20:00.000Z"
}
```
`id` String (UUID записи); `listing_id` String; `created_at` String (ISO).
**Ошибки:** `VALIDATION_ERROR` (400) — `listing_id` не UUID; `UNAUTHORIZED` (401); `NOT_FOUND` (404) — объявление не найдено или `DELETED`; `ALREADY_FAVORITED` (409) — уже в избранном.
**Пример (curl):**
```bash
curl -X POST "http://localhost:4000/api/v1/favorites" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"listing_id":"5f7c9a10-2b3d-4e5f-8a1b-2c3d4e5f6a7b"}'
```

### `DELETE /api/v1/favorites/:listingId`
**Назначение:** убрать объявление из избранного (по паре `(пользователь, listingId)`).
**Авторизация:** Bearer (обязательно).
**Path-параметры:** `listingId` — String (UUID), обяз. — ID объявления
**Query-параметры:** нет
**Тело запроса:** нет
**Ответ (2xx):** `204 No Content`.
**Ошибки:** `VALIDATION_ERROR` (400) — `listingId` не UUID; `UNAUTHORIZED` (401); `NOT_FOUND` (404) — записи избранного нет.
**Пример (curl):**
```bash
curl -X DELETE "http://localhost:4000/api/v1/favorites/5f7c9a10-2b3d-4e5f-8a1b-2c3d4e5f6a7b" \
  -H "Authorization: Bearer <access_token>"
```

---

## Saved Searches (Сохранённые поиски)

CRUD сохранённых поисков пользователя. Класс-уровневый `@UseGuards(JwtAuthGuard)`. Владение проверяется на уровне запросов — чужой поиск недоступен и отдаёт `404`. Фильтры хранятся в версионированном контейнере `filters_json = { schemaVersion, filters }`; на запись принимается только поддерживаемая версия (сейчас `1`), иначе `422`. Содержимое `filters` — свободный объект и по DTO поиска не валидируется.

### `GET /api/v1/saved-searches`
**Назначение:** список сохранённых поисков пользователя, свежие сверху. Без keyset-курсора — только `{ limit, total }`.
**Авторизация:** Bearer (обязательно).
**Path-параметры:** нет
**Query-параметры:**

| Параметр | Тип (Dart) | Обяз. | Описание |
|----------|-----------|-------|----------|
| `limit` | int? | нет | Размер страницы, 1–100, по умолчанию 20 |

**Тело запроса:** нет
**Ответ (2xx):** `200 OK`
```json
{
  "data": [
    {
      "id": "d4e5f6a7-b8c9-4012-a3b4-c5d6e7f8a9b0",
      "name": "Квартиры в центре до $90k",
      "is_active": true,
      "filters_json": {
        "schemaVersion": 1,
        "filters": { "transaction_type": "SALE", "property_type": "APARTMENT", "price_max": 90000 }
      },
      "last_checked_at": "2026-07-03T06:00:00.000Z",
      "created_at": "2026-06-28T10:00:00.000Z"
    }
  ],
  "meta": { "limit": 20, "total": 1 }
}
```
`data[].id` String (UUID); `name` String; `is_active` bool; `filters_json` Map<String, dynamic> (`{ schemaVersion: int, filters: Map<String, dynamic> }`); `last_checked_at` String? (ISO, `null` если не проверялся); `created_at` String (ISO); `meta` `{ limit: int, total: int }`.
**Ошибки:** `VALIDATION_ERROR` (400) — `limit` вне диапазона; `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -X GET "http://localhost:4000/api/v1/saved-searches?limit=20" \
  -H "Authorization: Bearer <access_token>"
```

### `POST /api/v1/saved-searches`
**Назначение:** создать сохранённый поиск. `schemaVersion` должна быть поддерживаемой.
**Авторизация:** Bearer (обязательно).
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `name` | String | да | 1–150 символов |
| `filters_json` | Map<String, dynamic> | да | Контейнер фильтров (см. ниже) |
| `filters_json.schemaVersion` | int | да | Версия схемы фильтров. Поддерживается только `1` |
| `filters_json.filters` | Map<String, dynamic> | да | Свободный объект фильтров поиска (не валидируется построчно) |

**Ответ (2xx):** `201 Created` — созданный объект (форма как в списке).
**Ошибки:** `VALIDATION_ERROR` (400) — пустой/слишком длинный `name`, отсутствует/не-число `schemaVersion`, `filters` не объект; `UNAUTHORIZED` (401); `UNSUPPORTED_FILTER_SCHEMA` (422) — неподдерживаемая `schemaVersion`.
**Пример (curl):**
```bash
curl -X POST "http://localhost:4000/api/v1/saved-searches" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Квартиры до $90k","filters_json":{"schemaVersion":1,"filters":{"price_max":90000}}}'
```

### `PATCH /api/v1/saved-searches/:id`
**Назначение:** частично обновить `name`, `filters_json` и/или `is_active` своего поиска.
**Авторизация:** Bearer (обязательно).
**Path-параметры:** `id` — String (UUID), обяз. — ID сохранённого поиска
**Query-параметры:** нет
**Тело запроса:** (все поля опциональны)

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `name` | String? | нет | 1–150 символов |
| `filters_json` | Map<String, dynamic>? | нет | Контейнер `{ schemaVersion: int, filters: Map }`; при передаче проверяется поддерживаемость версии |
| `is_active` | bool? | нет | Включить/выключить оповещения по поиску |

**Ответ (2xx):** `200 OK` — обновлённый объект (форма как в списке).
**Ошибки:** `VALIDATION_ERROR` (400) — `id` не UUID или невалидные поля; `UNAUTHORIZED` (401); `NOT_FOUND` (404) — поиск не найден или чужой; `UNSUPPORTED_FILTER_SCHEMA` (422).
**Пример (curl):**
```bash
curl -X PATCH "http://localhost:4000/api/v1/saved-searches/d4e5f6a7-b8c9-4012-a3b4-c5d6e7f8a9b0" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"is_active":false}'
```

### `DELETE /api/v1/saved-searches/:id`
**Назначение:** удалить свой сохранённый поиск.
**Авторизация:** Bearer (обязательно).
**Path-параметры:** `id` — String (UUID), обяз. — ID сохранённого поиска
**Query-параметры:** нет
**Тело запроса:** нет
**Ответ (2xx):** `204 No Content`.
**Ошибки:** `VALIDATION_ERROR` (400) — `id` не UUID; `UNAUTHORIZED` (401); `NOT_FOUND` (404) — поиск не найден или чужой.
**Пример (curl):**
```bash
curl -X DELETE "http://localhost:4000/api/v1/saved-searches/d4e5f6a7-b8c9-4012-a3b4-c5d6e7f8a9b0" \
  -H "Authorization: Bearer <access_token>"
```

---

## Settings (Публичные настройки)

Публичные фиче-флаги и версии для портала и мобильных клиентов. `@Controller({ path: 'settings/public', version: '1' })` — без guard. Точка расширения: новые клиентские флаги добавляются полями в тот же ответ, а не отдельными эндпоинтами.

### `GET /api/v1/settings/public`
**Назначение:** получить публичные флаги: включены ли промо-функции, поведение карты при наведении, требуется ли согласие с юр-документами и его текущая версия.
**Авторизация:** Публичный.
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:** нет
**Ответ (2xx):** `200 OK`
```json
{
  "promotionsEnabled": false,
  "mapHoverRecenter": false,
  "legalConsentRequired": true,
  "legalConsentVersion": 2
}
```
`promotionsEnabled` bool (включены ли VIP/TOP-промо в UI); `mapHoverRecenter` bool; `legalConsentRequired` bool; `legalConsentVersion` int (сравнивать с `accepted_version` из `GET /auth/me` → решать, показывать ли модалку согласия).

> **Внимание:** ключи ответа — **camelCase** (в отличие от snake_case контрактов остальных модулей).

**Ошибки:** штатных доменных нет; возможен `INTERNAL_ERROR` (500) при сбое.
**Пример (curl):**
```bash
curl -X GET "http://localhost:4000/api/v1/settings/public"
```

---

## Roles (Роли)

Справочник ролей системы (seeded dictionary). `@Controller({ path: 'roles', version: '1' })` c классовыми `@UseGuards(JwtAuthGuard, RolesGuard)` и `@Roles(MODERATOR, ADMIN)` — доступ только модераторам/админам (для UI назначения ролей и фильтров админ-панели).

> Для мобильной команды: в этом модуле есть только чтение справочника. Эндпоинтов «заявка на роль» / «выдача роли пользователю» здесь **нет** — фактическое назначение ролей реализуется в админском модуле (вне `roles.controller.ts`). Код `ROLE_ALREADY_GRANTED` (409) зарезервирован под операции выдачи, но этим контроллером не используется.

### `GET /api/v1/roles`
**Назначение:** вернуть весь справочник ролей (коды + описания), отсортированный по `code`. Роль `GUEST` не сидируется и в ответе отсутствует.
**Авторизация:** Bearer + роли: `MODERATOR`, `ADMIN`.
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:** нет
**Ответ (2xx):** `200 OK` — массив ролей.
```json
[
  { "code": "ADMIN", "description": "Администратор системы" },
  { "code": "AGENT", "description": "Риелтор" },
  { "code": "MODERATOR", "description": "Модератор" },
  { "code": "USER", "description": "Пользователь" }
]
```
`[].code` String (код роли: `USER`, `OWNER`, `AGENT`, `AGENCY`, `LANDLORD`, `PROPERTY_MANAGER`, `MODERATOR`, `ADMIN`); `[].description` String?.
**Ошибки:** `UNAUTHORIZED` (401); `FORBIDDEN` (403) — нет роли `MODERATOR`/`ADMIN`.
**Пример (curl):**
```bash
curl -X GET "http://localhost:4000/api/v1/roles" \
  -H "Authorization: Bearer <admin_or_moderator_token>"
```

---

## Chat (Чат)

Внутренний чат Avino между инициатором переписки и создателем объявления (владельцем/агентом/агентством). Тред уникален по тройке `(listing_id, initiator_id, owner_id)` — повторный `POST` идемпотентен. Все эндпоинты требуют Bearer-токен (класс-уровневый `JwtAuthGuard`): гость без токена → `401 UNAUTHORIZED`.

> **Важно для клиента:** список сообщений (`GET …/messages`) отдаётся в порядке **DESC — новые сверху** (`created_at DESC, id DESC`). Курсор `next_cursor` листает **вглубь истории** (к более старым сообщениям). Для отрисовки ленты снизу вверх клиент разворачивает страницу локально.

### `GET /api/v1/chat/threads`
**Назначение:** список тредов текущего пользователя (где он `initiator` ИЛИ `owner`), keyset-пагинация, свежая активность сверху (`last_message_at DESC NULLS LAST, created_at DESC`). Для каждого треда — превью листинга, собеседник, последняя реплика и счётчик непрочитанных.
**Авторизация:** Bearer (обязательно)
**Path-параметры:** нет
**Query-параметры:**

| Параметр | Тип (Dart) | Обяз. | Описание |
|----------|-----------|-------|----------|
| `limit` | int? | нет | Размер страницы, 1..100, дефолт **20** |
| `cursor` | String? | нет | Непрозрачный keyset-токен (из `meta.next_cursor`) |
| `lang` | String? | нет | Язык превью листинга (`uz`/`ru`/`en`); при отсутствии — из `Accept-Language` |

**Тело запроса:** нет
**Ответ (2xx):** `200`
```json
{
  "data": [
    {
      "id": "3f1c2e9a-1b2c-4d5e-8f90-1a2b3c4d5e6f",
      "listing_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "initiator_id": "11111111-1111-1111-1111-111111111111",
      "owner_id": "22222222-2222-2222-2222-222222222222",
      "last_message_at": "2026-07-03T09:12:44.512Z",
      "unread_count": 2,
      "listing_preview": {
        "title": "2-комнатная квартира в центре",
        "thumbnail_url": "https://cdn.avino.uz/signed/....jpg",
        "price": "450000000",
        "currency": "UZS",
        "status": "ACTIVE"
      },
      "counterparty": {
        "id": "22222222-2222-2222-2222-222222222222",
        "name": "Тимур",
        "avatar_url": null
      },
      "last_message": {
        "id": "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
        "sender_id": "22222222-2222-2222-2222-222222222222",
        "body": "Да, актуально",
        "is_read": false,
        "created_at": "2026-07-03T09:12:44.512Z"
      }
    }
  ],
  "meta": { "limit": 20, "total": 5, "next_cursor": null }
}
```
Нюансы: `listing_preview`, `counterparty`, `last_message` могут быть `null`; `currency` enum `UZS|USD`; `status` листинга enum `NEW|ACTIVE|DRAFT|REJECTED|DELETED|ARCHIVED|SOLD|RENTED` (переписку видно даже после снятия объявления).
**Ошибки:** `VALIDATION_ERROR` (400) — повреждённый `cursor`; `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -H "Authorization: Bearer <access_token>" \
  "http://localhost:4000/api/v1/chat/threads?limit=20"
```

### `POST /api/v1/chat/threads`
**Назначение:** создать или получить тред с создателем листинга (идемпотентно по unique-ключу). Новый тред → `201`, уже существовавший → `200`.
**Авторизация:** Bearer (обязательно)
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `listing_id` | String (UUID) | да | Объявление, владельцу которого пишет пользователь |
| `body` | String? | нет | Зарезервировано под первый месседж (1..5000); **не сохраняется** — принимается ради совместимости контракта |

**Ответ (2xx):** `201` (новый) или `200` (существующий)
```json
{
  "id": "3f1c2e9a-1b2c-4d5e-8f90-1a2b3c4d5e6f",
  "listing_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "initiator_id": "11111111-1111-1111-1111-111111111111",
  "owner_id": "22222222-2222-2222-2222-222222222222",
  "created_at": "2026-07-03T09:00:00.000Z"
}
```
**Ошибки:** `NOT_FOUND` (404) — листинга нет; `LISTING_NOT_AVAILABLE` (422) — листинг не `ACTIVE`; `FORBIDDEN` (403) — попытка писать самому себе; `VALIDATION_ERROR` (400) — `listing_id` не UUID; `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -X POST -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \
  -d '{"listing_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890"}' \
  "http://localhost:4000/api/v1/chat/threads"
```

### `GET /api/v1/chat/threads/:id/messages`
**Назначение:** сообщения треда, keyset-пагинация, **новые сверху** (DESC). Чтение НЕ помечает сообщения прочитанными (для этого — `POST …/read`).
**Авторизация:** Bearer (обязательно) — участник треда (`initiator`/`owner`) ИЛИ `MODERATOR`/`ADMIN` (только чтение)
**Path-параметры:** `id` — String (UUID), обяз. — ID треда
**Query-параметры:**

| Параметр | Тип (Dart) | Обяз. | Описание |
|----------|-----------|-------|----------|
| `limit` | int? | нет | 1..100, дефолт **20** |
| `cursor` | String? | нет | Keyset-токен; листает в историю |

**Тело запроса:** нет
**Ответ (2xx):** `200` (сообщения в порядке DESC — новые сверху)
```json
{
  "data": [
    {
      "id": "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
      "thread_id": "3f1c2e9a-1b2c-4d5e-8f90-1a2b3c4d5e6f",
      "sender_id": "22222222-2222-2222-2222-222222222222",
      "body": "Да, актуально",
      "is_read": false,
      "created_at": "2026-07-03T09:12:44.512Z"
    }
  ],
  "meta": { "limit": 20, "next_cursor": "eyJjcmVhdGVkQXQiOiIuLi4iLCJpZCI6Ii4uLiJ9" }
}
```
`sender_id` может быть `null` (системное/удалённый пользователь). `meta` НЕ содержит `total` (бесконечный скролл в историю).
**Ошибки:** `NOT_FOUND` (404) — треда нет; `FORBIDDEN` (403) — не участник и не модератор/админ; `VALIDATION_ERROR` (400) — `id` не UUID или повреждённый `cursor`; `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -H "Authorization: Bearer <access_token>" \
  "http://localhost:4000/api/v1/chat/threads/3f1c2e9a-1b2c-4d5e-8f90-1a2b3c4d5e6f/messages?limit=30"
```

### `POST /api/v1/chat/threads/:id/messages`
**Назначение:** отправить сообщение в тред. Двигает `last_message_at` и ставит уведомление `NEW_CHAT_MESSAGE` второму участнику (атомарно).
**Авторизация:** Bearer (обязательно) — **только участник** треда (модератор/админ писать не могут, только читают)
**Path-параметры:** `id` — String (UUID), обяз. — ID треда
**Query-параметры:** нет
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `body` | String | да | Текст сообщения, 1..5000. `sender_id` не принимается — берётся из токена |

**Ответ (2xx):** `201`
```json
{
  "id": "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
  "thread_id": "3f1c2e9a-1b2c-4d5e-8f90-1a2b3c4d5e6f",
  "sender_id": "11111111-1111-1111-1111-111111111111",
  "body": "Здравствуйте, объявление актуально?",
  "is_read": false,
  "created_at": "2026-07-03T09:15:00.000Z"
}
```
**Ошибки:** `NOT_FOUND` (404) — треда нет; `FORBIDDEN` (403) — не участник; `LISTING_NOT_AVAILABLE` (422) — листинг `DELETED`; `VALIDATION_ERROR` (400) — `id` не UUID или `body` вне 1..5000; `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -X POST -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \
  -d '{"body":"Здравствуйте, объявление актуально?"}' \
  "http://localhost:4000/api/v1/chat/threads/3f1c2e9a-1b2c-4d5e-8f90-1a2b3c4d5e6f/messages"
```

### `POST /api/v1/chat/threads/:id/read`
**Назначение:** отметить входящие сообщения треда прочитанными (`is_read=true` для чужих сообщений). Идемпотентно.
**Авторизация:** Bearer (обязательно) — только участник треда
**Path-параметры:** `id` — String (UUID), обяз. — ID треда
**Query-параметры:** нет
**Тело запроса:** нет
**Ответ (2xx):** `204 No Content`
**Ошибки:** `NOT_FOUND` (404) — треда нет; `FORBIDDEN` (403) — не участник; `VALIDATION_ERROR` (400) — `id` не UUID; `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -X POST -H "Authorization: Bearer <access_token>" \
  "http://localhost:4000/api/v1/chat/threads/3f1c2e9a-1b2c-4d5e-8f90-1a2b3c4d5e6f/read"
```

---

## Notifications (Уведомления)

In-app лента уведомлений и регистрация push-устройств под будущее Flutter-приложение. Все эндпоинты требуют Bearer (`JwtAuthGuard` на классе): гость → `401`. Владение enforced по `user_id`.

> **Важно для клиента:** поля `title` и `body` уведомления **могут быть `null`** — контент по умолчанию не хранится на сервере, а собирается на клиенте из `type` + `data_json` (локализуемо). Клиент должен рендерить карточку из `type`/`data_json`, а не полагаться на `title`/`body`.

### `GET /api/v1/notifications`
**Назначение:** лента уведомлений пользователя, keyset-пагинация, свежие сверху (`created_at DESC, id DESC`). В `meta.unread` — глобальный счётчик непрочитанных (бейдж), не зависит от фильтров.
**Авторизация:** Bearer (обязательно)
**Path-параметры:** нет
**Query-параметры:**

| Параметр | Тип (Dart) | Обяз. | Описание |
|----------|-----------|-------|----------|
| `status` | String? (enum) | нет | Фильтр: `PENDING`, `SENT`, `FAILED`, `READ` |
| `type` | String? (enum) | нет | Фильтр по типу (см. `NotificationType` в справочнике enum) |
| `cursor` | String? | нет | Keyset-токен |
| `limit` | int? | нет | 1..100, дефолт **20** |

**Тело запроса:** нет
**Ответ (2xx):** `200`
```json
{
  "data": [
    {
      "id": "c0ffee00-dead-beef-cafe-000000000001",
      "type": "NEW_CHAT_MESSAGE",
      "channel": "IN_APP",
      "status": "PENDING",
      "title": null,
      "body": null,
      "data_json": {
        "thread_id": "3f1c2e9a-1b2c-4d5e-8f90-1a2b3c4d5e6f",
        "listing_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "message_id": "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
        "sender_id": "22222222-2222-2222-2222-222222222222"
      },
      "read_at": null,
      "created_at": "2026-07-03T09:15:00.000Z"
    }
  ],
  "meta": { "limit": 20, "total": 12, "unread": 3, "next_cursor": null }
}
```
`channel` enum `EMAIL|PUSH|IN_APP|SMS`; `data_json` — произвольный JSON-объект (структура зависит от `type`), может быть `null`.
**Ошибки:** `VALIDATION_ERROR` (400) — неизвестное значение enum `status`/`type` или повреждённый `cursor`; `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -H "Authorization: Bearer <access_token>" \
  "http://localhost:4000/api/v1/notifications?type=NEW_CHAT_MESSAGE&limit=20"
```

### `POST /api/v1/notifications/read-all`
**Назначение:** отметить все непрочитанные прочитанными (`read_at=now`, `status=READ`). Идемпотентно.
**Авторизация:** Bearer (обязательно)
**Path/Query/Body:** нет
**Ответ (2xx):** `204 No Content`
**Ошибки:** `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -X POST -H "Authorization: Bearer <access_token>" \
  "http://localhost:4000/api/v1/notifications/read-all"
```

### `POST /api/v1/notifications/devices`
**Назначение:** регистрация push-токена устройства (FCM/APNs/web-push). Идемпотентно по `push_token` (upsert): существующий токен переназначается текущему пользователю и реактивируется — коллизии `409` не бывает.
**Авторизация:** Bearer (обязательно)
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `platform` | String (enum) | да | `ANDROID` \| `IOS` \| `WEB` |
| `push_token` | String | да | Токен FCM/APNs, 1..512 символов |

**Ответ (2xx):** `201`
```json
{ "id": "d0d0d0d0-1111-2222-3333-444444444444", "platform": "ANDROID", "is_active": true }
```
**Ошибки:** `VALIDATION_ERROR` (400) — неизвестная `platform` или `push_token` вне 1..512; `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -X POST -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \
  -d '{"platform":"ANDROID","push_token":"fcm_abc123..."}' \
  "http://localhost:4000/api/v1/notifications/devices"
```

### `DELETE /api/v1/notifications/devices/:id`
**Назначение:** отвязать своё устройство (hard delete, освобождает `push_token`).
**Авторизация:** Bearer (обязательно) — только своё устройство
**Path-параметры:** `id` — String (UUID), обяз. — ID устройства (из ответа регистрации)
**Query-параметры:** нет
**Тело запроса:** нет
**Ответ (2xx):** `204 No Content`
**Ошибки:** `NOT_FOUND` (404) — устройства нет или оно чужое; `VALIDATION_ERROR` (400) — `id` не UUID; `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -X DELETE -H "Authorization: Bearer <access_token>" \
  "http://localhost:4000/api/v1/notifications/devices/d0d0d0d0-1111-2222-3333-444444444444"
```

### `POST /api/v1/notifications/:id/read`
**Назначение:** отметить одно своё уведомление прочитанным. Идемпотентно.
**Авторизация:** Bearer (обязательно) — только своё уведомление
**Path-параметры:** `id` — String (UUID), обяз. — ID уведомления
**Query-параметры:** нет
**Тело запроса:** нет
**Ответ (2xx):** `204 No Content`
**Ошибки:** `NOT_FOUND` (404) — уведомления нет или оно чужое; `VALIDATION_ERROR` (400) — `id` не UUID; `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -X POST -H "Authorization: Bearer <access_token>" \
  "http://localhost:4000/api/v1/notifications/c0ffee00-dead-beef-cafe-000000000001/read"
```

---

## Tour Requests (Запросы на просмотр)

Заявки на просмотр (тур) объявления. Заявитель выбирает дату и временное окно из предложенных владельцем; слот эксклюзивен — активная заявка (`PENDING`/`CONFIRMED`) блокирует его. Все эндпоинты требуют Bearer (`JwtAuthGuard` на классе): гость → `401`.

Статусы (`TourRequestStatus`): `PENDING` → `CONFIRMED`|`DECLINED` (решение владельца) | `CANCELLED` (отмена заявителем). `DECLINED`/`CANCELLED` — терминальны.

### `POST /api/v1/tour-requests`
**Назначение:** создать заявку на просмотр. Ставит уведомление `NEW_LEAD` владельцу. Горизонт бронирования — 30 дней от сегодня.
**Авторизация:** Bearer (обязательно)
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `listing_id` | String (UUID) | да | Объявление |
| `requested_date` | String | да | Дата `YYYY-MM-DD`; сегодня…+30 дней |
| `window_start` | String | да | Начало окна `HH:MM` (24ч); должно быть среди предложенных владельцем |
| `window_end` | String | да | Конец окна `HH:MM` |
| `requester_name` | String | да | Имя заявителя, 1..120 |
| `requester_phone` | String | да | Телефон, 3..32 |
| `message` | String? | нет | Комментарий, до 500 символов |

**Ответ (2xx):** `201`
```json
{
  "id": "7c7c7c7c-aaaa-bbbb-cccc-dddddddddddd",
  "listing_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "requester_id": "11111111-1111-1111-1111-111111111111",
  "status": "PENDING",
  "requested_date": "2026-07-10",
  "window_start": "14:00",
  "window_end": "15:00",
  "requester_name": "Азиз",
  "requester_phone": "+998901234567",
  "message": "Можно ли посмотреть в первой половине дня?",
  "created_at": "2026-07-03T09:20:00.000Z"
}
```
**Ошибки:** `NOT_FOUND` (404) — листинга нет или он `DELETED`; `LISTING_NOT_AVAILABLE` (**409**) — листинг не `ACTIVE` или туры выключены (`toursEnabled=false`); `FORBIDDEN` (403) — заявка на собственное объявление; `VALIDATION_ERROR` (**422**) — окно не предлагается для листинга либо `requested_date` вне диапазона сегодня…+30 дней; `VALIDATION_ERROR` (400) — нарушен формат полей DTO; `TOUR_REQUEST_DUPLICATE` (**409**) — своя активная заявка на этот слот уже есть; `TOUR_SLOT_TAKEN` (**409**) — слот занят чужой активной заявкой; `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -X POST -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \
  -d '{"listing_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","requested_date":"2026-07-10","window_start":"14:00","window_end":"15:00","requester_name":"Азиз","requester_phone":"+998901234567"}' \
  "http://localhost:4000/api/v1/tour-requests"
```

### `GET /api/v1/tour-requests/taken`
**Назначение:** занятые (активные `PENDING`/`CONFIRMED`) слоты листинга на ближайшие 30 дней — для формы записи. Личные данные заявителей НЕ отдаются; `PENDING` и `CONFIRMED` снаружи неразличимы.
**Авторизация:** Bearer (обязательно)
**Path-параметры:** нет
**Query-параметры:**

| Параметр | Тип (Dart) | Обяз. | Описание |
|----------|-----------|-------|----------|
| `listing_id` | String (UUID) | да | Объявление |

**Тело запроса:** нет
**Ответ (2xx):** `200`
```json
{
  "data": [
    { "requested_date": "2026-07-10", "window_start": "14:00", "window_end": "15:00" },
    { "requested_date": "2026-07-11", "window_start": "10:00", "window_end": "11:00" }
  ]
}
```
**Ошибки:** `NOT_FOUND` (404) — листинга нет или он `DELETED`; `VALIDATION_ERROR` (400) — `listing_id` не UUID; `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -H "Authorization: Bearer <access_token>" \
  "http://localhost:4000/api/v1/tour-requests/taken?listing_id=a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

### `GET /api/v1/tour-requests/outgoing`
**Назначение:** исходящие заявки текущего пользователя (где он заявитель), keyset-пагинация, свежие сверху.
**Авторизация:** Bearer (обязательно)
**Path-параметры:** нет
**Query-параметры:**

| Параметр | Тип (Dart) | Обяз. | Описание |
|----------|-----------|-------|----------|
| `limit` | int? | нет | 1..**50**, дефолт **20** (мусор/пусто → дефолт) |
| `cursor` | String? | нет | Keyset-токен |

**Тело запроса:** нет
**Ответ (2xx):** `200` — `{ data: TourRequestResponse[], meta: { limit, total, next_cursor } }` (форма элемента — как в `POST /tour-requests`).
**Ошибки:** `UNAUTHORIZED` (401). (Повреждённый `cursor` не выдаёт ошибку — трактуется как первая страница.)
**Пример (curl):**
```bash
curl -H "Authorization: Bearer <access_token>" \
  "http://localhost:4000/api/v1/tour-requests/outgoing?limit=20"
```

### `GET /api/v1/tour-requests/incoming`
**Назначение:** входящие заявки на объявления текущего пользователя (где он владелец листинга), keyset-пагинация, свежие сверху.
**Авторизация:** Bearer (обязательно)
**Path-параметры:** нет
**Query-параметры:** `limit` int? (1..50, дефолт 20), `cursor` String? — как у `/outgoing`.
**Тело запроса:** нет
**Ответ (2xx):** `200` — та же форма, что у `/outgoing`.
**Ошибки:** `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -H "Authorization: Bearer <access_token>" \
  "http://localhost:4000/api/v1/tour-requests/incoming?limit=20"
```

### `PATCH /api/v1/tour-requests/:id/status`
**Назначение:** сменить статус заявки. `CONFIRM`/`DECLINE` — только владелец листинга (из `PENDING`); `CANCEL` — только заявитель (из `PENDING`/`CONFIRMED`). Ставит уведомление `TOUR_REQUEST_STATUS_CHANGED` второй стороне.
**Авторизация:** Bearer (обязательно) — владелец листинга (`CONFIRM`/`DECLINE`) или заявитель (`CANCEL`)
**Path-параметры:** `id` — String (UUID), обяз. — ID заявки
**Query-параметры:** нет
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `action` | String (enum) | да | `CONFIRM` \| `DECLINE` \| `CANCEL` |

**Ответ (2xx):** `200` — обновлённый объект `TourRequestResponse` (с новым `status`).
**Ошибки:** `NOT_FOUND` (404) — заявки нет; `FORBIDDEN` (403) — роль не соответствует действию; `INVALID_STATUS_TRANSITION` (**422**) — недопустимый переход; `TOUR_SLOT_TAKEN` (**409**) — при `CONFIRM` слот успела занять другая активная заявка; `VALIDATION_ERROR` (400) — `id` не UUID или неизвестный `action`; `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -X PATCH -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \
  -d '{"action":"CONFIRM"}' \
  "http://localhost:4000/api/v1/tour-requests/7c7c7c7c-aaaa-bbbb-cccc-dddddddddddd/status"
```

---

## Complaints (Жалобы)

Пользовательская подача жалобы на объявление. Требует Bearer (`JwtAuthGuard` на классе): гость → `401`. Любая аутентифицированная роль может пожаловаться. Админ-разбор жалоб — отдельный контроллер (`/api/v1/admin/complaints`), здесь не документируется.

### `POST /api/v1/complaints`
**Назначение:** пожаловаться на листинг. Создаёт жалобу со статусом `NEW`. `reporter_id` берётся из токена.
**Авторизация:** Bearer (обязательно)
**Path-параметры:** нет
**Query-параметры:** нет
**Тело запроса:**

| Поле | Тип (Dart) | Обяз. | Описание |
|------|-----------|-------|----------|
| `listing_id` | String (UUID) | да | Объявление, на которое жалоба |
| `reason` | String | да | Причина, до 120 символов |
| `details` | String? | нет | Свободный текст-пояснение |

**Ответ (2xx):** `201`
```json
{ "id": "b0b0b0b0-eeee-ffff-0000-111111111111", "status": "NEW" }
```
`status` — enum `ComplaintStatus`: `NEW|IN_REVIEW|RESOLVED|REJECTED` (у только что созданной — всегда `NEW`).
**Ошибки:** `NOT_FOUND` (404) — листинга нет или он `DELETED`; `VALIDATION_ERROR` (400) — `listing_id` не UUID или `reason` длиннее 120; `UNAUTHORIZED` (401).
**Пример (curl):**
```bash
curl -X POST -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \
  -d '{"listing_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","reason":"Спам / дубликат","details":"Тот же объект под несколькими объявлениями"}' \
  "http://localhost:4000/api/v1/complaints"
```

---

## Health (Проверка доступности)

Простой liveness-эндпоинт для мониторинга и load-balancer'а.

### `GET /api/v1/health`
**Назначение:** проверка, что API поднят и отвечает.
**Авторизация:** Публичный (guard отсутствует)
**Path/Query/Body:** нет
**Ответ (2xx):** `200`
```json
{ "status": "ok", "service": "avino-api" }
```
**Ошибки:** нет (при работающем сервисе всегда `200`).
**Пример (curl):**
```bash
curl "http://localhost:4000/api/v1/health"
```

---

## Итог

Документ покрывает **весь публичный (клиентский) периметр API v1**, пригодный для интеграции Flutter-приложения. Административные контроллеры (`/api/v1/admin/*`, admin-настройки, модерация, рассылки, ручная активация промо) сюда намеренно не включены — они предназначены для веб-панели, а не для мобильного клиента.

Для генерации Dart-моделей и клиента можно опираться на snake_case-контракты выше; сгенерированный OpenAPI-спек лежит в `docs/openapi.json` (учитывать, что он покрывает не все эндпоинты — источник истины по спорным местам — контроллеры в `apps/api/src/**`).
