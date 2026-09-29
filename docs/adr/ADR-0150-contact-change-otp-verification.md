# ADR-0150 — OTP-верификация при смене логин-контакта (телефон / email)

## Status

Accepted

## Date

2026-07-21

## Context

Логин-идентити пользователя — `users.phone` / `users.email` (по ним идёт
OTP-вход, ADR-0012/0014). До этой задачи владение новым контактом при смене
никак не подтверждалось:

- `PATCH /api/v1/users/me` менял `email` сразу, лишь сбрасывая
  `is_email_verified=false`; OTP на новый адрес не отправлялся;
- сменить логин-телефон (`users.phone`) через API/UI было нельзя — `UpdateUserDto`
  намеренно не принимал `phone` (нужен был verify-flow смены контакта).

Требование: при смене телефона или email OTP-код отправляется на **новое**
значение; смена применяется только после ввода кода пользователем (доказательство
владения). Уникальность контакта ограничена не-DELETED аккаунтами (ADR-013).

Открытые вопросы:

1. **Где хранить «заявку на смену».** Заводить отдельную таблицу
   `pending_contact_changes` или переиспользовать `otp_codes`.
2. **Как не сломать login-flow**, разделяя коды входа и коды смены контакта.
3. **Какой контакт подтверждать** — только новый, или новый + старый.

## Decision

**Переиспользуем `otp_codes` + новое значение `OtpPurpose.CONTACT_CHANGE`** — без
отдельной таблицы (Вариант A). Запрос кода на новый контакт кладёт строку
`otp_codes` (`user_id` = текущий пользователь, `destination` = новый контакт,
`purpose = CONTACT_CHANGE`); verify находит её, гасит и применяет смену на `users`.

- OTP-примитивы вынесены в `apps/api/src/auth/otp-code.util.ts` (чистые функции
  `invalidateActiveOtpCodes` / `createOtpCode` / `consumeActiveOtpCode`,
  параметризованные `purpose`). Поведение login не изменилось; его код теперь
  вызывает те же примитивы с `purpose=LOGIN`.
- Новый `ContactChangeService` + два эндпоинта под `JwtAuthGuard`:
  - `POST /api/v1/users/me/contact-change/request` `{channel, destination}` —
    normalize; отказ, если новое значение равно текущему; уникальность
    (`CONTACT_TAKEN`); rate-limit (`OtpRateLimitService`); генерация кода
    `CONTACT_CHANGE`, привязка к `user_id` + `destination`; доставка тем же
    каналом (SMS/Email; staging — Telegram-код). Ответ
    `{request_id, channel, expires_in, resend_after}`.
  - `POST /api/v1/users/me/contact-change/verify` `{channel, destination, code}` —
    verify (brute-force guard, attempts, expiry, одноразовость), с проверкой, что
    код принадлежит текущему `user_id`; повторная проверка уникальности (гонка);
    `users.update`: SMS → `phone` + `is_phone_verified=true`, EMAIL → `email` +
    `is_email_verified=true`. Ответ — обновлённый `/me`.
- **Purpose-изоляция:** login фильтрует только `LOGIN`-коды, contact-change —
  только `CONTACT_CHANGE`; инвалидация прежних кодов тоже per-purpose. Кодом входа
  нельзя подтвердить смену контакта и наоборот.
- Bypass ревьюверов App Store/Play (`otp.bypass*`) на смену контакта **не**
  распространяется.
- `PATCH /api/v1/users/me` больше **не** меняет email (теперь только через
  OTP-флоу); `UpdateUserDto` очищен до `default_language`.
- Клиент (`apps/client`): блок «Аккаунт (вход)» в `Profile.tsx` (логин-телефон и
  email с бейджем «Подтверждён» + кнопка «Изменить») и `ContactChangeModal`
  (2 шага: новое значение → OTP-код + таймер повтора). RTK Query
  `requestContactChange` / `verifyContactChange`; verify инвалидирует тег `getMe`.

Объём — только **новый** контакт (доказательство владения). Уведомление старого
контакта, подтверждение с двух сторон и step-up повторная аутентификация —
осознанно вне объёма MVP (пользователь уже под JWT).

## Consequences

Positive:

- Смена логин-телефона/email доказывает владение новым контактом.
- Логин-телефон стал изменяемым (раньше — никак).
- Механизм смены переиспользует проверенный OTP-стек (хеш, rate-limit,
  brute-force guard) — минимум нового кода и рисков; миграция — только
  `ALTER TYPE ... ADD VALUE`.

Negative / trade-offs:

- Смена контакта стала двухшаговой (request → verify) вместо одного PATCH.
- При гонке (контакт заняли между request и verify) валидный код гасится до
  повторной uniqueness-проверки → пользователю нужен новый запрос (безопасно,
  лишний UX-цикл).
- Старый контакт не уведомляется о смене (перенесено за пределы MVP).

## Related files

- `apps/api/prisma/schema.prisma` (`OtpPurpose.CONTACT_CHANGE`)
- `apps/api/prisma/migrations/20260721140000_add_otp_purpose_contact_change/migration.sql`
- `apps/api/src/auth/otp-code.util.ts`
- `apps/api/src/auth/otp.service.ts`, `apps/api/src/auth/auth.service.ts`
- `apps/api/src/users/contact-change.service.ts`
- `apps/api/src/users/dto/{request,verify}-contact-change.dto.ts`
- `apps/api/src/users/users.controller.ts`, `users.service.ts`, `dto/update-user.dto.ts`
- `apps/client/src/store/api/usersApi.ts`
- `apps/client/src/features/account/ContactChangeModal.tsx`, `Profile.tsx`
- `apps/client/messages/{uz,ru,en}.json`

## Related task

- Ad-hoc (без TASK-ID). PR #433 (backend), PR #434 (client).
- Расширяет ADR-0012 (OTP request/rate-limit), ADR-0014 (OTP verify), ADR-013
  (уникальность контакта среди не-DELETED).
