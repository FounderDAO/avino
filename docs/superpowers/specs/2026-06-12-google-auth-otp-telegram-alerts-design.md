# Google Auth · проверка OTP-флоу · Telegram-алерты админу — дизайн

**Дата:** 2026-06-12
**Статус:** утверждён к реализации
**Область:** `apps/api` (auth, новый telegram-модуль, admin-settings), `apps/client` (Google-кнопка), `apps/web` (runtime-тоггл)

## 1. Цель

Три связанные задачи по аутентификации, поставляемые одной фича-веткой:

1. **Google Sign-In** на публичном портале (`apps/client`) — passwordless вход через Google ID-token.
2. **Полная верификация существующего OTP-флоу** регистрации/входа (request → verify → создание юзера → сессия → `/auth/me`).
3. **Telegram-алерты админу** на auth-события (запрос OTP с кодом, успешный вход, неудачный verify) с runtime-тогглом без пересборки.

Все интеграции **config-gated** по существующему в проекте паттерну «нет кредов → no-op / dev-лог» (`SmsService`, `EmailService`).

## 2. Принятые решения (из брейншторма)

| Развилка | Решение | Обоснование |
|---|---|---|
| Верификация Google ID-token | `google-auth-library` (офлайн-проверка подписи) | Стандарт, проверяет `aud`/`iss`/`exp`/подпись локально; это auth |
| Доставка Telegram | Прямой `fetch` к Bot API, fire-and-forget | Зеркалит `SmsService`; никогда не роняет логин; BullMQ — будущее |
| Связывание Google-аккаунта | По верифицированному email (без миграции) | `email_verified=true` обязателен; `User.googleId` — future hardening |
| Содержимое TG-алерта | Метаданные **+ OTP-код** (флаг `TELEGRAM_INCLUDE_OTP_CODE`) | Выбор пользователя; MVP позволяет ручной релей кода |
| События TG-алерта | Полный аудит: request, verify-success, verify-fail | Выбор пользователя |
| Master-тоггл | Двухслойный: env-дефолт (dev=true/prod=false) + DB-override через `/admin/telegram-settings` | Переключение без пересборки |

## 3. Архитектура

Новый изолированный модуль `apps/api/src/telegram/` (транспорт + формат) плюс точечные хуки в существующих `OtpService`/`AuthService`. Google-вход — новый `GoogleAuthService` + метод контроллера. Runtime-тоггл — новый admin-эндпоинт поверх существующей таблицы `app_settings`.

```
apps/api/src/
  telegram/
    telegram.module.ts          # экспортирует TelegramService
    telegram.service.ts         # транспорт + gate isEnabled()
    telegram.constants.ts       # TELEGRAM_NOTIFICATIONS_ENABLED_KEY
    auth-alert.util.ts          # форматтеры сообщений (чистые функции)
    telegram.service.spec.ts
    auth-alert.util.spec.ts
    index.ts
  auth/
    google-auth.service.ts      # verify Google ID-token + resolve user + сессия
    google-auth.service.spec.ts
    dto/google-login.dto.ts     # { id_token }
    auth.controller.ts          # + POST /auth/google
    otp.service.ts              # + хук TG-алерта (request)
    auth.service.ts             # + хуки TG-алерта (success/fail)
    auth.module.ts              # + imports TelegramModule, provider GoogleAuthService
  admin/
    admin-telegram-settings.controller.ts   # GET/PATCH /admin/telegram-settings
    admin-telegram-settings.service.ts
    admin-telegram-settings.service.spec.ts
    dto/update-telegram-settings.dto.ts      # { enabled: boolean }
    admin.module.ts             # + регистрация контроллера/сервиса
  config/
    configuration.ts            # + googleConfig, telegramConfig
    env.validation.ts           # + optional env-переменные
```

## 4. Компоненты и контракты

### 4.1 `TelegramService` (транспорт + gate)

- Зависимости: `ConfigService`, `PrismaService` (PrismaModule глобальный).
- `async sendAdminAlert(text: string): Promise<void>`
  - Шаг 1 — gate: `if (!(await this.isEnabled())) return;`
  - Шаг 2 — транспорт: нет `botToken`/`adminChatId` → `logUndelivered` (вне prod — `[DEV Telegram → admin] <text>`; в prod — `warn` «не настроен»), `return`.
  - Шаг 3 — `fetch` `POST https://api.telegram.org/bot<token>/sendMessage` body `{ chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true }`.
  - **Никогда не бросает**: весь метод обёрнут в try/catch с `logger.error`. Сбой Telegram не влияет на логин.
- `async isEnabled(): Promise<boolean>`
  - Читает `app_settings[TELEGRAM_NOTIFICATIONS_ENABLED_KEY]`. Строка `'true'`/`'false'` → boolean.
  - Нет строки → env-дефолт `config.get('telegram.notificationStateDefault')`.

