# Дизайн: Sign in with Apple (вход через Apple ID / iCloud)

- **Дата:** 2026-06-19
- **Автор:** Claude (по запросу владельца проекта)
- **Статус:** утверждён к реализации
- **Связано:** ADR-0065 (Google sign-in + Telegram admin alerts), будущий **ADR-0097**
- **Затрагивает:** `apps/api`, `apps/client`, `docs/` (НЕ `apps/web`)

## Цель

Добавить «Вход через Apple» (Sign in with Apple — авторизация по Apple ID, он же
аккаунт iCloud) на публичный портал, **зеркально** существующему «Входу через
Google». Для пользователя это вторая кнопка социального входа в `LoginModal`.

## Контекст: как сейчас устроен Google-вход (эталон для зеркалирования)

- **Backend:** `POST /api/v1/auth/google` (`auth.controller.ts`) → `GoogleAuthService`
  верифицирует ID-token **офлайн** через `google-auth-library`, связывает/создаёт
  пользователя **по верифицированному email** (без колонки `provider_id`, см.
  ADR-0065), выдаёт JWT через общий `TokenService`, пишет `auditLog`
  (`action: 'LOGIN', metadata: { provider: 'GOOGLE' }`) и шлёт fire-and-forget
  Telegram-алерт. Config-gated: нет `GOOGLE_CLIENT_ID` → `503 AUTH_PROVIDER_UNAVAILABLE`.
- **Client:** `GoogleSignInButton.tsx` грузит GIS SDK, получает credential, шлёт
  `useGoogleLoginMutation` (`authApi.ts`); `LoginModal` рендерит кнопку под формой
  OTP. Скрыта, если не задан `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
- **Admin (`apps/web`):** Google НЕ добавляли — админы входят только по OTP.

## Принятые решения (две развилки)

1. **Связывание аккаунта — по верифицированному email** (как у Google, ADR-0065).
   Без миграции БД. Privacy-relay email от Apple стабилен, поэтому повторный вход
   работает. **Trade-off (задокументирован):** пользователь, вошедший раньше через
   Gmail, а потом через Apple с «Hide My Email», получит два разных аккаунта.
2. **Только публичный портал** (`apps/client`). Админка (`apps/web`) не трогается,
   админы остаются на OTP.

## Ключевые технические факты про Apple (чем отличается от Google)

- **Достаточно офлайн-верификации ID-token.** Чтобы повторить флоу Google, нам нужен
  только **Service ID** в роли audience (`APPLE_CLIENT_ID`). Приватный ключ Apple
  (`.p8`), Team ID и Key ID **НЕ нужны** — они требуются только для серверного
  обмена `code`→токены и отзыва refresh-токенов, чего Google-флоу тоже не делает.
- **Имя приходит только при первой авторизации** и **не в ID-token**, а отдельным
  полем `user` в ответе JS SDK. Поэтому имя пробрасываем опциональными полями DTO;
  при повторных входах их нет — это нормально.
- **`email_verified` / `is_private_email` Apple иногда отдаёт строкой** `"true"`, а
  не булевым — при проверке приводим к boolean (coerce).
- Веб-флоу требует зарегистрированный **redirectURI поверх HTTPS** даже при
  `usePopup: true`; на `localhost` Apple не работает.

## Backend (`apps/api`)

### Маршрут и DTO
- `POST /api/v1/auth/apple` в `auth.controller.ts`, `@HttpCode(200)`, возвращает тот
  же контракт `VerifyOtpResult` (access/refresh токены + user), что `/auth/google` и
  `/auth/otp/verify`.
- `AppleLoginDto`: `{ id_token: string (required); first_name?: string; last_name?: string }`.

### `AppleAuthService` (зеркало `GoogleAuthService`)
- `verifyToken()` — верифицирует ID-token **офлайн** против JWKS Apple
  (`https://appleid.apple.com/auth/keys`): подпись, `iss === https://appleid.apple.com`,
  `aud ∈` список разрешённых client ID, `exp`.
  - Библиотека: **`apple-signin-auth`** (`verifyIdToken`) как ближайший аналог
    `google-auth-library`. На этапе плана проверяем актуальность/поддержку пакета;
    запасной вариант — `jose` + `createRemoteJWKSet`.
  - Coerce `email_verified`/`is_private_email` из строки в boolean.
  - Если `email_verified` не truthy → `401 UNAUTHORIZED`.
- `resolveByEmail()` — **переиспользует логику связывания по email из Google**: ищет
  не-DELETED пользователя по email (case-insensitive) → если найден и не BLOCKED,
  обновляет `isEmailVerified`/`lastLoginAt`; иначе создаёт `User` + `UserProfile`
  (имя из опциональных полей DTO либо пустое) + роль `USER` по умолчанию, в одной
  транзакции.
- Сессия — через общий **`TokenService.issueSession()`** (без дублирования).
- `auditLog` `action: 'LOGIN', metadata: { provider: 'APPLE' }` + fire-and-forget
  Telegram-алерт с `provider='APPLE'` (переиспользуем `TelegramService`).

