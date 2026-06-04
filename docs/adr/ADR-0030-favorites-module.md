# ADR-0030 — Favorites module: keyset list reusing the /search card

## Status

Accepted

## Date

2026-06-05

## Context

TASK-090 (milestone M6) добавляет избранные объявления (API.md §11, CLAUDE.md §4):

- `GET /api/v1/favorites` — список избранного пользователя (карточки как в `/search`);
- `POST /api/v1/favorites` — добавить листинг в избранное;
- `DELETE /api/v1/favorites/:listingId` — убрать из избранного.

Схема уже готова: модель `Favorite` (`UNIQUE (user_id, listing_id)`,
индексы по `user_id`/`listing_id`, `ON DELETE CASCADE`) и таблица `favorites`
созданы миграцией `20260603180000_add_favorites_saved_searches` (DB_SCHEMA §9).
Код ошибки `ALREADY_FAVORITED` (409) уже в каталоге (`ApiErrorCode`, API.md §17).
Эта задача — application-слой поверх существующей схемы; новых миграций нет.

Маршруты в карточке TASK-090 (`POST/DELETE /favorites/:listingId`) расходятся с
API.md (`POST /favorites` с телом `{ listing_id }`, `DELETE /favorites/:listingId`).
Источник истины — **docs/API.md**: добавление идёт телом на коллекционный
`POST /favorites`, удаление — по `:listingId` в пути.

API.md §11: «карточки как в `/search`» — список избранного должен возвращать ту
же форму карточки (§9), что публичный поиск, с выбором языка перевода и
cover-медиа.

## Decision

1. **Модуль/маршруты (API versioning, CLAUDE.md §14).** Новый `FavoritesModule`
   с `FavoritesController` (`@Controller({ path: 'favorites', version: '1' })`).
   Весь контроллер под `JwtAuthGuard` (класс-уровень) — `GUEST` без Bearer → `401`
   (API.md §11). `RolesGuard` не нужен: избранное доступно любому
   аутентифицированному пользователю, без привязки к роли.

2. **Добавление — атомарный анти-дубликат.** `POST /favorites` проверяет, что
   листинг существует и не `DELETED` (иначе `404`), затем делает
   `favorite.create`. Дубликат ловится по `P2002` (unique-индекс) →
   `409 ALREADY_FAVORITED`, без TOCTOU-предпроверки `findFirst`. Ответ —
   квиток `{ id, listing_id, created_at }` (`201`); карточка не возвращается.

3. **Удаление по владельцу.** `DELETE /favorites/:listingId` →
   `favorite.deleteMany({ where: { userId, listingId } })`. Удаление идёт по паре
   `(user_id, listing_id)`, поэтому убрать чужое избранное нельзя; `count === 0`
   (нечего удалять) → `404`. `:listingId` валидируется `ParseUUIDPipe`.

4. **Список — keyset по `favorites.created_at`.** `GET /favorites` сортирует по
   времени добавления (`created_at DESC, id DESC`, свежие сверху), НЕ по промо-тиру
   листинга (в отличие от `/search`). Поэтому keyset-курсор у избранного **свой**
   (`{ created_at, id }`, base64url JSON), а не tier-aware курсор поиска.
   `DELETED`-листинги исключаются relation-фильтром
   `listing: { status: { not: DELETED } }` на уровне БД — keyset (`limit + 1`) и
   `total` (`count`) считаются уже по видимым строкам (срез DELETED в JS сломал бы
   `limit`/`total`). Повреждённый курсор → `400 VALIDATION_ERROR` (как в `/search`).

5. **Карточка «как в /search» — переиспользование (DRY).** Гидратация карточек §9
   делегируется новому публичному методу `SearchService.cardsByIds(ids, lang,
   acceptLanguage)`: он грузит листинги по `id` (тот же `SEARCH_SELECT`:
   translations + cover-медиа), сохраняет порядок входных `id` и маппит каждый
   через приватный `toSearchItem`. Так выбор языка перевода (TASK-070) и формат
   карточки §9 не дублируются; `SEARCH_SELECT`/`toSearchItem` остаются инкапсулиро-
   ванными в `SearchService`. `distance_m` для избранного не проставляется (точки
   запроса нет). `FavoritesModule` импортирует `SearchModule` ради этого метода.

## Consequences

Positive:

- Полный favorites-CRUD поверх существующей схемы — без новых миграций.
- Карточка списка идентична `/search` (§9): единый формат для web (RTK Query) и
  будущего Flutter-клиента; язык перевода и cover-медиа не переписаны заново.
- Анти-дубликат атомарен (unique-индекс/`P2002`), без гонки `findFirst`+`create`.
- Удаление безопасно по владельцу; чужое избранное недоступно.

Negative / trade-offs:

- `FavoritesModule → SearchModule` — направленная связь ради `cardsByIds`;
  допустима (favorites зависит от формата карточки поиска, не наоборот; цикла нет).
- Покрытие — юнит-тесты (Prisma/SearchService мокаются), как у `listing-media`;
  live-PostgreSQL integration-spec для favorites не добавлялся (relation-фильтр и
  keyset проверены на моках; отдельные int-тесты — backlog при необходимости).
- Сортировка списка — только по времени добавления; промо-приоритизация избранного
  в MVP не требуется (избранное — личный список пользователя, не витрина).

## Related files

- apps/api/src/favorites/favorites.controller.ts
- apps/api/src/favorites/favorites.service.ts
- apps/api/src/favorites/favorites.module.ts
- apps/api/src/favorites/favorites.service.spec.ts
- apps/api/src/favorites/dto/create-favorite.dto.ts
- apps/api/src/favorites/dto/list-favorites.dto.ts
- apps/api/src/favorites/index.ts
- apps/api/src/search/search.service.ts (public `cardsByIds`)
- apps/api/src/app.module.ts
- docs/API.md (§11)

## Related task

- TASK-090

## Related ADR

- ADR-0026/0027 (public search keyset + §9 card — reused via `cardsByIds`)
- ADR-0024 (listing translation — language selection of the reused card)
- ADR-0016 (RBAC guards — `JwtAuthGuard` gates GUEST)
- ADR-0007 (unified error envelope — `ALREADY_FAVORITED`/`NOT_FOUND`)