Вызов из доменных сервисов — **fire-and-forget**: `void this.telegram.sendAdminAlert(text)` (не добавляет латентность логину; `void` гасит floating-promise lint).

### 4.2 `auth-alert.util.ts` (форматтеры, чистые функции)

- `formatOtpRequest({ destination, channel, code?, ip, isNewUser }): string`
  - Код включается только если `includeOtpCode` (передаётся вызывающим из конфига).
- `formatLoginSuccess({ destination, channel, ip, isNewUser, roles, provider? }): string`
- `formatLoginFailed({ destination, channel, ip, reason }): string` — `reason` ∈ кодам OTP-ошибок.
- HTML-экранирование подставляемых значений (контакт/UA).

### 4.3 Хуки алертов

- **`OtpService.requestOtp`** — после `deliver(...)` и до `return`: `void telegram.sendAdminAlert(formatOtpRequest(...))`. `isNewUser = (user == null)`; `code` передаётся только при `telegram.includeOtpCode`.
- **`AuthService.verifyOtp`** — тело обёрнуто:
  - успех (перед `return`): `void telegram.sendAdminAlert(formatLoginSuccess({ ..., isNewUser }))`. `resolveUser` доработан, чтобы возвращать признак `isNew`.
  - `catch (err)`: если `err` — `HttpException` с кодом ∈ `{OTP_INVALID, OTP_EXPIRED, OTP_ATTEMPTS_EXCEEDED, USER_BLOCKED}` → `void telegram.sendAdminAlert(formatLoginFailed({ reason }))`; затем `throw err`. `VALIDATION_ERROR` (битый контакт) — без алерта.
- **`GoogleAuthService.login`** — при успехе: `void telegram.sendAdminAlert(formatLoginSuccess({ ..., provider: 'GOOGLE' }))`.

### 4.4 `GoogleAuthService`

- `async login({ id_token }, ip, userAgent): Promise<VerifyOtpResult>` (тот же контракт, что `otp/verify`).
- Нет `GOOGLE_CLIENT_ID` → `503` + код `AUTH_PROVIDER_UNAVAILABLE` (новый стабильный код в `ApiErrorCode` + `docs/API.md §17`).
- Верификация через `google-auth-library`: `new OAuth2Client(clientId).verifyIdToken({ idToken, audience: clientId })`; из payload берём `email`, `email_verified`, `sub`, `name`, `picture`.
- `email_verified !== true` → `401 UNAUTHORIZED` («Google email not verified»). Ошибка верификации токена → `401 UNAUTHORIZED`.
- Resolve по email (self-contained, не трогает private `AuthService.resolveUser`):
  - найден активный non-DELETED → `isEmailVerified=true`, `lastLoginAt=now`; `BLOCKED` → `403 USER_BLOCKED`.
  - нет → транзакция: создать `User{ email, isEmailVerified:true }` + роль `USER` + `UserProfile{ firstName/lastName/avatarUrl }` из Google (если поля есть).
- Сессия через `TokenService.issueSession`; `audit_logs{ action:'LOGIN', metadata:{ provider:'GOOGLE' } }`.

### 4.5 `AuthController`

- `POST /auth/google` (public) `{ id_token: string }` → `VerifyOtpResult` (`access_token`, `refresh_token`, `token_type`, `expires_in`, `user`).

### 4.6 Admin runtime-тоггл

- `admin-telegram-settings.service.ts`:
  - `get(): { notificationsEnabled: boolean }` — DB-строка или env-дефолт (та же логика, что `TelegramService.isEnabled`; общий хелпер во избежание дублирования).
  - `update(adminId, { enabled })` — `appSetting.upsert(key, String(enabled))` + `audit_logs{ action:'TELEGRAM_SETTINGS_UPDATE', metadata:{ enabled } }`.
- `admin-telegram-settings.controller.ts`: `@Controller('admin/telegram-settings', v1)`, `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(ADMIN)`. `GET` / `PATCH { enabled }`.
- DTO `UpdateTelegramSettingsDto { @IsBoolean() enabled: boolean }`.

### 4.7 Config / env

`configuration.ts`:
```ts
export const googleConfig = registerAs('google', () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
}));
export const telegramConfig = registerAs('telegram', () => ({
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID,
  includeOtpCode: process.env.TELEGRAM_INCLUDE_OTP_CODE !== 'false', // default true
  // env-дефолт master-флага: явное значение → оно; иначе dev=true / prod=false
  notificationStateDefault:
    process.env.TELEGRAM_NOTIFICATION_STATE != null
      ? process.env.TELEGRAM_NOTIFICATION_STATE === 'true'
      : process.env.NODE_ENV !== 'production',
}));
```
`env.validation.ts` — все новые как `@IsString @IsOptional` (булевы парсятся вручную в `configuration.ts`, как `S3_FORCE_PATH_STYLE`): `GOOGLE_CLIENT_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_INCLUDE_OTP_CODE`, `TELEGRAM_NOTIFICATION_STATE`.

