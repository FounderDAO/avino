# ADR-0097: Sign in with Apple (web portal)

- Статус: Accepted
- Дата: 2026-06-19
- Связано: ADR-0065 (Google sign-in)

## Контекст
Владелец проекта попросил вход через Apple ID (iCloud), аналогично Google.

## Решение
1. `POST /api/v1/auth/apple { id_token, first_name?, last_name? }` — офлайн-
   верификация Apple ID-token (`apple-signin-auth`): подпись по JWKS Apple,
   `iss`, `aud ∈ APPLE_CLIENT_ID`, `exp`. Приватный ключ Apple НЕ нужен (нет
   серверного обмена code→токены, как и у Google).
2. Связывание по верифицированному email (login=signup), как ADR-0065 — без
   колонок provider/provider_id и без миграции БД. Trade-off: Gmail + Apple
   «Hide My Email» = два аккаунта.
3. Имя берётся из тела запроса (Apple отдаёт имя лишь при первой авторизации,
   не в токене) и сеет профиль; иначе профиль без имени.
4. `email_verified`/`is_private_email` приводятся из строки в boolean.
5. Сессия — общий TokenService; audit `provider: 'APPLE'`; Telegram-алерт.
6. `APPLE_CLIENT_ID` — CSV audience (Service ID веба; в будущем + bundle ID
   нативного приложения) → multi-audience без правок кода.
7. Config-gating: нет `APPLE_CLIENT_ID` → 503 AUTH_PROVIDER_UNAVAILABLE; нет
   `NEXT_PUBLIC_APPLE_CLIENT_ID`/`NEXT_PUBLIC_APPLE_REDIRECT_URI` → кнопка скрыта.
8. Только публичный портал (`apps/client`); админка на OTP.

## Последствия
- Реальная end-to-end проверка требует HTTPS-хоста и верифицированного Service
  ID/return URL — на localhost Apple не работает; локально — unit-тесты.
- Затронутые файлы: apps/api/src/auth/apple-auth.service.ts (+ spec),
  dto/apple-login.dto.ts, auth.controller.ts, auth.module.ts, config/*,
  telegram/auth-alert.util.ts; apps/client AppleSignInButton.tsx, authApi.ts,
  LoginModal.tsx, messages/*.
