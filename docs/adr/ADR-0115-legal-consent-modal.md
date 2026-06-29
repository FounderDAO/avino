# ADR-0115 — Legal consent (Правила + Политика) — per-user, versioned, admin-gated

## Status

Accepted

## Date

2026-06-29

## Context

При первом входе пользователя нужно получить согласие с Правилами
(`/legal/terms`) и Политикой (`/legal/privacy`, ADR-0114), хранить факт согласия
и сделать само требование управляемым из админ-панели (вкл/выкл). Согласие должно
быть юридически отслеживаемым и привязанным к личности; при изменении документов —
повторное согласие.

## Decision

- Согласие хранится **на сервере**, привязано к аккаунту (только для вошедших;
  гость свободно смотрит сайт и соглашается после входа).
- **Append-only** таблица `legal_consents` (`user_id`, `version`, `accepted_at`) —
  юр-аудит-след; «текущая принятая версия» = последняя строка пользователя.
- **Версионирование**: текущая версия документов — admin-настройка `app_settings.
  legal_consent_version` (дефолт 1, env `LEGAL_CONSENT_VERSION`). При обновлении
  юр-текстов админ поднимает версию → пользователи соглашаются заново.
- **Требование** включается флагом `app_settings.legal_consent_required` (дефолт
  **OFF**, fail-safe, как promotions/map-hover; env `LEGAL_CONSENT_REQUIRED`).
- Публичная поверхность: `GET /api/v1/settings/public` отдаёт `legalConsentRequired`
  и `legalConsentVersion`; `GET /api/v1/auth/me` — `legal_consent { accepted_version,
  accepted_at }`. Запись — `POST /api/v1/users/me/legal-consent` (обе галочки
  обязательны → иначе `422 CONSENT_INCOMPLETE`); каждое согласие пишет строку
  `legal_consents` + `audit_log` (`LEGAL_CONSENT_ACCEPTED`).
- Admin-управление — `AdminLegalConsentFlagController` (`GET`/`PATCH
  /api/v1/admin/legal-consent-flag`) зарегистрирован в `AdminModule`, чтобы его
  DTO не утекли в публичный OpenAPI (как `AdminPromotionsFlagController`).
- Клиент показывает **блокирующую** модалку, когда `isAuthenticated &&
  legalConsentRequired && (accepted_version == null || accepted_version <
  legalConsentVersion)` (фронтовые части — отдельные PR apps/web и apps/client).

Этот PR (apps/api) поставляет бэкенд: модель + миграцию, флаги, эндпоинт записи,
поле в `/auth/me`, admin-тоггл, регенерацию OpenAPI.

## Consequences

Positive:
- Юридически чистый аудит-след; повторное согласие при обновлении документов.
- Единый паттерн с существующими фиче-флагами; нулевой риск для гостей.
- Версия и требование управляются из админки без пересборки.

Negative / trade-offs:
- Версия (admin-поле) может разъехаться с задеплоенным юр-текстом — дисциплина
  ручная (подняли тексты → поднимите версию).
- Гостевой просмотр без согласия допускается (согласие — после входа).
- Per-document независимое версионирование не реализовано (YAGNI; одна общая версия
  покрывает оба документа).

## Related files

- apps/api/prisma/schema.prisma (model `LegalConsent`)
- apps/api/prisma/migrations/20260629000000_add_legal_consents/migration.sql
- apps/api/src/settings/legal-consent-flag.constants.ts
- apps/api/src/settings/legal-consent-flag.service.ts
- apps/api/src/settings/admin-legal-consent-flag.controller.ts
- apps/api/src/settings/public-settings.controller.ts
- apps/api/src/users/legal-consent.service.ts
- apps/api/src/users/users.controller.ts
- apps/api/src/auth/auth.service.ts (getMe)
- apps/api/src/auth/dto/me-response.dto.ts

## Related task

- Design: docs/superpowers/specs/2026-06-29-legal-consent-modal-design.md
- Plan (PR №1): docs/superpowers/plans/2026-06-29-legal-consent-api.md
- Follow-ups: PR №2 (apps/web admin-тоггл), PR №3 (apps/client модалка)
