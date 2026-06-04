# ADR-0018 — Listing create & update endpoints

## Status

Accepted

## Date

2026-06-04

## Context

TASK-050 открывает milestone M5 (Listings & moderation) — первый feature-модуль
ядра системы поверх auth/RBAC-слоя (TASK-040–044) и схемы listings (TASK-035/036).
`API.md` §7 требует `POST /api/v1/listings` (создание) и `PATCH /api/v1/listings/:id`
(обновление собственного объявления). Бизнес-правила (CLAUDE.md §9, ADR-005):

1. объявление создаётся на одном языке (`original_language`) и проходит moderation
   queue — новый листинг получает статус `NEW`;
2. весь переводимый текст (`title/description/address_note/features_text`) живёт
   в `ListingTranslation`, а не в `listings`; авторская строка — `source=USER`,
   `is_auto_translated=false`;
3. денежные/площадные поля — строки-Decimal, никогда float (ADR-002);
4. редактировать можно только собственное объявление.

Реализация должна оставаться client-neutral (web + будущий Flutter) и в едином
snake_case-контракте; статус-переходы и ре-генерацию переводов выполняют другие
модули, поэтому их сюда тянуть нельзя.

## Decision

1. **`ListingsModule`** (`apps/api/src/listings/`) — `ListingsController` под
   `@UseGuards(JwtAuthGuard, RolesGuard)`. Guard'ы и `JwtModule` приходят импортом
   `RolesModule` (ADR-0016); Prisma — глобальный модуль.
2. **`POST /listings`** → `ListingsService.create`: `@Roles(OWNER, AGENT, AGENCY,
   LANDLORD, PROPERTY_MANAGER)` (право публикации, API.md §7). `ownerId` берётся
   из access-токена (`@CurrentUser('id')`), статус принудительно `NEW`. Листинг и
   авторский перевод на `original_language` создаются одним nested-write
   (`translations.create`, `source=USER`). Ответ 201 — краткая карточка
   (`id/status/transaction_type/property_type/original_language/price/currency/
   created_at`).
3. **`PATCH /listings/:id`** → `ListingsService.update`: доступен любому
   аутентифицированному, но gate по владельцу в сервисе — `findFirst` с
   `status != DELETED`, затем: отсутствует → `404 NOT_FOUND`, чужой `ownerId` →
   `403 FORBIDDEN`. PATCH-семантика: маппятся только переданные scalar-поля;
   при наличии `translation` правится строка перевода на `original_language`
   (nested `translations.update` по `listingId_language`).
4. **DTO** повторяют snake_case ключи API; `price/area/latitude/longitude` —
   строки (`@Matches`/`@IsLatitude`/`@IsLongitude`), целочисленные поля валидируются
   диапазоном SmallInt. `forbidNonWhitelisted` (ADR-0007) отклоняет неизвестные
   поля. `price` отдаётся `Decimal.toFixed(2)` — иначе `toString()` срезал бы
   хвостовые нули и нарушил контракт.

### Намеренно вне scope (TASK-050)

- **PostGIS `location`**: `latitude/longitude` сохраняются как scalar-колонки;
  синхронизация `geography(Point,4326)` (raw SQL, ADR-001) — отдельная гео-задача.
- **`feature_ids`**: справочника features в схеме ещё нет — поле не принимается.
- **Ре-генерация машинных переводов и возврат в модерацию** после правки `ACTIVE`
  (`translate_listing`, ADR-005) — отдельная задача M5 с воркером.
- **Статус-переходы** (`ACTIVE/REJECTED/...`): только модерация (API.md §16,
  TASK-053). `original_language`, `owner_id`, `status` в `PATCH` не меняются.
- **`GET /listings/:id`, `/listings/mine`, `DELETE`** — TASK-051/052.

## Consequences

Positive:

- Ядро объявлений получает create/update с тем же шаблоном (guard + `@CurrentUser`
  + Prisma + snake_case-маппинг), что users-модуль (ADR-0017).
- Авторский перевод создаётся атомарно вместе с листингом — нет окна «листинг без
  заголовка».
- Узкий scope: PR решает одну задачу (CLAUDE.md §5), геопоиск/переводы/модерация
  подключаются независимо.

Negative / trade-offs:

- Ответ create/update — краткая карточка без переводов/медиа; полная карточка —
  `GET /listings/:id` (TASK-051). Клиент при необходимости делает повторный GET.
- Ownership-проверка только по `ownerId`; agency-admin / делегирование AGENT —
  будущее расширение RBAC, не входит в MVP-критерии TASK-050.
- `latitude/longitude` без синхронизации `location` означают, что объявление пока
  не участвует в гео-поиске до гео-задачи — осознанный порядок работ.

## Related files

- apps/api/src/listings/listings.module.ts
- apps/api/src/listings/listings.controller.ts
- apps/api/src/listings/listings.service.ts
- apps/api/src/listings/dto/create-listing.dto.ts
- apps/api/src/listings/dto/update-listing.dto.ts
- apps/api/src/listings/listings.service.spec.ts
- apps/api/src/listings/index.ts
- apps/api/src/app.module.ts

## Related task

- TASK-050
