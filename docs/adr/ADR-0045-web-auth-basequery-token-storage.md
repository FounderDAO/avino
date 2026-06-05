# ADR-0045 — Web auth baseQuery: Bearer + auto-refresh + token storage

## Status

Accepted

## Date

2026-06-06

## Context

Веб-админка (`apps/web`) ходит в backend через RTK Query (ADR-0043, CLAUDE.md
§4). Backend-авторизация — passwordless OTP с парой токенов (ADR-0014/0015,
API.md §3):

- `access_token` — короткоживущий Bearer (`expires_in` 900s);
- `refresh_token` — ротируемый, с отзывом всей session-family при повторном
  использовании (`401 TOKEN_REUSED`).

Нужно решить на фронте две связанные задачи:

1. **Где хранить токены.** access — частый предмет XSS-кражи; refresh — должен
   переживать перезагрузку, чтобы не логиниться каждый раз.
2. **Как прозрачно продлевать сессию**, когда access протух (`401`), не показывая
   пользователю экран логина при каждом истечении.

Backend отдаёт токены в теле ответа (не httpOnly cookie), поэтому хранение —
ответственность клиента.

## Decision

**Хранение токенов:**

- `access_token` — **только в памяти** (Redux `authSlice.accessToken`). Не
  пишется в localStorage; живёт до перезагрузки вкладки. Минимизирует окно XSS-
  кражи долгоживущего секрета.
- `refresh_token` — в **localStorage** (`avino.admin.refresh_token`), зеркалится
  в `authSlice.refreshToken`. Переживает перезагрузку. На старте приложения
  `StoreProvider` диспатчит `initializeAuth()` — гидрация из localStorage.

После перезагрузки access отсутствует → первый защищённый запрос получает `401`
→ срабатывает авто-refresh и обменивает сохранённый refresh на свежий access.

**baseQueryWithReauth** (`apps/web/src/store/api/baseQuery.ts`):

- `prepareHeaders` подставляет `Authorization: Bearer <access>` из стейта;
- на `401` (кроме самого `/auth/refresh`) один раз дёргает `POST /auth/refresh`,
  пишет новую пару через `setTokens`, повторяет исходный запрос;
- при неудаче refresh — `logOut()` (состояние «разлогинен», очистка localStorage);
- **single-flight**: конкурентные `401` обслуживаются одним общим refresh-промисом,
  чтобы не плодить параллельные `/auth/refresh` (иначе ротация отозвала бы
  family → `TOKEN_REUSED`).

Подключён `authReducer` в `store.ts` (ключ `auth`).

## Consequences

Positive:
- Долгоживущий refresh не лежит в JS-памяти дольше необходимого; access не
  персистится.
- Прозрачное продление сессии — пользователь не видит лишних логинов.
- Single-flight исключает гонку, ломающую refresh-rotation бэкенда.
- Централизованный auth-слой; компоненты не трогают токены и не делают `fetch`.

Negative / trade-offs:
- refresh в localStorage уязвим к XSS (нет httpOnly). Принято для MVP-админки;
  ужесточение (httpOnly cookie + CSRF) — отдельное решение, если потребуется.
- access в памяти теряется при перезагрузке → один «лишний» refresh-roundtrip на
  старте. Приемлемо.
- Модуль-левел `refreshInFlight` — синглтон на загрузку модуля; для SSR это
  безопасно, т.к. baseQuery исполняется только в браузерных запросах.

## Related files

- apps/web/src/store/slices/authSlice.ts
- apps/web/src/store/api/baseQuery.ts
- apps/web/src/store/api/baseApi.ts
- apps/web/src/store/store.ts
- apps/web/src/store/StoreProvider.tsx

## Related task

- ADMIN-04 (docs/TASK_ADMIN_PANEL.md)
