# ADR-0008 — Core domain enums

## Status

Accepted

## Date

2026-06-03

## Context

База данных и API Avino опираются на набор перечислений (статус объявления, тип
продвижения, валюта, язык, роль пользователя). До этой задачи enum'ы жили только
в TypeScript-пакете `packages/shared`, причём с расхождениями относительно
контракта:

- `Language` и `UserRole` хранили значения в lowercase (`'uz'`, `'user'`),
  тогда как DB_SCHEMA.md §3 и JSON-контракт API.md используют UPPERCASE
  (`"default_language": "RU"`, `"roles": ["USER"]`).
- enum валюты назывался `CURRENCY` — несогласованно с PascalCase остальных
  (`Language`, `ListingStatus`, `PromotionType`).
- На стороне Prisma core-enum'ов не было вовсе.

Нужно зафиксировать единый источник значений и устранить конфликт регистра, не
ломая v1-контракт.

## Decision

1. **Core-enum'ы реализуются как Postgres enum типы через Prisma enum** и
   объявляются в `apps/api/prisma/schema.prisma`: `ListingStatus`,
   `PromotionType`, `Currency`, `Language`. Значения совпадают с DB_SCHEMA.md §3.
2. **Значения enum — часть v1-контракта.** Добавление значения non-breaking;
   переименование/удаление — breaking change, требует v2 (см. ADR-0002).
3. **Регистр значений — UPPERCASE** во всех enum, отдаваемых в API и хранимых в
   БД. Для языка lowercase `uz|ru|en` остаётся только конвенцией HTTP-заголовка
   `Accept-Language`/query `?lang`, который маппится на enum `Language` (API.md).
   В `packages/shared` `Language` и `UserRole` приведены к UPPERCASE.
4. **Role НЕ является Postgres enum.** Роли — сидируемый справочник `roles`
   (DB_SCHEMA.md §4), чтобы их можно было расширять без миграции и хранить
   many-to-many через `user_roles`. В Prisma enum `Role` отсутствует осознанно.
   `GUEST` — неявное состояние неаутентифицированного запроса, не хранится и не
   является кодом роли; в `UserRole` (TS) оставлен как логический сентинел для
   authorization-кода (см. ADR-011, на момент написания — концептуальный).
5. **`packages/shared` остаётся источником enum'ов для frontend (apps/web)** и
   зеркалирует значения БД; backend использует и Prisma-enum, и shared-enum с
   идентичными значениями.

### Listing enums (TASK-035)

The listing core schema adds two more Postgres enums under the same rules:
`TransactionType` (SALE | RENT) and `PropertyType` (APARTMENT | HOUSE |
NEW_BUILDING | LAND | COMMERCIAL). Values mirror DB_SCHEMA §3 exactly and are
created by the `listings` migration (first model to reference them).

Known divergence to reconcile (flagged for Team Lead, not changed in the
DB-only TASK-035 PR): `packages/shared/src/enums.ts` currently has
`PropertyType` with only 4 values (no `NEW_BUILDING`) and names the deal enum
`DealType` instead of `TransactionType`. The Prisma/DB layer follows the
authoritative §3 contract; aligning the shared TS enums (add `NEW_BUILDING`,
rename `DealType` → `TransactionType`) is a separate task so a frontend-contract
change is not mixed into a DB migration PR (CLAUDE.md §2/§5).

### Translation & media enums (TASK-036)

The listing translations/media schema adds two more Postgres enums under the
same rules: `TranslationSource` (USER | GOOGLE | YANDEX) and `MediaType`
(IMAGE). Values mirror DB_SCHEMA §3. They are created by the
`listing_translations` / `listing_media` migration (first models to reference
them).

`MediaType` intentionally carries a single value `IMAGE` in MVP — `VIDEO` is
Phase 2 (DB_SCHEMA §3). Adding `VIDEO` later is a non-breaking enum addition,
so no v2 is implied. `TranslationSource` distinguishes the author row (`USER`,
on the listing's `original_language`) from machine translations (`GOOGLE` /
`YANDEX`); the concrete translation provider (Google vs Yandex) is a runtime
decision deferred to the translation-integration task, not fixed by this enum.

### Notification & device enums (TASK-038)

The engagement schema adds four more Postgres enums under the same rules:
`NotificationType` (SAVED_SEARCH_NEW_LISTING | FAVORITE_PRICE_DROP |
NEW_CHAT_MESSAGE | LISTING_MODERATION_STATUS_CHANGED | NEW_LEAD |
PROMOTION_ACTIVATED | PROMOTION_EXPIRED), `NotificationChannel` (EMAIL | PUSH |
IN_APP), `NotificationStatus` (PENDING | SENT | FAILED | READ) and
`DevicePlatform` (ANDROID | IOS | WEB). Values mirror DB_SCHEMA §3 exactly and
are created by the chat/notifications migration — `notifications` /
`notification_devices` are the first models to reference them.

`NotificationType` is intentionally extensible: new domain events are added as
non-breaking enum additions, never renamed (which would be breaking, requiring
v2 — ADR-0002). `NotificationChannel` carries `PUSH` now even though MVP
delivers `EMAIL` + `IN_APP` reliably — the value exists so the contract is
stable when the Flutter app wires up FCM/APNs against `notification_devices`
(`DevicePlatform`). By contrast, `audit_logs.action` stays a free-form
`VARCHAR(80)`, NOT an enum, so new auditable actions need no migration
(ADR-0004, DB_SCHEMA §12).

## Consequences

Positive:

- Единый контракт значений между Prisma, БД, API и frontend; нет конфликта
  регистра между слоями.
- Расширяемость ролей без миграций; добавление значения enum non-breaking.
- PascalCase-нейминг enum согласован (`Currency` вместо `CURRENCY`).

Negative / trade-offs:

- Два места объявления значений (Prisma enum + shared enum) нужно держать в
  синхроне вручную до возможной кодогенерации.
- Postgres enum типы фактически создаются миграцией только когда на них
  ссылается первая модель (listings — TASK-035); на этом этапе enum'ы лишь
  объявлены в схеме.
- Изменение регистра значений в `shared` — разовый разрыв для возможных ранних
  потребителей (на момент задачи внешних потребителей нет, кроме `constants.ts`).

## Related files

- apps/api/prisma/schema.prisma
- packages/shared/src/enums.ts
- packages/shared/src/constants.ts
- docs/DB_SCHEMA.md
- docs/API.md

## Related task

- TASK-032
- TASK-035 (adds TransactionType / PropertyType enums; flags shared divergence)
- TASK-036 (adds TranslationSource / MediaType enums)
- TASK-038 (adds NotificationType / NotificationChannel / NotificationStatus / DevicePlatform enums)
