# Terms & Privacy + Auth — гайд для мобильного разработчика

> Актуально на 2026-07-25. Источник — живой код `apps/api/src` (auth, users/legal-consent,
> legal-documents, settings/public). Изменения контракта сверяйте с
> `docs/openapi.json` / `docs/API.md`.

## Базовое

- **Base URL (prod):** `https://api.avino.uz/api/v1`
- Защищённые ручки: заголовок `Authorization: Bearer <access_token>`.
- Язык контента (юр-документы и т.п.): заголовок `Accept-Language: ru | uz | en`
  (правило сервера: `uz*` → uz, `en*` → en, иначе ru).
- Тела и поля контракта — **snake_case**.

---

## 1. Auth API

### 1.1. Ключевое отличие мобилки от web (ADR-0153)

Web-клиенты получают refresh-токен в httpOnly-cookie `avino_rt`.
**Мобилка cookie не использует.** Refresh-токен всегда:

- приходит **в теле ответа** (`refresh_token`);
- отправляется обратно **в теле запроса** (`{ "refresh_token": "..." }`).

Хранение:
- `access_token` — в памяти процесса (живёт ~15 мин, `expires_in` в секундах);
- `refresh_token` — в secure storage (iOS Keychain / Android EncryptedSharedPreferences).

### 1.2. Логин по OTP (SMS / Email)

**Запрос кода:**
```
POST /auth/otp/request
{ "channel": "SMS", "destination": "+998901234567" }
→ 200
```
- `channel`: `SMS | EMAIL`. Для `EMAIL` в `destination` — e-mail.
- Лимиты: 10 запросов / 60 сек на IP; прогрессивные resend-кулдауны 60/120/300/600 сек;
  кап 5 кодов / 24 ч на контакт.

**Подтверждение кода:**
```
POST /auth/otp/verify
{ "channel": "SMS", "destination": "+998901234567", "code": "123456" }
→ 200
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": { ...сводка пользователя... }
}
```
- `code` — ровно 6 цифр.
- Первый вход = регистрация (создаётся пользователь + роль `USER`).
- Ошибки: `OTP_INVALID`, `OTP_ATTEMPTS_EXCEEDED`, `USER_BLOCKED`.
- Лимит verify: 10 запросов / 60 сек.

### 1.3. Google / Apple

```
POST /auth/google
{ "id_token": "<Google ID token из нативного SDK / GIS>" }

POST /auth/apple
{ "id_token": "<Apple ID token>", "first_name": "...", "last_name": "..." }
```
- Ответ — тот же, что у `otp/verify`.
- Первый вход = регистрация.
- Apple отдаёт имя только при первом входе — передавайте `first_name/last_name`
  для посева профиля (оба поля опциональны).
- Провайдер не настроен на сервере → `503`.

### 1.4. Ротация токена

```
POST /auth/refresh
{ "refresh_token": "eyJ..." }        // мобилка — ОБЯЗАТЕЛЬНО в теле
→ 200
{ "access_token": "...", "refresh_token": "...", "token_type": "Bearer", "expires_in": 900 }
```
- Ответ **без** блока `user`.
- ⚠️ **Ротация одноразовая**: старый refresh сразу невалиден, сервер возвращает новый.
- ⚠️ Повторное использование уже ротированного токена → `TOKEN_REUSED` →
  отзыв **всей session family** (пользователя разлогинит).
  - Не запускайте параллельные `refresh` с одним токеном.
  - Сериализуйте refresh (mutex / lock), новый `refresh_token` сохраняйте атомарно
    до следующего использования.
- Лимит: 20 запросов / 60 сек.

### 1.5. Прочее

| Метод | Назначение |
|-------|-----------|
| `GET /auth/me` (Bearer) | текущий пользователь: `id, phone, email, status, roles, profile, legal_consent` |
| `GET /auth/sessions` (Bearer) | список активных сессий («Мои устройства») |
| `DELETE /auth/sessions/:fid` (Bearer) | отозвать конкретную сессию |
| `POST /auth/logout` (Bearer + `{ "refresh_token": "..." }`) | 204, отзывает текущую family |

Если у `refresh`/`logout` токена нет ни в cookie, ни в теле → `400 VALIDATION_ERROR`.

---

## 2. Terms & Privacy — согласие

