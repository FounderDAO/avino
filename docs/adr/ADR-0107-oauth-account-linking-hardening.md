# ADR-0107 — OAuth/OTP account-linking hardening (H-2)

## Status

Accepted

## Date

2026-06-26

## Context

Security-аудит (`scratchpad/security-audit.md`, находка **H-2**) показал, что
линковка аккаунтов кейзилась на строку контакта (email/phone):

- существующий аккаунт находился по голому совпадению email и в него **молча
  логинились/мержились**;
- `isEmailVerified` **хардкодился `true`**, а вычисленный провайдером
  `emailVerified` отбрасывался;
- риск cross-method merge: OAuth-вход мог прицепиться к аккаунту, чей контакт был
  задан другим способом, передав владельцу OAuth полный доступ к ролям/
  объявлениям/чатам пред-существующего аккаунта.

Это §13-чувствительная (auth) область — изменения сделаны консервативно: цель
закрыть silent-merge/takeover, **не ослабляя** существующие проверки и не ломая
common-case (Google/Apple почти всегда отдают `email_verified=true`).

## Decision

В `apps/api` (Google + Apple + OTP-пути):

1. **Не хардкодить verified** — `isEmailVerified` ставится в реальное значение
   провайдерского флага.
2. **Гейт verified на любой OAuth-вход** — если провайдер вернул
   `emailVerified !== true`, вход **отвергается всегда**, аккаунт не создаётся и
   сессия не выдаётся:
   - существующий аккаунт с этим email → `409 ACCOUNT_LINK_REQUIRED` (новый код
     в `ApiErrorCode`, additive non-breaking; согласован с `CONTACT_TAKEN=409`);
   - новый пользователь → отказ (сохранено исходное поведение, ранее `401`).
   Никаких аккаунтов с `isEmailVerified=false`, созданных через OAuth.
3. **Namespace email vs phone** — email-провайдеры (Google/Apple/OTP-email)
   матчат только по `email`, OTP-SMS — только по `phone`; кросс-namespace claim
   невозможен (зафиксировано тестами и комментариями).
4. **OTP-пути** не меняли по логике (успешный OTP сам доказывает контроль над
   контактом и уже namespace-safe) — добавлены namespace-тесты и doc-comment.

Полноценный интерактивный «link existing account» confirm-flow (отдельный
endpoint подтверждения) намеренно НЕ реализован в этом PR — при `409` клиент
получает понятный код и доступ к чужому аккаунту не выдаётся; confirm-endpoint —
follow-up на стороне клиента/продукта.

## Consequences

Positive:
- Закрыт silent-merge: OAuth больше не прицепляется молча к пред-существующему
  аккаунту по непроверённому контакту.
- Провайдерский verified-флаг уважается; нет хардкода `true`.
- Namespace-изоляция email/phone зафиксирована.
- PR — чистый hardening: **ноль послаблений** существующих проверок.

Negative / trade-offs:
- Легитимный владелец, пытающийся прицепить непроверённый OAuth к своему аккаунту,
  тоже получит `409` (безопасный отказ) — до появления confirm-flow это
  ожидаемо.
- Edge-case: если у существующего юзера email уже был `is_email_verified=true` в
  БД, а провайдер на этом входе вернул `verified=false` — отдаём `409` (приоритет
  у заявления провайдера). Консервативно-безопасно; при желании продукт может
  ослабить (доверять ранее подтверждённому email) — отдельным решением.

## Related files

- apps/api/src/common/dto/error-response.dto.ts (ApiErrorCode.ACCOUNT_LINK_REQUIRED)
- apps/api/src/auth/google-auth.service.ts (+ spec)
- apps/api/src/auth/apple-auth.service.ts (+ spec)
- apps/api/src/auth/auth.service.ts (+ spec — namespace tests, doc)

## Related task

- TASK-SEC-02 (OAuth/OTP account-linking hardening, H-2)
