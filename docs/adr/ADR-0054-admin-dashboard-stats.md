# ADR-0054 — Дашборд админки: эндпоинт `GET /admin/stats` вместо счётчиков из списков

## Status

Accepted

## Date

2026-06-06

## Context

ADMIN-15 закрывает главную `/admin` — четыре карточки-метрики TailAdmin:
объявления на модерации (NEW), новые жалобы (NEW), пользователи (всего),
активные промо (VIP/TOP).

Карта задачи предлагала собирать счётчики из `meta.total` существующих
page-based списков (`/admin/listings`, `/admin/complaints`, `/admin/users`) и
**не заводить новый бэкенд-эндпоинт**, оставив отдельный `GET /admin/stats` как
backlog-идею.

Проблема обнаружилась на четвёртом счётчике: **глобального списка промо с
`meta.total` не существует**. Промо адресуется только по листингу
(`GET /admin/listings/:id/promotions`, ADR-006/033), а `AdminListingFilters` не
умеет фильтровать листинги по промо. То есть «активные промо» из существующих
списков не вытащить, и подход «meta.total из четырёх списков» в принципе не
покрывает дашборд.

Решение по API-контракту требует подтверждения Team Lead (CLAUDE.md §2/§13).
Team Lead подтвердил расширение scope: завести лёгкий read-only `GET /admin/stats`
сейчас.

## Decision

1. **Один бэкенд-эндпоинт `GET /api/v1/admin/stats`** вместо четырёх list-запросов
   с клиента. Возвращает плоский snake_case-объект
   `{ listings_new, complaints_new, users_total, promotions_active }`.
   Каждое число — `prisma.*.count(...)` по индексированному полю статуса; все
   четыре считаются параллельно (`Promise.all`). Это дешевле и проще, чем четыре
   list-запроса с `limit=1` только ради `meta.total` (и единственно возможный
   способ получить число активных промо).

2. **Доступ — MODERATOR и ADMIN** (`JwtAuthGuard` + `RolesGuard`,
   `@Roles(MODERATOR, ADMIN)`). Дашборд — общая стартовая страница админ-панели
   (как `admin/listings` и `admin/complaints`), а ответ — агрегированные числа
   без PII. Так дашборд не падает с `403` у модератора. Если потребуется строже
   (например, скрыть `users_total`/`promotions_active` от MODERATOR) — сузить до
   `@Roles(ADMIN)` отдельной задачей.

3. **`users_total` — все пользователи без фильтра**, включая `DELETED`: совпадает
   с `meta.total` в `/admin/users` без фильтра (админ видит всё, ADR-0041).
   `promotions_active` берётся из `listing_promotions` (source of truth, ADR-006),
   а не из read-cache на `listings`.

4. **Источник истины статусов** — Prisma-enum'ы (`ListingStatus.NEW`,
   `ComplaintStatus.NEW`, `PromotionStatus.ACTIVE`), а не строковые литералы:
   значения enum — часть контракта (DB_SCHEMA §3).

5. **Frontend — отдельный RTK Query-слайс** `store/api/adminStatsApi.ts`
   (инъекция в общий `adminApi`, CLAUDE.md §4), один `query`-эндпоинт
   `getAdminStats` с `providesTags: ['Admin']`. Общий тег `Admin` означает, что
   после любой админ-мутации (модерация листинга, обработка жалобы, смена статуса
   пользователя, активация/отмена промо) счётчики перечитываются автоматически.

6. **UI: серверная обёртка + клиентский компонент.** `page.tsx` остаётся
   серверным (держит `metadata`) и рендерит клиентский
   `components/admin/DashboardOverview.tsx`, который тянет счётчики хуком. Три
   карточки кликабельны и ведут в свои разделы (`/admin/listings`,
   `/admin/complaints`, `/admin/users`); «активные промо» — без ссылки (промо
   управляются из карточки листинга, отдельной страницы-списка нет). Ссылки ведут
   на разделы без query-фильтра: страницы списков ещё не читают фильтр из URL
   (это полиш ADMIN-16), поэтому `?status=NEW` молча не сработал бы.

7. **Состояния loading/error — точечные** (`…` при загрузке, `—` при ошибке,
   баннер с текстом ошибки). Единый UX состояний по всей админке — ADMIN-16.
   Админка остаётся RU-only (i18n — ADMIN-17).

## Consequences

Positive:
- Дашборд показывает живые счётчики; один запрос вместо четырёх.
- Единственный способ показать число активных промо без list-эндпоинта промо.
- Контракт выверен live против стека: `401` без токена, `200` с ADMIN-токеном,
  значения совпадают с прямым `COUNT` в БД (8/0/2/1) и с `meta.total` списков.
- Тег `Admin` держит счётчики свежими после действий в других разделах.

Negative / trade-offs:
- Появился новый бэкенд-эндпоинт (отклонение от формулировки карты «без нового
  эндпоинта») — осознанно, с подтверждением Team Lead.
- `MODERATOR` видит агрегаты `users_total`/`promotions_active`, хотя списки этих
  сущностей ему недоступны (ADMIN-only). Числа неперсональные; при необходимости
  сузить доступ.
- Карточки ведут на нефильтрованные списки (URL-фильтры — ADMIN-16).
- При росте числа счётчиков `getStats` придётся декомпозировать/кэшировать —
  пока четыре `COUNT` дёшевы.

## Related files

- `apps/api/src/admin/admin-stats.service.ts`
- `apps/api/src/admin/admin-stats.controller.ts`
- `apps/api/src/admin/admin-stats.service.spec.ts`
- `apps/api/src/admin/admin.module.ts`
- `apps/web/src/store/api/adminStatsApi.ts`
- `apps/web/src/store/api/adminTypes.ts`
- `apps/web/src/components/admin/DashboardOverview.tsx`
- `apps/web/src/app/(admin)/admin/page.tsx`
- `docs/API.md` (§16 — `GET /admin/stats`)

## Related task

- ADMIN-15 (TASK_ADMIN_PANEL.md), часть M16. Связанные: ADR-0041 (users),
  ADR-0051 (complaints), ADR-006/033 (промо), ADR-0050 (web admin API base).
