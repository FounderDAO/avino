# TASK_ADMIN_PANEL.md — Avino Admin Panel (web)

Трекер сборки веб-админки для владельца проекта. Разбит на мелкие
последовательные задачи: **одна задача = одна сессия**. Бэкенд уже полностью
готов (M2–M13) — здесь только фронтенд `apps/web`.

> Статусы: `TODO | IN_PROGRESS | REVIEW | DONE`. По завершении задачи —
> отметить `DONE` здесь, перенести важное в `docs/DONE.md`, при архитектурном
> решении создать ADR (как для бэкенда). Каждая задача = ветка + PR (CLAUDE.md
> §5, в `main` напрямую не пушим).

---

## 0. Зафиксированные решения (контекст для каждой сессии)

| Решение | Выбор |
|---|---|
| UI-база | **TailAdmin free** (MIT, `TailAdmin/free-nextjs-admin-dashboard`). Вендорим компоненты в `apps/web`, добавляем `apps/web/NOTICE` с MIT-атрибуцией. |
| Версии | **Next 15 + React 19 + Tailwind v4** (поднять с текущих Next 14/React 18). Так компоненты TailAdmin переносятся 1:1. |
| Данные | **Только RTK Query** (`apps/web/src/store/api/*`). Никаких `fetch`/`axios` в компонентах (CLAUDE.md §4). |
| Auth | Passwordless **OTP по EMAIL** (без затрат на SMS). access-токен в памяти + refresh в `localStorage`, авто-refresh на `401`, guard по роли `ADMIN`. httpOnly-cookie — hardening позже. |
| Routing | Route group `(admin)` с layout TailAdmin, всё под `/admin/*`. Логин — `/admin/login`. |
| i18n | Админка **RU-only** для MVP (внутренний инструмент). Полный uz/ru/en — `ADMIN-17`. |
| Бэкенд | NestJS `apps/api`, контракты в `docs/API.md`. Все ответы — snake_case, пагинация `{ data, meta: { page, limit, total } }`. |

**ВАЖНО — лицензия:** НЕ использовать NextAdmin (`nextadmin.co`) — у free-репо нет
файла LICENSE (юридически all-rights-reserved), а платные тарифы запрещают SaaS.
Используем TailAdmin (честная MIT).

## 1. Как запускать задачу в новой сессии

1. Открой сессию в `/Users/founder/Desktop/2026/avino`.
2. Скажи: `начинай ADMIN-XX` (можно с `ultrathink`).
3. Агент читает этот файл (раздел 0 + карточку задачи) и `docs/API.md`.
4. По завершении: GREEN-проверки → PR → отметить `DONE` в этом файле.

**Проверки (gates) для web-задач:**
```bash
pnpm --filter @avino/web lint
pnpm --filter @avino/web build
pnpm --filter @avino/web dev   # ручная проверка на http://localhost:3000/admin
```
> Прим.: `pnpm --filter @avino/api build` падает на pre-existing ошибке
> `@types/express` в `chat/chat.controller.ts` (есть и на `main`) — к web-задачам
> отношения не имеет, использовать api `test`+`lint` как gates для бэкенда.

## 2. Текущее состояние `apps/web`

Уже есть (минимальный каркас): Next 14 App Router, RTK Query `baseApi`
(`src/store/api/baseApi.ts`, tagTypes включают `Admin`/`User`/`Listing`/…),
`store.ts`, `StoreProvider.tsx`, `layout.tsx`, `page.tsx`. Нет: Tailwind, auth,
admin-эндпоинтов, страниц.

## 3. Маппинг на roadmap

`ADMIN-01..06` ⇒ закрывают часть **M14** (TASK-140/141/142: web foundation, RTK
Query layer). `ADMIN-07..15` ⇒ **M16** (TASK-160/161/162: web admin features),
но мельче. По завершении блоков синхронизировать статусы в `docs/TASKS.md`.

---

## Задачи

### ADMIN-01 — Поднять стек apps/web + Tailwind v4 + дизайн-токены

