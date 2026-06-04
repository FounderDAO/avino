# ADR-0020 — Owner listings endpoint & page-based collection envelope

## Status

Accepted

## Date

2026-06-04

## Context

TASK-052 продолжает milestone M5 поверх create/update (TASK-050, ADR-0018) и
публичной карточки (TASK-051, ADR-0019). `API.md` §7 требует
`GET /api/v1/listings/mine` — список собственных объявлений текущего пользователя
(любые статусы) с фильтром по статусу и пагинацией. Это первый коллекционный
эндпоинт проекта, поэтому он фиксирует контракт пагинации для простых списков.

Требования и бизнес-правила:

1. **Только свои листинги.** Auth — Bearer; пользователь видит исключительно
   объявления, где он `owner_id`. Ролевого ограничения нет: любой
   аутентифицированный пользователь получает свой (возможно пустой) список.
2. **Любые статусы, кроме `DELETED`.** API.md §7 объявляет `/listings/mine` для
   «любых статусов», но soft-deleted листинги исключены из всех read-path
   (API.md §7, как и в TASK-051). Значит `DELETED` не должен попадать в список.
3. **Пагинация.** API.md §4: keyset (cursor) — основной режим для публичного
   поиска/листингов; для простых справочных/owner-/админ-списков допускается
   page-based (1-based) + `limit`, и тогда `meta.total` обязателен. Owner-список —
   именно такой простой случай.
4. **Контракт ответа** — единый envelope `{ data, meta }` (snake_case),
   Decimal/даты строками (ADR-002).

## Decision

1. **`GET /listings/mine`** объявлен в контроллере **до** `GET :id`, чтобы
   статический путь не перехватывался параметрическим роутом. Guard —
   `@UseGuards(JwtAuthGuard)` (Bearer, без `RolesGuard`).
2. **Видимость / фильтр статусов.** `where = { ownerId, status: ... }`. Если
   передан `status` и он не `DELETED` — фильтруем по нему; иначе (и в т.ч. при
   явном `status=DELETED`) ставим `status: { not: DELETED }`. Так `DELETED`
   никогда не раскрывается, оставаясь исключённым из read-path.
3. **Пагинация — page-based.** `page` (default `1`), `limit` (default `20`, max
   `100`, капится в сервисе). `skip = (page-1)*limit`, `take = limit`.
   Сортировка — `created_at DESC, id DESC` (детерминированный хвост `id` для
   стабильного порядка). `total` берётся отдельным `count` по тому же `where`;
   `findMany` и `count` выполняются параллельно (`Promise.all`).
4. **Envelope** — `PaginatedResponse<T> = { data: T[]; meta: { page, limit,
   total } }` (API.md §4). `meta.page`/`meta.limit` отражают фактически
   применённые значения (limit уже после капа).
5. **Карточка списка** — `ListingListItem` (компактнее `ListingDetailResponse`):
   ключевые scalar-поля, `promotion_type/promotion_expires_at`, `title` на
   `original_language` (владелец редактирует исходный текст; для своего списка
   языковая негоциация не нужна) с фолбэком на первый перевод, и `thumbnail_url`
   — обложка (первое медиа по `sort_order`, fallback на `url`). Decimal через
   `toFixed` (price/area — 2 знака).

### Намеренно вне scope (TASK-052)

- **Keyset (cursor) пагинация** — основной режим для публичного поиска/листингов
  (ADR-007); owner-список сознательно использует page-based как простой случай.
  Публичный `GET /search` с keyset — отдельная задача M5.
- **Языковая негоциация для списка** (`?lang`/`Accept-Language`): для своего
  списка отдаётся `original_language`; для публичных списков негоциация добавится
  вместе с поиском.
- **`DELETE /listings/:id`, `/listings/:id/translations`, moderation** — TASK-053+.

## Consequences

Positive:

- Зафиксирован переиспользуемый контракт коллекций (`PaginatedResponse`, page +
  limit + total), на который опираются будущие owner-/админ-списки (жалобы,
  очередь модерации, audit logs).
- `DELETED` гарантированно не утекает в owner-список, единообразно с TASK-051.
- Компактный `ListingListItem` отделён от тяжёлой детальной карточки — меньше
  данных по сети в списках.

Negative / trade-offs:

- Page-based (OFFSET) деградирует на глубоких страницах; для owner-списка объём
  мал, поэтому приемлемо. Публичные большие выборки пойдут через keyset.
- `count` отдельным запросом — лишний round-trip; для owner-объёмов несущественно.
- `title` в списке — только `original_language`; переключение языка карточек в
  списках появится вместе с публичным поиском.

## Related files

- apps/api/src/listings/dto/list-my-listings.dto.ts
- apps/api/src/listings/listings.controller.ts
- apps/api/src/listings/listings.service.ts
- apps/api/src/listings/listings.service.spec.ts
- apps/api/src/listings/index.ts

## Related task

- TASK-052
