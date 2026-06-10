# Дизайн: фундамент auth + RTK Query для `apps/web` (Цикл 3, PR 1)

- **Дата:** 2026-06-10
- **App:** `apps/web` (админка)
- **Цикл:** 3 — «подключить API через RTK Query» к редизайненной админке
- **Этот документ:** только **первый PR** цикла 3 — фундамент (store + auth + login +
  guard). Бизнес-страницы и мапперы DTO→UI — отдельными PR (см. §7).

## 1. Контекст и проблема

При визуальном редизайне (commit `6ac138a`) админку `apps/web` пересобрали заново на
**моках** (`src/lib/mock/*`). Из неё убрали весь Redux/RTK Query/auth-слой, который
был реализован и live-проверен в задачах ADMIN-01..17 (теперь лежит в `apps/web_old`).

Текущее состояние нового `apps/web`:

- Next 15 + React 19 + Tailwind v4. `@reduxjs/toolkit` и `react-redux` уже в
  зависимостях, но директории `store/` **нет**.
- Страницы — client-компоненты, синхронно читают `ADMIN` из `@/lib/mock`.
- Нет `StoreProvider`, нет auth, нет `/admin/login`, нет guard роли `ADMIN`.
- Дизайн-система — CSS-токены (`--ink`, `--red`, `--surface`, `--border`, …) и
  глобальные классы (`abtn`, `a-card`, `a-field`, `a-table`) из
  `apps/claudeDesign/styles/*`. TailAdmin-классов (`brand-500`, `gray-50`) больше нет.

Без auth-фундамента ни одна защищённая ручка `/admin/*` не заработает, поэтому цикл 3
начинается с него.

## 2. Зафиксированные решения

| Вопрос | Решение |
|---|---|
| Подход к подключению API | **Адаптер**: портируем рабочий RTK-слой из `web_old` как есть; на этапе бизнес-страниц пишем мапперы `API DTO → существующие UI-типы моков`, сохраняя сигнатуры (как обещано в комментариях `lib/mock/*`). Страницы переписываем минимально. |
| Объём первого PR | **Только фундамент**: store + baseQuery (Bearer + авто-refresh) + authApi + authSlice + страница логина (OTP email) + guard роли `ADMIN`. Бизнес-страницы — следующими PR. |
| Auth | Passwordless **OTP по EMAIL**. access — в памяти (Redux), refresh — в `localStorage`, авто-refresh на 401, guard по роли `ADMIN`. (Решения ADMIN-04/05/06.) |
| i18n | Админка **RU-only** (как было до ADMIN-17). Экраны guard/login — RU-строки инлайн, без `useT`. |
| Стиль экранов | Login и экраны guard (loading/403/error) **переверстать** под новый дизайн (`a-card`/`a-field`/`abtn`/CSS-токены), НЕ копировать TailAdmin-вёрстку из `web_old`. |

## 3. Архитектура

```
apps/web/src/
  store/
    api/
      baseApi.ts        — createApi (reducerPath 'api', tagTypes), injectEndpoints
      baseQuery.ts      — Bearer + single-flight авто-refresh на 401
      authApi.ts        — requestOtp/verifyOtp/refresh/logout/getMe (snake_case)
      apiError.ts       — error.code → RU-сообщение (+ парсер FetchBaseQueryError)
    slices/
      authSlice.ts      — access в памяти, refresh в localStorage, initializeAuth
    store.ts            — makeStore, RootState, AppDispatch
    StoreProvider.tsx   — Provider + dispatch(initializeAuth())
  hooks/
    useLogout.ts        — POST /auth/logout + logOut + редирект на /admin/login
  components/admin/
    ConditionalShell.tsx — login chromeless; остальное под RoleGuard + AdminShell
    RoleGuard.tsx        — гидрация-гейт → getMe → роль ADMIN (экраны в новом стиле)
  app/admin/
    layout.tsx          — StoreProvider → ToastProvider → ConditionalShell
    login/page.tsx      — двухшаговый EMAIL-OTP
```

Слой данных в `store/api/*` и `store/slices/*` портируется из `web_old` **1:1 по
логике** (он уже live-проверен). Адаптируются только пути импортов под структуру нового
`apps/web` (`@/store/...`).