Status: `DONE` (PR #72) — ADR-0043
Branch: `feat/admin-web-foundation`
Depends: —

Scope:
- Обновить `apps/web/package.json`: `next@^15`, `react@^19`, `react-dom@^19`,
  `@types/react@^19`. Проверить совместимость `@reduxjs/toolkit`/`react-redux`.
- Установить Tailwind v4 (`tailwindcss`, `@tailwindcss/postcss`, `postcss`),
  `postcss.config.js`, глобальный `globals.css` с дизайн-токенами Avino
  (см. `docs/AvinoWebPlan.md` §3 «Дизайн-система»).
- Базовый шрифт, dark-mode стратегия (class).

Acceptance:
- `pnpm --filter @avino/web dev` запускается, Tailwind-классы применяются.
- `lint` + `build` зелёные.

Suggested commit: `chore(web): upgrade to next15/react19 + tailwind v4`

---

### ADMIN-02 — Вендор TailAdmin: layout-оболочка админки

Status: `DONE` (PR #73) — ADR-0044
Branch: `feat/admin-web-shell`
Depends: `ADMIN-01`

Scope:
- Перенести из TailAdmin (MIT) базовый shell: `Sidebar`, `Header`, контейнер
  контента, переключатель темы. Адаптировать бренд под Avino, навигацию — под
  будущие разделы (Dashboard, Модерация, Жалобы, Пользователи, Промо, Логи).
- Route group `src/app/(admin)/admin/layout.tsx` + заглушка `admin/page.tsx`.
- Создать `apps/web/NOTICE` с MIT-атрибуцией TailAdmin.

Acceptance:
- `/admin` рендерит TailAdmin-оболочку (sidebar + header + dark mode).
- `NOTICE` присутствует. `lint`+`build` зелёные.

Suggested commit: `feat(web): add TailAdmin admin shell layout`

---

### ADMIN-03 — authApi (RTK Query)

Status: `DONE` (PR #74)
Branch: `feat/admin-web-auth-api`
Depends: `ADMIN-01`

Backend (API.md §3 — авторитетный источник, контракт уточнён по нему):
- `POST /auth/otp/request` `{ channel, destination }` → `{ request_id, channel, expires_in, resend_after }`
- `POST /auth/otp/verify` `{ channel, destination, code }` → `{ access_token, refresh_token, token_type, expires_in, user }`
- `POST /auth/refresh` `{ refresh_token }` → новая пара токенов
- `POST /auth/logout` `{ refresh_token }` → 204
- `GET /auth/me` → user + profile + roles

> Прим.: карточка ранее ссылалась на «API.md §5» и тело verify `{ request_id, code }`.
> Auth-контракты в API.md живут в **§3**, а verify принимает `{ channel, destination, code }`.
> Реализовано по API.md (CLAUDE.md §2 — API.md авторитетна при расхождении).

Scope:
- `src/store/api/authApi.ts` через `baseApi.injectEndpoints`: `requestOtp`,
  `verifyOtp`, `refresh`, `logout`, `getMe`. Типы запросов/ответов.

Acceptance: эндпоинты типизированы, проект собирается, хуки экспортируются.

Suggested commit: `feat(web): add authApi RTK Query slice`

---

### ADMIN-04 — baseQuery: Bearer + авто-refresh + хранение токенов

Status: `DONE` (PR #75)
Branch: `feat/admin-web-auth-basequery`
Depends: `ADMIN-03`
ADR: `docs/adr/ADR-0045-web-auth-basequery-token-storage.md`

Scope:
- `baseQueryWithReauth`: подставлять `Authorization: Bearer <access>`; на `401`
  один раз дёрнуть `/auth/refresh`, обновить токены, повторить запрос; при
  неудаче — разлогин.
- Хранилище токенов: access — в памяти (Redux slice `authSlice`), refresh — в
  `localStorage`. Инициализация при загрузке.
- Подключить `authSlice` в `store.ts`.

Acceptance: защищённый запрос с истёкшим access автоматически восстанавливается
через refresh; при невалидном refresh — состояние «разлогинен».

Suggested commit: `feat(web): add Bearer auth + auto-refresh baseQuery`

---

### ADMIN-05 — Страница логина админа (OTP EMAIL)

Status: `DONE` (PR #76) — ADR-0046
Branch: `feat/admin-web-login`
Depends: `ADMIN-02`, `ADMIN-04`
ADR: `docs/adr/ADR-0046-web-admin-otp-login-page.md`

Scope:
- `src/app/(admin)/admin/login/page.tsx`: шаг 1 — ввод email → `requestOtp`;
  шаг 2 — ввод кода → `verifyOtp` → сохранить токены → редирект на `/admin`.
- Таймер resend (`resend_after`), обработка ошибок `OTP_INVALID`/`OTP_EXPIRED`/
  `OTP_ATTEMPTS_EXCEEDED`/`RATE_LIMITED` (API.md §17).
- Стиль — TailAdmin auth-форма.

Acceptance: реальный логин админа end-to-end против запущенного `apps/api`.

> Реализовано (PR pending): двухшаговая форма EMAIL-OTP, таймер resend из
> `resend_after`, мапинг кодов ошибок §17 (`messageForCode`), хелпер
> `store/api/apiError.ts`. Логин лежит в группе `(admin)`, но рендерится
> полноэкранным через новый `layout/ConditionalShell.tsx` (ADR-0046) — туда же
> встанет гард ADMIN-06. Gates `lint`+`build` зелёные; `/admin/login` отдаёт 200
> и форму без оболочки, `/admin` сохраняет sidebar/header.
> **Live end-to-end против `apps/api` в этой сессии не прогнан**: backend не
> стартует из-за pre-existing проблем, не связанных с задачей (отсутствует
> `@types/express` — `chat.controller.ts`, + ESM-резолюция в `packages/shared`).
> Контракт эндпоинтов (`/auth/otp/request|verify`) уже подтверждён live в
> ADMIN-03. Нужен ручной прогон формы при поднятом api.

Suggested commit: `feat(web): add admin OTP login page`

---

### ADMIN-06 — Guard роли ADMIN

Status: `REVIEW` (PR #79) — ADR-0049
Branch: `feat/admin-web-role-guard`
Depends: `ADMIN-05`
ADR: `docs/adr/ADR-0049-web-admin-role-guard.md`

Scope:
- В layout `(admin)`: при заходе дёрнуть `getMe`; если нет токена → `/admin/login`;
  если есть, но в `roles` нет `ADMIN` → экран «нет доступа» (403).
- Кнопка logout в Header (`logout` + очистка токенов).

Acceptance: не-админ не попадает в админку; logout работает.

> Реализовано: `RoleGuard` (новый) вешается в `ConditionalShell` только на
> защищённые маршруты — логин остаётся вне гарда (нет редирект-петли). Гард:
> флаг `hydrated` + `selectAuthInitialized` гейтят первый рендер (убирают
> hydration mismatch), нет токенов → `/admin/login`, есть → `GET /auth/me`
> (переиспользует `useGetMeQuery` + авто-refresh ADMIN-04), без роли `ADMIN` →
> экран 403, ошибка не-401 → экран «Повторить/Выйти». Выход вынесен в хук
> `useLogout` (`POST /auth/logout` + `logOut` + редирект), используется кнопкой
> в шапке (`UserMenu` заменил статичную заглушку, показывает реальные имя/email
> из `/auth/me`) и экранами 403/ошибки. Gates `lint`+`build` зелёные.
> **Live end-to-end против `apps/api` не прогнан** — backend не стартует из-за
> pre-existing проблем (нет `@types/express` в `chat.controller.ts` + ESM в
> `packages/shared`), к ADMIN-06 отношения не имеют. Нужен ручной прогон при
> поднятом api: не-админ → 403, logout → `/admin/login`.

Suggested commit: `feat(web): add ADMIN role guard and logout`

---

### ADMIN-07 — adminApi база + общие типы

Status: `TODO`
Branch: `feat/admin-web-admin-api`
Depends: `ADMIN-04`

Scope:
- `src/store/api/adminApi.ts` (через `injectEndpoints`) + общие типы:
  `Paginated<T>` (`{ data, meta }`), переиспользуемые snake_case DTO листинга/
  пользователя/промо/лога (по `docs/API.md`).
- Хелперы пагинации/query-string, общие табличные типы для UI.

Acceptance: база и типы готовы, используются следующими задачами.

Suggested commit: `feat(web): add adminApi base and shared types`

---

### ADMIN-08 — Модерация: очередь листингов

Status: `TODO`
Branch: `feat/admin-web-moderation-list`
Depends: `ADMIN-06`, `ADMIN-07`

Backend (API.md §16): `GET /admin/listings?status&property_type&transaction_type&q&page&limit`.

Scope:
- `adminApi`: `listAdminListings`. Страница `/admin/listings` — таблица
  TailAdmin: фильтры (status=NEW по умолчанию, тип/сделка, поиск `q`),
  пагинация, ссылка на карточку.

Acceptance: очередь грузится, фильтры/пагинация работают против бэкенда.

Suggested commit: `feat(web): add admin moderation queue page`

---

### ADMIN-09 — Модерация: карточка + действия + история

Status: `TODO`
Branch: `feat/admin-web-moderation-detail`
Depends: `ADMIN-08`

Backend (API.md §16):
- `PATCH /admin/listings/:id/status` `{ action: APPROVE|SEND_TO_DRAFT|REJECT|DELETE, reason }`
- `GET /admin/listings/:id/moderation-logs`

Scope:
- Страница `/admin/listings/[id]`: данные листинга, кнопки действий (с reason
  для REJECT), таблица истории модерации. Инвалидация кэша списка после действия.
- Обработка `422 INVALID_STATUS_TRANSITION`, `403`, `404`.

Acceptance: approve/reject/draft/delete меняют статус, история обновляется.

Suggested commit: `feat(web): add admin moderation detail and actions`

---

### ADMIN-10 — Жалобы

Status: `TODO`
Branch: `feat/admin-web-complaints`
Depends: `ADMIN-07`

Backend (API.md §16):
- `GET /admin/complaints?status&listing_id&page&limit`
- `PATCH /admin/complaints/:id` `{ status: NEW|IN_REVIEW|RESOLVED|REJECTED }`

Scope: страница `/admin/complaints` — список с фильтром по статусу + смена статуса.

Acceptance: список и обработка жалоб работают.

Suggested commit: `feat(web): add admin complaints page`

---

### ADMIN-11 — Пользователи: список + карточка

Status: `TODO`
Branch: `feat/admin-web-users-list`
Depends: `ADMIN-07`

Backend (API.md §6):
- `GET /admin/users?status&role&q&page&limit`
- `GET /admin/users/:id`
- `GET /roles` (справочник для фильтра/назначения)

Scope: `/admin/users` — таблица (фильтры status/role/q, пагинация);
`/admin/users/[id]` — карточка (профиль, роли, статус, таймстемпы).

Acceptance: список и карточка грузятся, фильтры работают.

Suggested commit: `feat(web): add admin users list and detail`

---

### ADMIN-12 — Пользователи: статус + роли

Status: `TODO`
Branch: `feat/admin-web-users-actions`
Depends: `ADMIN-11`

Backend (API.md §6):
- `PATCH /admin/users/:id` `{ status: ACTIVE|BLOCKED|DELETED, reason }`
- `POST /admin/users/:id/roles` `{ role }`
- `DELETE /admin/users/:id/roles/:role` → 204

Scope: в карточке — смена статуса (блок/удаление с reason), назначение/снятие
ролей (выбор из `/roles`). Обработка `409 ROLE_ALREADY_GRANTED`, `404`, `400`.

Acceptance: блок/удаление и управление ролями работают, аудит на бэкенде пишется.

Suggested commit: `feat(web): add admin user status and role management`

---

### ADMIN-13 — Промо VIP/TOP

Status: `TODO`
Branch: `feat/admin-web-promotions`
Depends: `ADMIN-09`

Backend (API.md §15 — сверить точные маршруты cancel/extend):
- `GET /admin/listings/:id/promotions` — история
- `POST /admin/listings/:id/promotions` (заголовок `Idempotency-Key`) — активация
- cancel/extend существующей промо (TASK-122) — уточнить роуты в API.md §15

Scope: в карточке листинга (или `/admin/promotions`) — активация VIP/TOP
(period_days ∈ {7,14,30}), история, cancel/extend. Обработка
`409 ACTIVE_PROMOTION_EXISTS`, `422 INVALID_PERIOD`, `422 PROMOTION_NOT_ACTIVE`.

Acceptance: активация/cancel/extend работают, история обновляется.

Suggested commit: `feat(web): add admin promotions management`

---

### ADMIN-14 — Логи (4 вкладки)

Status: `TODO`
Branch: `feat/admin-web-logs`
Depends: `ADMIN-07`

Backend (API.md §16, TASK-131):
- `GET /admin/audit-logs?action&actor_id&entity_type&entity_id&page&limit`
- `GET /admin/moderation-logs?listing_id&moderator_id&action&page&limit`
- `GET /admin/promotion-logs?listing_id&admin_id&action&page&limit`
- `GET /admin/notification-logs?user_id&type&channel&status&page&limit`

Scope: `/admin/logs` с 4 вкладками, в каждой — таблица + фильтры + пагинация.

Acceptance: все 4 журнала грузятся и фильтруются.

Suggested commit: `feat(web): add admin logs viewer`

---

### ADMIN-15 — Дашборд (счётчики)

Status: `TODO`
Branch: `feat/admin-web-dashboard`
Depends: `ADMIN-08`, `ADMIN-11`

Scope: `/admin` (главная) — карточки-метрики TailAdmin. Источник для MVP —
`meta.total` из существующих списков (листинги NEW, жалобы NEW, пользователи,
активные промо). Без нового бэкенд-эндпоинта.

Acceptance: дашборд показывает живые счётчики.

Suggested commit: `feat(web): add admin dashboard overview`

> Backlog-идея: отдельный `GET /admin/stats` на бэкенде, если счётчиков станет
> много (завести как новый бэкенд-таск при необходимости).

---

### ADMIN-16 — Полиш (skeleton/error/empty + toasts)

Status: `TODO`
Branch: `feat/admin-web-polish`
Depends: `ADMIN-08..15`

Scope: единые loading-skeletons для таблиц, error-states, empty-states,
toast-уведомления об успехе/ошибке мутаций.

Acceptance: единый UX состояний по всем страницам админки.

Suggested commit: `feat(web): add admin loading/error/empty states`

---

### ADMIN-17 — i18n админки (uz/ru/en)

Status: `TODO`
Branch: `feat/admin-web-i18n`
Depends: `ADMIN-08..15`

Scope: вынести строки админки в i18n (CLAUDE.md §3: `t("key", lang)`), переключатель
языка. До этой задачи админка RU-only (осознанно, MVP).

Acceptance: переключение uz/ru/en, нет хардкод-строк в UI админки.

Suggested commit: `feat(web): add admin panel i18n`

---

## Прогресс

| Задача | Статус | PR |
|---|---|---|
| ADMIN-01 | DONE | #72 |
| ADMIN-02 | DONE | #73 |
| ADMIN-03 | DONE | #74 |
| ADMIN-04 | DONE | #75 |
| ADMIN-05 | TODO | — |
| ADMIN-06 | REVIEW | #79 |
| ADMIN-07 | TODO | — |
| ADMIN-08 | TODO | — |
| ADMIN-09 | TODO | — |
| ADMIN-10 | TODO | — |
| ADMIN-11 | TODO | — |
| ADMIN-12 | TODO | — |
| ADMIN-13 | TODO | — |
| ADMIN-14 | TODO | — |
| ADMIN-15 | TODO | — |
| ADMIN-16 | TODO | — |
| ADMIN-17 | TODO | — |
