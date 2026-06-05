# ADR-0049 — Web admin ADMIN role guard and logout

## Status

Accepted

## Date

2026-06-06

## Context

После логина (ADMIN-05) любой обладатель валидного OTP получал токены, но
разделы админки (`/admin/*`) ничем не были защищены: не проверялись ни наличие
сессии, ни роль `ADMIN`. Нужно (ADMIN-06):

- редиректить неаутентифицированного пользователя на `/admin/login`;
- пускать в панель только пользователей с ролью `ADMIN` (иначе экран 403);
- дать выход из админки (logout) с гашением refresh-токена на бэкенде.

Ограничения контекста:
- access-токен живёт только в памяти (Redux), refresh — в `localStorage`
  (ADR-0045). При перезагрузке страницы access теряется и восстанавливается через
  `/auth/refresh` внутри `baseQueryWithReauth`.
- `localStorage` доступен только на клиенте, поэтому состояние «аутентифицирован»
  различается между SSR (всегда false) и клиентом — это источник hydration
  mismatch, который гард обязан исключить.
- Логин (`/admin/login`) лежит в той же route group `(admin)` и рендерится
  полноэкранно через `ConditionalShell` (ADR-0046).

## Decision

Гард реализован как клиентский компонент `RoleGuard`, который вешается в
`ConditionalShell` **только на защищённые маршруты** — логин остаётся вне гарда,
иначе редирект на `/admin/login` зациклился бы.

Логика `RoleGuard`:
1. Локальный флаг `hydrated` (false на сервере и при первом клиентском рендере,
   true после `useEffect`) вместе с `selectAuthInitialized` гейтит первый рендер
   нейтральным экраном «Загрузка…» — это убирает hydration mismatch.
2. Нет токенов (или их аннулировал упавший refresh) → `router.replace('/admin/login')`.
3. Есть токен → `GET /auth/me` (через существующий `useGetMeQuery`). Истёкший
   access восстанавливает авто-refresh (ADMIN-04); невалидный refresh приводит к
   `logOut` в `baseQueryWithReauth` → гард видит «нет токенов» → редирект на логин.
4. Профиль без роли `ADMIN` → полноэкранный экран 403 с выходом.
5. Роль `ADMIN` есть → рендерим защищённую оболочку (`AdminShell`).
6. Ошибка `/auth/me` не по 401 (сеть / 5xx) → экран ошибки с «Повторить» и «Выйти».

Выход вынесен в переиспользуемый хук `useLogout`: `POST /auth/logout`
(`{ refresh_token }`) → `logOut()` (очистка памяти + `localStorage`) →
`router.replace('/admin/login')`. Сетевые ошибки самого `/auth/logout`
игнорируются — локальный разлогин выполняется всегда. Хук используется и кнопкой
выхода в шапке (`UserMenu`), и экранами 403/ошибки.

Статичная заглушка пользователя в шапке заменена на `UserMenu`: реальные
имя/email из кэша `/auth/me` + dropdown с кнопкой «Выйти» (закрытие по клику вне
и Escape).

## Consequences

Positive:
- Не-админ физически не попадает в разделы панели; logout гасит сессию на
  бэкенде и локально.
- Гард опирается на уже готовые `useGetMeQuery` и `baseQueryWithReauth` — никакой
  новой логики токенов; единый источник правды о текущем пользователе.
- `hydrated`-гейт исключает hydration mismatch и «мигание» защищённого контента.
- `useLogout` — единая точка выхода, переиспользуемая всеми экранами.

Negative / trade-offs:
- Защита клиентская: прямой запрос к API всё равно требует Bearer и проверяется
  бэкендом, но сам HTML-роут не защищён на уровне middleware. httpOnly-cookie и
  серверный guard — отдельный hardening позже (как и отмечено в ADR-0046).
- На каждом заходе в панель выполняется `GET /auth/me`; кэш RTK Query это
  смягчает (один запрос на сессию, переиспользуется шапкой).
- Логин по-прежнему пускает любого с валидным OTP вплоть до экрана 403; ранний
  отказ не-админу на этапе verify — возможное последующее улучшение.

## Related files

- apps/web/src/layout/RoleGuard.tsx
- apps/web/src/layout/ConditionalShell.tsx
- apps/web/src/layout/UserMenu.tsx
- apps/web/src/layout/AppHeader.tsx
- apps/web/src/hooks/useLogout.ts

## Related task

- ADMIN-06 (docs/TASK_ADMIN_PANEL.md) — часть M14 (web foundation)
