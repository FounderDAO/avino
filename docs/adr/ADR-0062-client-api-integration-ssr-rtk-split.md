# ADR-0062 — Интеграция портала с API: SSR-fetch для SEO-страниц + RTK Query для интерактива (apps/client)

## Status

Accepted

## Date

2026-06-12

## Context

Публичный портал `apps/client` (TASK-190..192, M14/M15) был собран как
визуальная оболочка на мок-слое `src/lib/mock` с пустым RTK Query-фундаментом
(`baseApi`, ADR-0058). Требовалось подключить весь портал к реальному NestJS API
(`/api/v1`), не ломая существующие контракты компонентов и сохраняя SEO.

Ключевое противоречие:

- Страницы `home` (`/`), `search` (`/search`), `listing/[id]` — **server
  components**, тянущие данные синхронно из мок-слоя. Для портала недвижимости
  выдача и карточки объекта **критичны для SEO** (индексация, OG-превью), т.е.
  данные должны рендериться на сервере.
- RTK Query — **клиентский** кэш-слой; защищённые/интерактивные операции
  (auth, favorites, saved searches, chat, profile, создание объявления)
  требуют Bearer-токен и живут на клиенте.

Один и тот же контракт `GET /api/v1/search` обслуживает обе плоскости, но
смешивать их в одном механизме нельзя без потери либо SSR/SEO, либо
клиентского кэша/реактивности.

Дополнительный контекст — несовпадения с контрактом, обнаруженные при wiring
(см. «Consequences»): часть фильтров `/search` бэком пока игнорируется,
гео-справочник (city/district uuid↔имя) отсутствует, контакт владельца не
встроен в листинг, структурные `features[]` не отдаются.

## Decision

Принят **гибридный data-fetching**: данные делятся по плоскости рендеринга, а не
по сущности.

1. **SEO-страницы — серверный fetch-слой `src/lib/api/listings.ts`.**
   - Тонкий `apiFetch`/`fetchOrNull` (`cache: 'no-store'`) к versioned `/api/v1`.
   - Чистый маппер `mapListing(apiItem) → Listing` приводит snake_case-ответ к
     существующей UI-модели `Listing` (`lib/mock/types.ts`). **Сигнатуры
     повторяют мок-селекторы** (`getFeaturedListings`/`searchListings`/
     `getListingById`/`getSimilarListings`), поэтому фич-компоненты и страницы
     меняют только источник данных, не разметку.
   - Списочные выборки **деградируют до `[]` при ошибке API** (лог на сервере) —
     одиночный сбой секции не роняет всю страницу в 500. `getListingById`
     сохраняет 404 → `null` (`notFound()`).

2. **Интерактив/защищённые операции — RTK Query поверх общего `baseApi`.**
   - `authApi` + `baseQuery` с Bearer-инъекцией и **single-flight refresh-ротацией**
     на 401; `authSlice` хранит токены (localStorage, SSR-guard).
   - По одному инъект-файлу на область: `favoritesApi`, `savedSearchesApi`,
     `myListingsApi`, `notificationsApi`, `chatApi`, `usersApi`,
     `createListingApi`, `promotionsApi`. Инвалидация по tag-типам `baseApi`.
   - Чат — **polling** (threads 10s, messages 6s), без WebSocket для MVP.

3. **Auth-aware хуки без изменения сигнатур.** `favorites`-хуки
   (`useIsFavorite`/`useToggleFavorite`/`useFavoritesCount`) ветвятся внутри:
   авторизован → server (`/favorites`), гость → localStorage. Это сохраняет
   работу ♥ в `PropertyCard` во всех контекстах без правок потребителей.

4. **`mapListing` переиспользуется** и серверным слоем, и RTK-эндпоинтами
   (favorites/my-listings), т.к. список-айтемы структурно совпадают с `/search`.

## Consequences

Positive:

- SSR/SEO сохранены для home/search/detail; интерактив и кэш — на RTK Query.
- Компоненты не переписаны: маппер держит UI-модель `Listing` стабильной.
- Портал устойчив к сбоям API и к задокументированным пробелам бэкенда
  (секции деградируют, а не падают).
- Каждая область подключена и **live-проверена** против локального стека
  (request→response реальным Bearer-токеном); `tsc` 0 ошибок, `next build`
  чистый.

Negative / trade-offs:

- Два пути доступа к данным (SSR-fetch и RTK Query) — выше когнитивная
  стоимость; граница «SEO-страница vs интерактив» должна соблюдаться осознанно.
- `cache: 'no-store'` на SSR-выборках исключает кэш страниц (приемлемо для
  динамической выдачи MVP; ISR/таги — отдельная оптимизация).
- Серверный слой дублирует часть типов ответа с RTK-эндпоинтами (общий маппер
  снижает дублирование, но не убирает полностью).

Известные пробелы бэкенда (фронт корректен; помечены `// TODO` и
задокументированы в DONE — TASK-193):

- `GET /search` игнорирует `q`/`rooms`/`sort`/`area_*`/`promotion_type` —
  отправляются forward-compatible, но не влияют на выдачу.
- Нет гео-справочника (city/district uuid↔имя) → `district` (имя) не маппится в
  `district_id`; фильтр по району и блоки «Районы»/«Агенты» остаются на моках.
- Контакт владельца не встроен в `GET /listings/:id` → `ContactCard` на
  плейсхолдере.
- `features[]` (M5) не отдаётся → удобства берутся из `features_text`.
- `POST /listings` требует роль `OWNER|AGENT|…`; свежий `USER` → 403.
- Dev-загрузка медиа 500 при незаданных `S3_ACCESS_KEY_ID/SECRET`.

## Related files

- apps/client/src/lib/api/listings.ts
- apps/client/src/app/page.tsx
- apps/client/src/app/search/page.tsx
- apps/client/src/app/listing/[id]/page.tsx
- apps/client/src/store/api/baseQuery.ts
- apps/client/src/store/api/authApi.ts
- apps/client/src/store/slices/authSlice.ts
- apps/client/src/store/api/{favoritesApi,savedSearchesApi,myListingsApi,notificationsApi,chatApi,usersApi,createListingApi,promotionsApi}.ts
- apps/client/src/components/layout/LoginModal.tsx
- apps/client/src/components/SessionBootstrap.tsx
- apps/client/src/features/account/* , apps/client/src/features/listing-new/*

## Related task

- TASK-193 (continues ADR-0058 client RTK foundation; complements ADR-0061
  search keyset pagination)
