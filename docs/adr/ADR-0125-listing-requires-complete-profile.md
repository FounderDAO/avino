# ADR-0125 — Создание объявления требует заполненного профиля (Имя/Фамилия/Телефон)

## Status

Accepted

## Date

2026-07-04

## Context

Вход через Google даёт аккаунт без телефона; вход по телефону — без имени и
фамилии. Такие пользователи создавали объявления с пустым контакт-блоком:
`buildContact` берёт имя из профиля, телефон — `contact_phone ?? users.phone`,
и покупателю не к кому обращаться.

## Decision

`POST /api/v1/listings` проверяет полноту профиля автора перед созданием:

- `user_profiles.first_name` — непустая строка (trim);
- `user_profiles.last_name` — непустая строка (trim);
- `user_profiles.contact_phone` ИЛИ `users.phone` — непустая строка (trim) —
  та же логика фолбэка, что в публичном контакт-блоке.

При провале — `422 { code: PROFILE_INCOMPLETE }` (новый `ApiErrorCode`).
Клиент (apps/client) зеркалит предикат гейтом «Контактные данные» в визарде
/sell/new и заполняет поля через существующий `PATCH /users/me/profile`
(телефон пишется в `contact_phone` без OTP-верификации — это контакт для
связи, не логин-идентификатор).

Гейтится только создание. Редактирование/смена статуса существующих
объявлений не блокируются. Миграций нет — поля существовали.

## Consequences

Positive:
- У каждого нового объявления гарантированно есть имя и телефон контакта.
- Enforcement на API — совместимо с будущим Flutter-клиентом.

Negative / trade-offs:
- Телефон Google-пользователя не верифицируется OTP (осознанно, Фаза 2).
- Старые объявления «безымянных» авторов остаются как есть.

## Related files

- apps/api/src/listings/listings.service.ts (ensureProfileComplete)
- apps/api/src/common/dto/error-response.dto.ts (PROFILE_INCOMPLETE)
- apps/client/src/features/listing-new/ (клиентский гейт, отдельный PR)

## Related task

- Спека: docs/superpowers/specs/2026-07-04-listing-profile-required-design.md
