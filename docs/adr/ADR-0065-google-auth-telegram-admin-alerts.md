# ADR-0065 — Google sign-in, Telegram admin auth-alerts, runtime toggle

## Status

Accepted

## Date

2026-06-13

## Context

Публичному порталу нужен второй способ входа помимо OTP — вход через Google.
Параллельно для MVP админу нужна видимость auth-активности: уведомления в
Telegram, когда кто-то запрашивает OTP или входит, чтобы оперативно реагировать
(и при необходимости вручную передавать код, пока SMS-провайдер Eskiz ещё не
оплачен/не настроен). Решение не должно ломать существующий OTP-контракт и
должно следовать принятому в проекте паттерну «нет кредов → no-op / dev-лог»
(SmsService/EmailService, ADR-0037), а интеграции должны включаться без смены
auth-флоу для уже существующих клиентов.

## Decision

1. **Google sign-in** — новый `POST /api/v1/auth/google { id_token }`. ID-token
   верифицируется офлайн через `google-auth-library`
   (`OAuth2Client.verifyIdToken`, проверка подписи/`aud`/`iss`/`exp`).
   Связывание аккаунта — **по верифицированному email** (`email_verified=true`
   обязателен); первый вход создаёт пользователя с ролью `USER`
   (login = signup, как в OTP), профиль сидируется из Google (имя/аватар).
   Сессия выпускается тем же `TokenService`, ответ идентичен `otp/verify`.
   Поле `User.googleId` **не вводится** в MVP (см. Consequences).
2. **Telegram admin-алерты** — новый изолированный `TelegramModule`
   (`TelegramService`): прямой `fetch` к Bot API, fire-and-forget,
   **никогда не бросает** (сбой Telegram не влияет на логин). Хуки: запрос OTP
   (с самим кодом — флаг `TELEGRAM_INCLUDE_OTP_CODE`, default true), успешный
   вход (OTP и Google), неудачный verify (`OTP_INVALID/EXPIRED/`
   `ATTEMPTS_EXCEEDED/USER_BLOCKED`).
3. **Двухслойный master-тоггл** — включённость алертов: строка
   `app_settings['telegram_notifications_enabled']` (если задана) главнее
   env-дефолта `TELEGRAM_NOTIFICATION_STATE` (если не задан → **dev=true /
   prod=false**). Runtime-переключение без пересборки — `GET/PATCH
   /api/v1/admin/telegram-settings` (ADMIN, audit-log `TELEGRAM_SETTINGS_UPDATE`)
   + переключатель на странице `apps/web` admin/settings.
4. **Новый код ошибки** `AUTH_PROVIDER_UNAVAILABLE` (503) — когда `GOOGLE_CLIENT_ID`
   не задан.

## Consequences

Positive:
- Второй способ входа без пароля; контракт сессии не меняется (нет breaking
  change, остаётся в `v1`).
- Админ видит auth-активность в реальном времени; для MVP может вручную
  передавать OTP-код, пока SMS не оплачен.
- Все интеграции config-gated: без кредов приложение стартует и работает
  (Google → 503, Telegram → dev-лог/no-op).
- Тоггл переключается на проде без редеплоя.

Negative / trade-offs:
- OTP-код попадает в Telegram-чат админа (флаг `TELEGRAM_INCLUDE_OTP_CODE`):
  приемлемо для MVP, рекомендуется выключить, когда SMS/email заработают.
- Связывание по email без `User.googleId`: при смене email в Google связь не
  отслеживается; вход с неверифицированным Google-email отклоняется. Введение
  `googleId` + миграция оставлены на будущее.
- Telegram-доставка best-effort и синхронная (без очереди ретраев); для MVP
  достаточно, BullMQ-очередь — будущее улучшение.

## Related files

- apps/api/src/telegram/ (telegram.module.ts, telegram.service.ts,
  telegram.constants.ts, auth-alert.util.ts, + spec)
- apps/api/src/auth/google-auth.service.ts, dto/google-login.dto.ts,
  auth.controller.ts, auth.service.ts, otp.service.ts, auth.module.ts
- apps/api/src/admin/admin-telegram-settings.{controller,service}.ts,
  dto/update-telegram-settings.dto.ts, admin.module.ts
- apps/api/src/config/configuration.ts, env.validation.ts
- apps/api/src/common/dto/error-response.dto.ts (AUTH_PROVIDER_UNAVAILABLE)
- apps/client/src/store/api/authApi.ts,
  src/components/layout/GoogleSignInButton.tsx, LoginModal.tsx,
  messages/{ru,uz,en}.json
- apps/web/src/store/api/adminTelegramSettingsApi.ts,
  src/components/admin/TelegramNotificationsToggle.tsx,
  src/app/admin/settings/page.tsx
- docs/ENV.md, docs/API.md

## Related task

- TASK-195
