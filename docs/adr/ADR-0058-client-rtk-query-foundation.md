# ADR-0058 — RTK Query foundation для публичного портала (apps/client)

## Status

Accepted

## Date

2026-06-08

## Context

`apps/client` (публичный портал, ADR-0057) был создан как чистый каркас Next.js
без слоя данных. По CLAUDE.md §4 весь доступ к API на фронтенде обязан идти
через централизованный RTK Query-слой, без хаотичных `fetch()`/`axios` внутри
компонентов. По §14 клиент обязан ходить только в versioned API `/api/v1`.

Перед бизнес-страницами (auth, поиск, объявления, избранное, чат) порталу нужен
тот же фундамент store + baseApi + provider, что уже доказан в `apps/web`
(ADR-0045, ADR-0050). TASK-141 закладывает этот фундамент в `apps/client`.

## Decision

В `apps/client` добавлен RTK Query-фундамент по конвенциям `apps/web`:

- `src/store/api/baseQuery.ts` — `fetchBaseQuery` с base URL
  `${NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'}/api/v1`.
- `src/store/api/baseApi.ts` — единый `createApi` (`reducerPath: 'api'`) с
  предзаданными `tagTypes` (Auth, Listing, Search, SavedSearch, Favorite, Chat,
  Notification, User); эндпоинты подключаются через `injectEndpoints` в
  `store/api/*.ts`.
- `src/store/store.ts` — `makeStore()` (configureStore + baseApi reducer/middleware)
  и типы `AppStore` / `RootState` / `AppDispatch`.
- `src/store/hooks.ts` — типизированные `useAppDispatch` / `useAppSelector`.
- `src/store/StoreProvider.tsx` — `Provider` со store, созданным один раз через
  `useRef` (свежий store на каждый SSR-запрос, без пересоздания на клиенте).
- `StoreProvider` подключён в `src/app/layout.tsx`.

Сознательно НЕ переносится auth-логика (`baseQueryWithReauth`, authSlice,
token storage) — это отдельная пользовательская модель доступа, она добавляется
в TASK-150 вместе с auth UI. Сейчас baseQuery чистый, без Bearer/refresh.

## Consequences

Positive:
- Единая точка входа RTK Query на портале; прямые fetch/axios в компонентах
  исключены по правилу проекта.
- Все запросы по умолчанию идут в versioned `/api/v1`.
- Типобезопасный store-фундамент готов под последующие слайсы (auth, listings,
  search, favorites, chat, notifications).

Negative / trade-offs:
- Частичное дублирование store-конфигурации между `apps/web` и `apps/client`.
  Вынос в `packages/*` сейчас преждевременен (как и в ADR-0057).
- baseQuery без reauth — клиентский auth-слой потребует расширения baseQuery
  в TASK-150 (по образцу ADR-0045).

## Related files

- apps/client/src/store/api/baseQuery.ts
- apps/client/src/store/api/baseApi.ts
- apps/client/src/store/store.ts
- apps/client/src/store/hooks.ts
- apps/client/src/store/StoreProvider.tsx
- apps/client/src/app/layout.tsx
- apps/client/package.json

## Related task

- TASK-141
