# Обязательные Имя/Фамилия/Телефон для создания объявления — design

Дата: 2026-07-04
Статус: утверждён Team Lead (вопросы 1–4 — выбраны рекомендованные варианты)

## Проблема

Пользователь, вошедший через Google, может не иметь телефона; вошедший по
номеру телефона — не иметь имени/фамилии. Такой пользователь создаёт
объявление, у которого в контакт-блоке нет имени и/или телефона — покупателю
некуда звонить и не к кому обращаться.

Требование: создать объявление можно только когда у пользователя заполнены
**Имя**, **Фамилия** и **Телефон**. Если чего-то не хватает — заставить
заполнить перед созданием.

## Предикат полноты профиля

Единый на backend и client:

```
profile.first_name — непустая строка (после trim)
И profile.last_name — непустая строка (после trim)
И (profile.contact_phone ?? user.phone) — непустая строка
```

Обоснование телефонной части: публичный контакт объявления уже строится как
`profile.contactPhone ?? owner.phone` (`listings.service.ts` → `buildContact`),
поэтому пользователю с входом по телефону дозаполнять телефон не нужно.

Решения Team Lead:

- Enforcement: **backend + client** (совместимость с будущим Flutter).
- UX: **форма прямо в визарде** `/sell/new` (не редирект в профиль).
- Телефон Google-пользователя: **без OTP-верификации**, пишется в
  `profile.contact_phone` (свободный контакт, как на странице профиля).
- Страница профиля: поле «Имя» **разбивается** на «Имя» и «Фамилия».

Миграций БД нет — все поля существуют (`user_profiles.first_name/last_name/
contact_phone`, `users.phone`).

## PR №1 — apps/api (`feature/api-listing-profile-required`)

- `ApiErrorCode += PROFILE_INCOMPLETE`.
- `ListingsService.create` (POST /api/v1/listings): перед созданием читает
  владельца с профилем и проверяет предикат; при провале —
  `422 UnprocessableEntityException { code: PROFILE_INCOMPLETE, message:
  'First name, last name and phone are required to create a listing' }`.
- Гейтится **только создание**. Редактирование, смена статуса, загрузка медиа —
  без изменений (объявления, созданные до фичи, остаются редактируемыми).
- Юнит-тесты: полный профиль → создаётся; нет first_name / нет last_name /
  нет обоих телефонов → 422; contact_phone нет, но user.phone есть → создаётся.
- OpenAPI regen (`pnpm openapi:export`), ADR-0125.

## PR №2 — apps/client (`feature/client-profile-required-gate`)

### Гейт в визарде /sell/new

- Предикат `isProfileCompleteForListing(user)` в `apps/client/src/lib/`
  (или рядом с ListingNew) — зеркало backend-предиката, по данным
  `selectCurrentUser` (MeResponse).
- В `ListingNew` после существующего auth-гейта — второй гейт: авторизован,
  но профиль неполный → вместо шагов рендерится экран «Контактные данные»:
  поля Имя, Фамилия, Телефон, предзаполненные из
  `profile.first_name / profile.last_name / (profile.contact_phone ?? phone)`.
  Кнопка «Продолжить» активна, когда все три поля непусты (trim).
- Сохранение → `PATCH /users/me/profile { first_name, last_name,
  contact_phone }` (существующая мутация `updateProfile`; уже в
  `SUPPRESSED_ENDPOINTS`, инвалидирует `Auth` → `getMe` перечитывается →
  `selectCurrentUser` обновляется → гейт исчезает, визард показывает шаг 1).
  Ошибка запроса — инлайн (getApiError), без тоста.
- Страховка: `422 PROFILE_INCOMPLETE` из `createListing` при публикации
  (профиль опустел между гейтом и публикацией) — показать инлайн-ошибку
  с текстом о контактных данных (существующий apiError-механизм).

### Страница /account/profile

- Поле «Имя» (writes `display_name`) заменяется двумя: «Имя» → `first_name`,
  «Фамилия» → `last_name`.
- При сохранении дополнительно шлётся `display_name: null` — публичное имя
  становится производным «Имя Фамилия» (`buildContact`: `displayName ??
  "first last"`). Иначе у Google-пользователей display_name из Google навсегда
  перекрывал бы отредактированные Имя/Фамилию.
- Аватар-буква и приветствие (`AccountLayout`: `display_name ?? first_name`)
  продолжают работать через фолбэк first_name.

### Прочее

- i18n `listingNew.contactGate.*`, `account.profile.firstName/lastName` —
  ru/uz/en, паритет ключей, uz — латиница.
- Тесты: предикат, гейт (рендер формы при неполном профиле, скрытие при
  полном), Profile (два поля, display_name: null в PATCH).

## Вне скоупа

- OTP-верификация вводимого телефона (возможная Фаза 2).
- Гейт на редактирование существующих объявлений.
- Изменение `User.phone` (логин-идентификатор не трогаем).
- apps/web (админка) — без изменений.
