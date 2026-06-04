# ADR-0026 — Public listing search: keyset pagination & basic filters

## Status

Accepted

## Date

2026-06-04

## Context

TASK-080 открывает milestone M6 (публичный поиск) поверх листингов M5
(create/update — ADR-0018, карточка — ADR-0019, owner-список — ADR-0020). `API.md`
§9 требует `GET /api/v1/search` — публичный (без auth) поиск, возвращающий
**только `ACTIVE`** объявления. Это первый keyset-эндпоинт проекта, поэтому он
фиксирует контракт курсорной пагинации для публичных коллекций (в отличие от
page-based owner-списка, ADR-0020).

TASK-080 — базовый срез поиска. Promotion-приоритетная сортировка (TASK-081),
гео-фильтры PostGIS (TASK-082) и свободный текст `q`/area/rooms/feature_ids идут
отдельными задачами. Чтобы форма карточки не менялась между задачами, в TASK-080
уже отдаётся полный набор полей карточки §9, включая `effective_tier`.

Требования и бизнес-правила:

1. **Только `ACTIVE`.** `DELETED` и прочие непубличные статусы исключены из всех
   публичных read-path (DB_SCHEMA §15) — фильтр по статусу не опционален.
2. **Базовые фильтры (scope TASK-080):** `transaction_type`, `property_type`,
   диапазон цены `price_min`/`price_max` **в пределах одной валюты** (`currency`,
   без FX), `city_id`, `district_id`.
3. **Пагинация — keyset (cursor)** как основной режим публичного поиска (API.md
   §4, ADR-0007): непрозрачный токен последней позиции, `next_cursor` или `null`.
4. **Контракт ответа** — единый envelope `{ data, meta }` (snake_case),
   Decimal/даты строками (ADR-0002); `meta` = `{ limit, total, next_cursor }`.
5. **Язык карточки** — негоциация `?lang`/`Accept-Language` с фолбэком на
   `original_language` (делегируется `TranslationsService`, ADR-0024).

Расхождение карточек: task-card TASK-080 пишет маршрут как `/search/listings`;
`API.md` §9 — авторитетный источник — фиксирует `GET /api/v1/search`. Берём §9.

## Decision

1. **Новый `SearchModule`** (`apps/api/src/search/`): публичный, без `RolesModule`;
   импортирует `TranslationsModule`. Контроллер `@Controller({ path: 'search',
   version: '1' })` → `GET /api/v1/search`, без guards.
2. **Фильтр статуса не опционален** — `where.status = ACTIVE` ставится всегда,
   до пользовательских фильтров.
3. **Диапазон цены в пределах валюты** — `price: { gte?, lte? }` на колонке
   Decimal; `currency` — отдельный equality-фильтр. FX-конвертации нет: клиент
   передаёт `currency` диапазона.
4. **Keyset-пагинация на `(created_at, id)`.** `ORDER BY createdAt DESC, id DESC`;
   `take = limit + 1` (лишний элемент — индикатор `next_cursor`). Курсорное
   условие «строго после позиции»:
   `createdAt < c.createdAt OR (createdAt = c.createdAt AND id < c.id)`.
   `next_cursor` — base64url-JSON `{ createdAt, id }`. Повреждённый cursor →
   `400 VALIDATION_ERROR` (не молчаливый сброс к первой странице).
   `total` — отдельный `count` по фильтрам (без курсора), параллельно с `findMany`.
5. **Карточка `SearchListItem`** — полный набор полей §9, включая
   `promotion_type`/`promotion_expires_at` и `effective_tier`. `effective_tier`
   time-guarded: `VIP`/`TOP` только пока `promotion_expires_at > now()`, иначе
   `NORMAL` (ADR-0004/0006). `title`/`language` — по негоциации; `thumbnail_url`
   — обложка (первое медиа по `sort_order`, fallback на `url`).

### Намеренно вне scope (TASK-080)

- **Promotion-приоритетная сортировка** (`effective_promotion_tier DESC` как
  первичный ключ) — TASK-081. Сейчас порядок — детерминированный хвост
  `created_at DESC, id DESC`; `effective_tier` уже в ответе, поэтому TASK-081 —
  чистое изменение `ORDER BY` (+ расширение курсора тиром).
- **Гео-фильтры PostGIS** (`radius`/`bounds`/`near-me`/`clusters`) — TASK-082.
- **Свободный текст `q`** (ILIKE/pg_trgm по переводам), `area_*`, `rooms`,
  `floor`, `year_built`, `feature_ids`, фильтр `promotion_type`, `sort` — позже.

## Consequences

Positive:

- Зафиксирован переиспользуемый контракт keyset-коллекций
  (`CursorPaginatedResponse`, `{ limit, total, next_cursor }`), на который
  опираются гео-эндпоинты M6 и favorites (тот же envelope, API.md §10/§11).
- `ACTIVE`-only гарантирован на уровне `where`, единообразно с read-path M5.
- Полная карточка §9 (с `effective_tier`) с первого дня → TASK-081 не меняет
  форму ответа, только сортировку.

Negative / trade-offs:

- Курсор на `(created_at, id)` придётся расширить тиром в TASK-081 — формат
  токена сменится. Допустимо: токен непрозрачный и до релиза.
- `count` отдельным запросом — лишний round-trip; приемлемо для MVP-объёмов.
  При росте — кэш/оценочный total.
- Без индекса по фильтрам глубокие выборки замедлятся; индексы под
  `(status, created_at, id)` и фильтры — задача оптимизации (backlog M6).

## Related files

- apps/api/src/search/search.controller.ts
- apps/api/src/search/search.service.ts
- apps/api/src/search/search.service.spec.ts
- apps/api/src/search/search.module.ts
- apps/api/src/search/dto/search-listings.dto.ts
- apps/api/src/search/index.ts
- apps/api/src/app.module.ts

## Related task

- TASK-080
