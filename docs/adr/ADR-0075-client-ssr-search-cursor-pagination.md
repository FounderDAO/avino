# ADR-0075 — Поиск на портале: SSR-первая страница + клиентская keyset-дозагрузка (apps/client)

## Status

Accepted (заменяет механизм ADR-0061)

## Date

2026-06-15

## Context

`GET /api/v1/search` (API.md §9) использует keyset-пагинацию: ответ —
envelope `{ data, meta }`, где `meta.total` = общее число объявлений под
фильтром, `meta.next_cursor` = непрозрачный токен следующей страницы (`null` на
конце). Бэкенд принимает `limit` (default 20, max 100) и `cursor` (ADR-0026).

ADR-0061 (TASK-151) реализовал клиентскую keyset-merge пагинацию через RTK Query
(`serializeQueryArgs`/`merge`/`forceRefetch`) в компоненте `SearchPage.tsx` на
маршрутах `/sale`, `/rent`. Последующий редизайн поиска (ADR-0071 — SSR +
URL-первые фильтры, ADR-0072 — единый сплит «карта слева / карточки справа»)
**удалил** эту инфраструктуру (`SearchPage.tsx`, `store/api/pagination.ts`,
страницы `/sale`/`/rent`). Новая SSR-страница `/[locale]/search` грузила только
первую страницу (`limit=24`) и **отбрасывала `meta`** — объявления дальше 24-го
становились недостижимы, счётчик показывал лишь размер первой страницы.

TASK-199 переустанавливает пагинацию, но в новой SSR-первой форме: первая
страница рендерится сервером (для SEO/first paint), дозагрузка — на клиенте.

## Decision

Первую страницу отдаёт SSR, последующие дотягивает клиент по keyset-курсору:

- **Серверный слой** (`lib/api/listings.ts`): новая `searchListingsPage(filter,
  lang, limit, cursor?)` возвращает `{ listings, total, nextCursor }` —
  в отличие от `searchListings`, сохраняет `meta`. Деградирует до пустой
  страницы без курсора при ошибке API (как `safeSearch`), не роняя SSR.
  `searchListings` оставлен без изменений (его используют главная и `/map`).
- **SSR-страница** (`app/[locale]/search/page.tsx`) вызывает
  `searchListingsPage` и прокидывает `listings` (страница 1), `total`
  (`meta.total`) и `initialCursor` (`meta.next_cursor`) в `SearchResults`.
- **Клиентская дозагрузка** (`store/api/searchApi.ts`): новый lazy-эндпоинт
  `searchPage` (RTK Query, CLAUDE.md §4) шлёт `GET /search?cursor&limit&<фильтры>`
  и возвращает `{ listings, total, nextCursor }` тем же `mapListing`.
- **Аккумуляция — в локальном состоянии `SearchResults`**, а не в кэше RTK
  (отличие от ADR-0061): `extra: Listing[]` + `cursor`, `displayed =
  [...ssrPage, ...extra]`. Кнопка «Показать ещё» вызывает lazy-триггер и
  аппендит результат. Смена фильтров (новая SSR-выдача) сбрасывает `extra`/
  `cursor` по сигнатуре фильтра + первому курсору.
- Счётчик заголовка — `meta.total` (а не размер загруженного среза); у кнопки —
  «Показано N из total». Под нарисованной территорией пагинации нет (одна
  страница `/search/polygon`, ADR-0070), счётчик = число в области.
- Догруженные карточки появляются и на карте: `MapView` перестраивает пины при
  росте набора (`listingsKey`), а подсветка `activeId` живёт отдельным эффектом,
  поэтому активный hover при дозагрузке не сбрасывается.

Локальная аккумуляция (вместо `merge`/`serializeQueryArgs` из ADR-0061) выбрана
потому, что источник истины первой страницы — SSR-пропсы, а не кэш RTK; смешивать
SSR-данные с RTK-merge-записью некорректно (двойной источник, гонки сброса).

## Consequences

Positive:
- Объявления за пределами первой страницы снова достижимы; счётчик отражает
  реальный `meta.total`.
- Первая страница — SSR (SEO/first paint), дальше — без полной перезагрузки.
- Доступ к API только через RTK Query и versioned `/api/v1`; маппинг ответа
  переиспользует `mapListing` (без дублирования).
- Деградация при ошибке API не роняет страницу.

Negative / trade-offs:
- Аккумулированный список держится в памяти компонента до смены фильтров —
  приемлемо для MVP-выдачи.
- `autoFit` карты переподгоняет вид при росте набора пинов (дозагрузка может
  отдалить карту) — допустимо; критично лишь сохранение активного hover.
- Кнопочная дозагрузка (не IntersectionObserver) — сознательно проще и
  предсказуемее в сплит-скролле; авто-догрузку можно добавить позже без смены
  контракта.

## Related files

- apps/client/src/lib/api/listings.ts
- apps/client/src/store/api/searchApi.ts
- apps/client/src/app/[locale]/search/page.tsx
- apps/client/src/features/search/SearchResults.tsx
- apps/client/messages/{ru,en,uz}.json
- apps/client/src/lib/api/listings.test.ts

## Related task

- TASK-199 (заменяет механизм ADR-0061)