Механика — **сравнение версий** (design 2026-06-29). Требуемая версия согласия
app-wide (одно число на всё приложение). Клиент сам решает, показывать ли
блокирующую модалку.

### 2.1. Узнать требуемую версию (без авторизации)

```
GET /settings/public
→ {
  "legalConsentRequired": true,   // включён ли гейт согласия
  "legalConsentVersion": 3,       // текущая требуемая версия
  ...другие публичные флаги
}
```

### 2.2. Узнать, что принял пользователь

Из `GET /auth/me`:
```json
"legal_consent": {
  "accepted_version": 2,          // null, если не соглашался ни разу
  "accepted_at": "2026-07-01T10:00:00.000Z"
}
```

### 2.3. Правило: показывать ли модалку

```
legalConsentRequired === true
&& (accepted_version === null || accepted_version < legalConsentVersion)
```

### 2.4. Показать текст документов

```
GET /legal/terms       (Accept-Language: ru|uz|en)
GET /legal/privacy
→ 200
{
  "kind": "terms",
  "version": 3,
  "title": "Пользовательское соглашение",
  "body_md": "...(Markdown)...",
  "published_at": "2026-07-21T00:00:00.000Z"
}
```
- `body_md` рендерить как **Markdown**.
- Слаги только `terms` и `privacy`; остальное → `404`.
- **`404` — нормальный кейс**: админ ещё не опубликовал версию.
  Показывайте вшитый в приложение fallback-текст.

### 2.5. Записать согласие

```
POST /users/me/legal-consent          (Bearer)
{ "terms_accepted": true, "privacy_accepted": true }
→ 200
{ "accepted_version": 3, "accepted_at": "2026-07-25T12:00:00.000Z" }
```
- **Обе галочки обязаны быть `true`**, иначе `422 CONSENT_INCOMPLETE`.
- Append-only: каждая отправка — новая строка аудита; версию проставляет сервер
  (клиент её не передаёт).
- После успеха `accepted_version` в `/auth/me` сравняется с `legalConsentVersion`
  — модалку больше не показываем.

---

## 3. Типичный флоу при старте приложения

1. `GET /settings/public` → `legalConsentRequired`, `legalConsentVersion`.
2. Есть сохранённая сессия → `POST /auth/refresh` (сериализованно) → свежий access.
3. `GET /auth/me` → профиль + `legal_consent`.
4. Сработал гейт (§2.3) → показать модалку:
   `GET /legal/terms|privacy` → пользователь принял → `POST /users/me/legal-consent`.
5. Дальше — обычная работа с Bearer. На `401`: один `refresh`; при неудаче — разлогин
   (чистим secure storage, ведём на экран входа).

---

## 4. Примеры (curl)

```bash
BASE=https://api.avino.uz/api/v1

# 1. запросить OTP
curl -X POST $BASE/auth/otp/request \
  -H 'Content-Type: application/json' \
  -d '{"channel":"SMS","destination":"+998901234567"}'

# 2. подтвердить → получить токены
curl -X POST $BASE/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"channel":"SMS","destination":"+998901234567","code":"123456"}'

# 3. me (+ legal_consent)
curl $BASE/auth/me -H "Authorization: Bearer $ACCESS"

# 4. публичные флаги (требуемая версия согласия)
curl $BASE/settings/public

# 5. текст документа
curl $BASE/legal/terms -H 'Accept-Language: ru'

# 6. записать согласие
curl -X POST $BASE/users/me/legal-consent \
  -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
  -d '{"terms_accepted":true,"privacy_accepted":true}'

# 7. ротация (refresh — в теле)
curl -X POST $BASE/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refresh_token":"'"$REFRESH"'"}'
```

---

## 5. Справочник ошибок

| Код | Где | Значение |
|-----|-----|----------|
| `VALIDATION_ERROR` (400) | refresh/logout | нет токена ни в cookie, ни в теле |
| `OTP_INVALID` | otp/verify | неверный / истёкший / погашенный код |
| `OTP_ATTEMPTS_EXCEEDED` | otp/verify | исчерпан лимит попыток на код |
| `USER_BLOCKED` | login | аккаунт заблокирован |
| `TOKEN_REUSED` | refresh | повторное использование ротированного токена → отзыв family |
| `CONSENT_INCOMPLETE` (422) | legal-consent | не обе галочки `true` |
| `NOT_FOUND` (404) | legal/:kind | неизвестный слаг **или** версия ещё не опубликована |