## 4. Поток аутентификации

1. `StoreProvider` при старте диспатчит `initializeAuth()` — подтягивает refresh-токен
   из `localStorage` (`avino.admin.refresh_token`), ставит `initialized = true`.
2. `ConditionalShell` смотрит `pathname`:
   - `/admin/login` → рендер без оболочки и без guard (иначе редирект-петля);
   - иначе → `RoleGuard` → `AdminShell`.
3. `RoleGuard`:
   - до гидрации (`hydrated && initialized`) — нейтральный экран загрузки (убирает
     hydration mismatch: на сервере `localStorage` нет);
   - нет токенов → `router.replace('/admin/login')`;
   - есть токен → `GET /auth/me`; истёкший access восстановит авто-refresh;
     невалидный refresh → `logOut` → редирект на логин;
   - нет роли `ADMIN` → экран 403; не-401 ошибка → экран «Повторить/Выйти».
4. Логин: email → `requestOtp` (`{ channel:'EMAIL', destination }`); код →
   `verifyOtp` (`{ channel:'EMAIL', destination, code }`) → `setCredentials` →
   редирект `/admin`. Таймер resend из `resend_after`; ошибки `OTP_INVALID` /
   `OTP_EXPIRED` / `OTP_ATTEMPTS_EXCEEDED` / `RATE_LIMITED` → RU через `apiError`.
5. Logout: `useLogout` → `POST /auth/logout { refresh_token }` → `logOut` → редирект
   на `/admin/login`. Кнопка — в `Topbar`; имя/email берём из `getMe`.

## 5. Хранение токенов

- **access** — только в Redux (`authSlice.accessToken`), живёт до перезагрузки.
- **refresh** — `localStorage` ключ `avino.admin.refresh_token`, зеркалится в state.
- Конкурентные 401 обслуживаются одним refresh (single-flight через `refreshInFlight`).

(httpOnly-cookie — hardening на потом, как и в ADMIN-04.)

## 6. Конфигурация окружения

- База API — `process.env.NEXT_PUBLIC_API_BASE_URL` (по умолчанию `http://localhost:4000`)
  + суффикс `/api/v1`. Совпадает с `apps/client/src/store/api/baseQuery.ts` и
  `apps/web/Dockerfile` (ARG/ENV уже заданы). Новых переменных не вводим.

## 7. Границы PR и что НЕ входит

В этот PR **не входит** (отдельные PR цикла 3):

- Подключение бизнес-страниц (листинги, модерация, юзеры, жалобы, промо, логи,
  дашборд) к API и мапперы `DTO → UI-типы моков`.
- Удаление `lib/mock/*` — моки остаются, пока страница не мигрирована.
- adminApi-слайсы (`adminListingsApi`, `adminUsersApi`, …) — портируются по мере
  подключения соответствующих страниц.
- i18n админки (uz/ru/en) — вне цикла 3.

## 8. Тестирование и приёмка

Gates:

```bash
pnpm --filter @avino/web lint
pnpm --filter @avino/web build   # включает type-check + prerender
```

Acceptance:

- `/admin/login` отдаёт 200, рендерится двухшаговая форма без оболочки.
- `/admin` под guard: без токена → редирект на `/admin/login`.
- `lint` + `build` зелёные; все admin-маршруты пререндерятся без ошибок.

Live e2e (ручная проверка при поднятом `apps/api`): реальный вход админа end-to-end,
не-админ → 403, logout → `/admin/login`. Историческая оговорка: backend мог не
стартовать из-за pre-existing `@types/express` в `chat.controller.ts` (к этой задаче
отношения не имеет) — если воспроизведётся, фиксируем как «live не прогнан, нужен
ручной прогон».

## 9. Ветка и оформление

- Ветка: `feat/admin-web-rtk-foundation`.
- Один связный PR (CLAUDE.md §5: в `main` напрямую не пушим).
- Commit (ориентир): `feat(web): add RTK Query auth foundation for admin`.
- После merge: отметить в трекере, при необходимости — ADR/обновление DONE.md.