### Config-gating (идентично Google)
- Нет `APPLE_CLIENT_ID` → `503 AUTH_PROVIDER_UNAVAILABLE`. Без креды приложение
  работает без изменений.

### Forward-compat (дёшево)
- `APPLE_CLIENT_ID` парсится как **список audience через запятую**. Сейчас это
  веб-**Service ID**; если позже появится нативное iOS-приложение — добавляем его
  bundle ID без правок кода. Это единственное отклонение от Google-паттерна.

## База данных
**Миграции нет.** Связывание по верифицированному email, как в ADR-0065. Колонки
`provider`/`provider_id` не добавляем.

## Client (`apps/client`) — зеркало `GoogleSignInButton`

- **`AppleSignInButton.tsx`:** грузит Apple JS SDK
  (`https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js`),
  `AppleID.auth.init({ clientId: NEXT_PUBLIC_APPLE_CLIENT_ID, scope: 'name email', redirectURI: NEXT_PUBLIC_APPLE_REDIRECT_URI, usePopup: true })`.
  Клик → `AppleID.auth.signIn()` (popup) → POST `{ id_token, first_name?, last_name? }`
  через новую `useAppleLoginMutation` в `authApi.ts` (тот же `setCredentials` +
  инвалидация тегов `['Auth','User']`, что у Google). Кнопка по гайдлайнам Apple
  (чёрная, логотип). Возвращает `null`, если `NEXT_PUBLIC_APPLE_CLIENT_ID` не задан
  (паритет gating с Google).
- **`LoginModal.tsx`:** `<AppleSignInButton>` рендерится сразу под
  `<GoogleSignInButton>` в той же секции «или»; закрывает модалку при успехе.
- **i18n:** добавить ключ `continueWithApple` в `ru.json` / `uz.json` / `en.json`
  (паритет RU/UZ/EN), один писатель JSON.
- **Admin (`apps/web`):** не трогаем.

## Конфигурация и секреты

| Переменная | Где | Назначение |
|---|---|---|
| `APPLE_CLIENT_ID` | backend | Список allowed audience (Service ID), через запятую. `@IsOptional` в `env.validation.ts`, добавить в `.env.example` с комментарием, без реального дефолта |
| `NEXT_PUBLIC_APPLE_CLIENT_ID` | frontend | Service ID, отдаётся в браузер |
| `NEXT_PUBLIC_APPLE_REDIRECT_URI` | frontend | HTTPS-origin портала, зарегистрированный в Service ID |

## Тесты
- Unit-тесты `AppleAuthService` по образцу `google-auth.service`-тестов (мок
  верификатора): создание vs связывание, BLOCKED → 403, плохой токен /
  `email_verified=false` → 401, нет `APPLE_CLIENT_ID` → 503, coerce
  `email_verified:"true"`, посев имени из опциональных полей.
- API-сьют остаётся зелёным; client lint/build зелёные.

## Документация
- `docs/API.md`: раздел `POST /api/v1/auth/apple` рядом с `/auth/google` (на русском,
  та же таблица ошибок).
- **Новый ADR-0097** «Sign in with Apple (web portal)» со ссылкой на ADR-0065:
  офлайн-верификация ID-token, связывание по email (без миграции), приватный ключ не
  нужен, multi-audience env, config-gating, только портал.

## Вне рамок (YAGNI)
- Серверный обмен `code`→токены и отзыв refresh-токенов (приватный ключ Apple) — нет.
- Сборка нативного iOS-флоу — нет (backend к нему готов через multi-audience).
- Схема `provider_id` — нет.
- Кнопка Apple в админке — нет.
- `nonce` — нет (у Google тоже нет; можно добавить позже).

## Известное ограничение
Реальная end-to-end проверка требует развёрнутого **HTTPS**-хоста и
верифицированного Service ID / return URL — на `localhost` Apple не заработает.
Локально проверяем unit-тестами и тем, что выключенный путь скрывает кнопку (та же
ситуация, что была у Google).

## Предусловия (операционные, вне кода)
- Платное членство в **Apple Developer Program**.
- Создан **App ID** с включённым Sign in with Apple и **Service ID** с привязанным
  доменом портала и зарегистрированным return URL (HTTPS).
- Значения `APPLE_CLIENT_ID` / `NEXT_PUBLIC_APPLE_CLIENT_ID` /
  `NEXT_PUBLIC_APPLE_REDIRECT_URI` прописываются в deploy-env при выкатке.

## Критерии готовности
- `POST /api/v1/auth/apple` работает: валидный токен → создание/линковка + сессия;
  невалидный → 401; BLOCKED → 403; нет креды → 503.
- Кнопка Apple видна в `LoginModal` при заданном `NEXT_PUBLIC_APPLE_CLIENT_ID` и
  скрыта без него; успешный вход закрывает модалку и логинит.
- i18n RU/UZ/EN на месте.
- Зелёные api-тесты + client lint/build.
- `docs/API.md` обновлён, ADR-0097 добавлен.
