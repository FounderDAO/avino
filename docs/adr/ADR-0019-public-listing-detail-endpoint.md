# ADR-0019 — Public listing detail endpoint

## Status

Accepted

## Date

2026-06-04

## Context

TASK-051 продолжает milestone M5 поверх create/update (TASK-050, ADR-0018).
`API.md` §7 требует `GET /api/v1/listings/:id` — полную карточку объявления для
web и будущего Flutter-клиента. Требования и бизнес-правила:

1. **Видимость зависит от зрителя.** `ACTIVE` — публично (без аутентификации);
   непубличные статусы (`NEW/DRAFT/REJECTED/ARCHIVED/SOLD/RENTED`) видит только
   владелец и MODERATOR/ADMIN. `DELETED` — soft-delete, исключён из всех read-path
   (API.md §7), то есть `404` для всех.
2. **Опциональная аутентификация.** Эндпоинт публичный, но Bearer-токен (если
   передан) повышает видимость. Существующий `JwtAuthGuard` (ADR-0016) требует
   токен и бросает `401` при его отсутствии — для публичной карточки не подходит.
3. **Перевод по языку.** Текст отдаётся на запрошенном языке (`?lang` /
   `Accept-Language`) с фолбэком на `original_language` (ADR-012). Машинные
   переводы появляются только после `ACTIVE` (ADR-005), поэтому для `NEW` доступна
   лишь авторская строка — фолбэк обязателен.
4. **Полная карточка** включает scalar-поля, разрешённый перевод (плоско в корне)
   и медиа по `sort_order`. Decimal/даты — строками (контрактный формат, ADR-002).

## Decision

1. **`OptionalJwtAuthGuard`** (`apps/api/src/common/guards/`) — наследник
   `JwtAuthGuard`: запрос без `Bearer` проходит как гость (`request.user` не
   ставится), запрос с токеном валидируется строго (невалидный/истёкший → `401`,
   а не молчаливый гостевой доступ). `extractBearer` в базовом guard'е сделан
   `protected` для переиспользования; `RequestLike` экспортирован. Guard
   регистрируется в `RolesModule` (те же deps `JwtService`/`ConfigService`).
2. **Guard'ы перенесены с класса на методы** контроллера: create/update остаются
   под `@UseGuards(JwtAuthGuard, RolesGuard)`, а `GET :id` — под
   `@UseGuards(OptionalJwtAuthGuard)`. Поведение create/update не изменилось.
3. **`GET /listings/:id`** → `ListingsService.findOne(id, viewer, lang,
   acceptLanguage)`. Логика видимости в сервисе: `findUnique` по id; отсутствует
   или `DELETED` → `404`; не-`ACTIVE` и зритель не владелец/не MODERATOR/ADMIN →
   тоже `404` (не `403`, чтобы не раскрывать существование скрытого листинга —
   API.md §7 для этого эндпоинта декларирует только `404`).
4. **Выбор языка** — приоритет `?lang`, затем `Accept-Language` (q-веса
   игнорируются, берётся порядок), фолбэк на `original_language`; учитываются
   только реально существующие переводы. `?lang` принимается в любом регистре
   (`ru`/`RU`, ADR-0008) и нормализуется к enum `Language`.
5. **Ответ** — `ListingDetailResponse` (snake_case): scalar-поля,
   `promotion_type/promotion_expires_at` (read-cache из listings, ADR-0004),
   `owner_id/agency_id`, выбранный `language` + `title/description/address_note/
   features_text`, массив `media`, `published_at/created_at`. Decimal через
   `toFixed` (price/area — 2 знака, lat/long — 6).

### Намеренно вне scope (TASK-051)

- **Структурированный `features[]`**: справочника amenities в схеме ещё нет
  (как и в TASK-050). Свободный текст удобств отдаётся в `features_text` внутри
  перевода; `features[]` появится отдельной задачей M5 вместе с моделью.
- **Видимость для AGENCY/agency-admin** (API.md §7): требует модели членства
  пользователь→agency, которой пока нет. Реализован критерий приёмки —
  владелец + MODERATOR/ADMIN; agency-видимость — будущее расширение RBAC.
- **`GET /listings/:id/translations`, `/listings/mine`, `DELETE`** — TASK-052+.

## Consequences

Positive:

- Публичная карточка работает и для гостя, и для авторизованного владельца одним
  эндпоинтом; `OptionalJwtAuthGuard` переиспользуем для других публичных read-path
  с владельческой видимостью (поиск, избранное).
- `404` вместо `403` для скрытых листингов не раскрывает их существование.
- Фолбэк перевода гарантирует непустую карточку даже до генерации машинных
  переводов (статус `NEW`).

Negative / trade-offs:

- Видимость не покрывает agency-admin — для объявлений агентств непубличные
  статусы пока видят только сам владелец и MODERATOR/ADMIN (осознанно, до RBAC-
  расширения).
- `OptionalJwtAuthGuard` при переданном битом токене возвращает `401`, а не
  тихий гостевой доступ — клиент обязан слать только валидный токен (или ничего).
- `Accept-Language` парсится упрощённо (без сортировки по `q`) — достаточно для
  uz/ru/en MVP, при росте числа языков может потребоваться полноценный парсер.

## Related files

- apps/api/src/common/guards/optional-jwt-auth.guard.ts
- apps/api/src/common/guards/optional-jwt-auth.guard.spec.ts
- apps/api/src/common/guards/jwt-auth.guard.ts
- apps/api/src/common/guards/index.ts
- apps/api/src/roles/roles.module.ts
- apps/api/src/listings/listings.controller.ts
- apps/api/src/listings/listings.service.ts
- apps/api/src/listings/listings.service.spec.ts

## Related task

- TASK-051
