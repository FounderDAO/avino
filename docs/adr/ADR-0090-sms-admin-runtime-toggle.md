# ADR-0090 — Runtime admin toggle for SMS (master switch + 503 fallback)

## Status

Accepted

## Date

2026-06-18

## Context

SMS — основной канал доставки OTP для входа (ADR-0012). Бизнесу нужна
возможность **включать/выключать отправку SMS в рантайме** из админки (например,
сбой/дороговизна провайдера, окно обслуживания), без пересборки и редеплоя.

Уже есть точный прецедент — рантайм-тоггл Telegram-алертов (ADR-0065): булева
строка в `app_settings` поверх env-дефолта, admin `GET/PATCH`, резолюция
`DB > env`. Telegram-тоггл гасит *необязательные* алерты. У SMS отличие
критично: выключение трогает **auth-flow** (CLAUDE.md §13) — если просто
перестать слать, пользователь не получит код и не поймёт почему (молчаливый
сбой логина).

## Decision

- **Зеркалим паттерн Telegram-тоггла** для SMS:
  - `sms.constants.ts`: ключ `sms_enabled` + чистая `resolveSmsEnabled(stored, envDefault)`.
  - env-дефолт `sms.enabled` из `ESKIZ_ENABLED` (не задан → **`true`**: SMS —
    основной канал логина, в отличие от opt-in Telegram dev=true/prod=false).
  - `SmsService.isEnabled()` — `app_settings['sms_enabled']` > env-дефолт; БД
    недоступна → env-дефолт (не роняем).
  - admin `GET/PATCH /api/v1/admin/sms-settings` (только **ADMIN**), пишет
    `app_settings` + `audit_logs(SMS_SETTINGS_UPDATE)`.
- **Поведение при выключенном SMS — fail-fast 503, не молчание.** `OtpService`
  для канала `SMS` проверяет `isEnabled()` **до** rate-limit и генерации кода;
  если выключено — `503 AUTH_PROVIDER_UNAVAILABLE` (тот же код, что у `/auth/google`
  без ключа, ADR-0065). Клиент покажет «SMS временно недоступно» и предложит
  другой канал (email).
- **Гейт — в `OtpService` (единственный вызывающий)**, а не в `SmsService.send`:
  нужен видимый 503 наверх, а не no-op; `send` остаётся механическим. Один
  лишний `app_settings`-чтение на запрос OTP (как у Telegram на алерт).
- Бэкенд (apps/api) — этот ADR. Тумблер в админ-UI (apps/web) — отдельный PR
  (граница app-папок, CLAUDE.md §0).

## Consequences

Positive:
- SMS включается/выключается из админки мгновенно, без редеплоя.
- Нет молчаливого слома логина: выключенный канал даёт явный 503 с фолбэком.
- Переиспользован проверенный паттерн (app_settings + audit + DB>env).
- Аудируемо: каждое переключение в `audit_logs(SMS_SETTINGS_UPDATE)`.

Negative / trade-offs:
- Состояние тоггла — в БД (как у Telegram); +1 чтение `app_settings` на запрос
  OTP. Приемлемо; при желании кэшируется позже.
- При выключенном SMS и отсутствии email у пользователя вход недоступен — это
  ожидаемое следствие осознанного админ-действия.
- Админ-UI ещё не реализован (следующий PR в apps/web) — пока переключение
  только через API `PATCH /admin/sms-settings`.

## Related files

- `apps/api/src/sms/sms.constants.ts`, `sms.service.ts` (+ spec)
- `apps/api/src/auth/otp.service.ts` (+ spec)
- `apps/api/src/admin/admin-sms-settings.controller.ts`, `admin-sms-settings.service.ts` (+ spec)
- `apps/api/src/admin/dto/update-sms-settings.dto.ts`
- `apps/api/src/admin/admin.module.ts`
- `apps/api/src/config/configuration.ts`
- `docs/API.md` §3/§6, `docs/ENV.md` §11

## Related task

- TASK-041 (SMS prod-readiness; admin runtime toggle)
