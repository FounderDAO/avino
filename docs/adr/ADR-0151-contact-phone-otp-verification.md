# ADR-0151 — OTP-верификация публичного контакт-телефона (contact_phone)

## Status

Accepted

## Date

2026-07-22

## Context

Поле «Телефон для связи» (`user_profiles.contact_phone`) — это **публичный** номер:
он выводится на объявлениях как контакт автора (`buildContact`), в заявках на тур,
в карточке заявки агента и в очереди модерации. До этой задачи он сохранялся
свободно через `PATCH /users/me/profile` — **без подтверждения владения номером**.

Логин-контакт (телефон/email аккаунта) уже защищён OTP-флоу `contact-change`
(ADR-0150). Но контакт-телефон логином не является (захвата аккаунта через него
нет), поэтому попадал мимо той защиты. В результате пользователь мог опубликовать
на своих объявлениях любой (в т.ч. чужой/фейковый) номер — это анти-фрод и доверие
на объявлениях, а не безопасность аккаунта.

Дополнительные требования, отличающие контакт-телефон от логина:
- один номер может легитимно принадлежать нескольким пользователям (номер агентства
  у нескольких агентов) → уникальность навязывать нельзя;
- контакт — всегда телефон (email как «контакт» не рассматривается) → канал только SMS;
- на объявлениях есть фолбэк на верифицированный логин-телефон, поэтому «скрыть
  неподтверждённый contact_phone» не оставляет объявление без номера.

## Decision

1. Смена `contact_phone` возможна только после OTP-подтверждения владения номером.
   Введён отдельный `OtpPurpose.CONTACT_PHONE_CHANGE` и сервис
   `ContactPhoneChangeService` (сиблинг `ContactChangeService`), переиспользующий
   примитивы `otp-code.util` / `OtpRateLimitService` / hash-утилиты, но:
   - только SMS;
   - **без проверки уникальности** контакта;
   - **короткое замыкание**: если новый номер = верифицированному логин-телефону
     аккаунта, смена применяется сразу без OTP (владение уже доказано этим аккаунтом).
2. Новые эндпоинты (versioned, Bearer):
   - `POST /api/v1/users/me/contact-phone/request { destination }` →
     `{ applied: true }` (короткое замыкание) либо
     `{ applied: false, request_id, channel: 'SMS', expires_in, resend_after }`;
   - `POST /api/v1/users/me/contact-phone/verify { destination, code }` → обновлённый `/me`.
3. Добавлен флаг `user_profiles.contact_phone_verified` (default `false`).
   Существующие строки получают `false` — старые непроверенные номера временно
   уступают верифицированному логин-телефону, пока пользователь их не подтвердит.
4. На всех публичных точках вывода контакта телефон выбирается как
   `contact_phone_verified && contact_phone ? contact_phone : account_phone`
   (в модерации неподтверждённый → `null`).
5. `contact_phone` убран из свободного `PATCH /users/me/profile` (по образцу того,
   как из `PATCH /users/me` ранее убрали email в ADR-0150). Свободная форма его
   больше не пишет — только verify/короткое замыкание.

## Consequences

Positive:
- Публичный номер на объявлениях всегда подтверждён владельцем либо равен
  верифицированному логин-телефону — меньше фрода/ошибочных номеров.
- Общие номера (агентство) поддержаны — нет ложных `CONTACT_TAKEN`.
- Частый кейс «контакт = мой логин-телефон» не требует ввода кода.
- Логин-флоу (`ContactChangeService`) не тронут — нет риска регресса на auth.

Negative / trade-offs:
- Существующие непроверенные `contact_phone` перестают показываться до
  ре-верификации (тихий грандфатер; на объявлениях виден логин-телефон).
- Ещё один OTP-путь (SMS-расход, rate-limit) и дополнительное трение при смене
  номера, отличного от логина.

## Related files

- `apps/api/prisma/schema.prisma` (`OtpPurpose.CONTACT_PHONE_CHANGE`, `UserProfile.contactPhoneVerified`)
- `apps/api/prisma/migrations/20260722090000_add_contact_phone_verified/`
- `apps/api/prisma/migrations/20260722090100_add_otp_purpose_contact_phone_change/`
- `apps/api/src/users/contact-phone-change.service.ts`
- `apps/api/src/users/dto/request-contact-phone.dto.ts`, `verify-contact-phone.dto.ts`
- `apps/api/src/users/users.controller.ts`, `users.module.ts`
- `apps/api/src/profiles/dto/update-profile.dto.ts`, `apps/api/src/profiles/profiles.service.ts`
- `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/dto/me-response.dto.ts`
- `apps/api/src/listings/listings.service.ts`, `tour-requests`, `agent-applications`, `moderation`

## Related task

- Дизайн: `docs/superpowers/specs/2026-07-22-contact-phone-otp-verification-design.md`
- План: `docs/superpowers/plans/2026-07-22-contact-phone-otp-verification.md`
- Расширяет ADR-0150 (contact-change OTP для логин-контакта)