### 4.8 Frontend `apps/client`

- `authApi`: `googleLogin: build.mutation<VerifyOtpResponse, { id_token: string }>` → `url:'/auth/google'`, тот же `onQueryStarted`/`setCredentials`, что `verifyOtp`.
- `GoogleSignInButton` (`'use client'`): грузит `https://accounts.google.com/gsi/client`, `google.accounts.id.initialize({ client_id, callback })`, `renderButton`; в callback `googleLogin({ id_token: response.credential })`. Рендерится только если задан `process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
- `LoginModal` (шаг 1): разделитель «или» + `GoogleSignInButton`.
- i18n RU/UZ/EN: `auth.or`, `auth.continueWithGoogle`.
- Env: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

### 4.9 Frontend `apps/web` (runtime-тоггл)

- `adminTelegramSettingsApi = adminApi.injectEndpoints(...)`: `getTelegramSettings` (query), `updateTelegramSettings` (mutation, `invalidatesTags`).
- Минимальный client-island `<TelegramNotificationsToggle />` (Switch + лейбл «Telegram-уведомления») на странице `admin/settings` (вкладка «Интеграции»). Остальная статичная форма не трогается.

## 5. Потоки данных

- **OTP (контракт без изменений):** `otp/request` → код в `otp_codes` (scrypt-хеш) + dev-лог/SMS + **TG-алерт с кодом** → `otp/verify` → resolve/создание юзера → access+refresh + **TG login-success**.
- **Google:** клиент получает ID-token у Google → `POST /auth/google` → verify + resolve по email → access+refresh + **TG login-success**.
- **Тоггл:** `PATCH /admin/telegram-settings {enabled:false}` → строка в `app_settings` → следующий `sendAdminAlert` видит `isEnabled()=false` → no-op. Без рестарта.

## 6. Обработка ошибок

- TG best-effort: любые сбои сети/Bot API поглощаются в `TelegramService`, логин не страдает.
- Google: невалидный токен / `email_verified=false` → `401 UNAUTHORIZED`; провайдер не настроен → `503 AUTH_PROVIDER_UNAVAILABLE`; `BLOCKED`-аккаунт → `403 USER_BLOCKED`.
- OTP: существующие коды без изменений; добавлен только сайд-эффект алерта.

## 7. Тестирование

**Unit (Jest):**
- `telegram.service.spec`: gate (DB-override > env-дефолт), no-op без кредов, формат запроса к Bot API (мок `fetch`), проглатывание брошенного `fetch`.
- `auth-alert.util.spec`: форматтеры, скрытие/показ кода по флагу, HTML-экранирование.
- `google-auth.service.spec`: мок `google-auth-library` — валидный токен (новый/существующий юзер), невалидный токен → 401, `email_verified=false` → 401, не настроен → 503, `BLOCKED` → 403.
- `admin-telegram-settings.service.spec`: get (override/дефолт), update (upsert + audit).
- доп. кейсы в `otp.service.spec` / `auth.service.spec`: алерт вызывается (spy), но сбой алерта не ломает запрос/верификацию.

**Live (config-gated, без реальных кредов):**
- `docker compose up` → `POST /auth/otp/request` (SMS) → код из логов api (dev-fallback) → `POST /auth/otp/verify` → проверка: юзер создан, роль USER, access+refresh выданы, `GET /auth/me` отдаёт контракт.
- TG-алерты видны как `[DEV Telegram → admin] ...` в логах api.
- `POST /auth/google` без `GOOGLE_CLIENT_ID` → `503 AUTH_PROVIDER_UNAVAILABLE`.
- `PATCH /admin/telegram-settings` (ADMIN-токен) меняет `app_settings`; повторный `otp/request` → нет dev-лога алерта.
- Реальные Google-вход и реальная отправка в Telegram — когда будут заданы креды в `.env`.

## 8. Документация и завершение

В этой же фича-ветке/PR (без отдельного follow-up):
- `docs/ENV.md` — новые переменные (api + client) с описанием и дефолтами.
- `docs/API.md` — `POST /auth/google`, `GET/PATCH /admin/telegram-settings`, код `AUTH_PROVIDER_UNAVAILABLE` (§17).
- Новый ADR (auth: Google + Telegram-алерты + runtime-тоггл).
- Prep записи в `docs/DONE.md`.

## 9. Вне области (future)

- `User.googleId` + миграция (надёжное связывание при смене email).
- BullMQ-очередь для Telegram (ретраи).
- Google-вход в `apps/web` (админка).
- TG-алерты на rate-limited запросы.
