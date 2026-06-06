# ADR-0053 — Web admin: просмотр журналов (4 вкладки) на `/admin/logs`

## Status

Accepted

## Date

2026-06-06

## Context

ADMIN-14 закрывает фронтенд просмотра журналов в админ-панели (`apps/web`).
Бэкенд готов (TASK-131, API.md §16): четыре read-only пагинированных журнала под
`/api/v1/admin/*`, доступ — только ADMIN (RolesGuard):

- `GET /admin/audit-logs?action&actor_id&entity_type&entity_id` — security
  audit-лог (`audit_logs`, ADR-004); `action`/`entity_type` — free-form varchar.
- `GET /admin/moderation-logs?listing_id&moderator_id&action` — глобальный
  журнал модерации (по всем листингам).
- `GET /admin/promotion-logs?listing_id&admin_id&action` — журнал ручных
  админ-операций над промо VIP/TOP.
- `GET /admin/notification-logs?user_id&type&channel&status` — журнал доставки
  уведомлений.

Все четыре — page-based `Paginated<T>` (1-based `page` + `limit`, обязательный
`meta.total`, §4). DTO-типы и фильтр-интерфейсы журналов уже заведены в
`adminTypes.ts` ещё на ADMIN-07. Нужно решить, **как организовать UI** четырёх
разнородных журналов и **как переиспользовать** уже существующие табличные
примитивы и справочники подписей.

## Decision

1. **Одна страница `/admin/logs` с переключателем вкладок**, а не четыре
   отдельных роута. Журналы — родственная админ-поверхность; пункт «Логи» в
   сайдбаре один (заведён ещё в ADMIN-07). Вкладки: Аудит / Модерация / Промо /
   Уведомления (`LOG_TABS` в `lib/logs.ts`).

2. **Рендерится только активная вкладка** (условный рендер по состоянию `tab`),
   а не все четыре одновременно с `display:none`. Так в каждый момент работает
   ровно один RTK-запрос вместо четырёх; при возврате на вкладку RTK Query
   отдаёт данные из кэша. Trade-off: состояние фильтров вкладки сбрасывается при
   переключении (приемлемо для MVP).

3. **API-слой — отдельный RTK Query-слайс** `store/api/adminLogsApi.ts`
   (инъекция в общий `adminApi`, CLAUDE.md §4): четыре `query`-эндпоинта, все
   `providesTags: ['Admin']`. Мутаций нет (журналы read-only), но общий тег
   `Admin` означает, что после любой админ-мутации (модерация/промо/жалоба)
   логи перечитываются — журнал сразу показывает только что записанное действие.
   `toQueryParams` отбрасывает пустые фильтры (forward-compatible, §4).

4. **Каждая вкладка — самостоятельный компонент** в `components/admin/logs/`
   (свои фильтры, пагинация, колонки) поверх общих `DataTable`/`Pagination`
   (ADMIN-08). Общие фильтр-контролы (`FilterSelect`/`TextFilter`/`FilterGrid` +
   `useDebouncedValue`) вынесены в `components/admin/logs/filters.tsx`, чтобы не
   дублировать их в четырёх вкладках; существующие страницы (модерация/жалобы)
   намеренно НЕ трогаем (одна задача — один PR, CLAUDE.md §5).

5. **Подписи enum переиспользуются, новые — в `lib/logs.ts`.**
   `MODERATION_ACTION_LABELS` (из `lib/moderation.ts`) и
   `PROMOTION_TYPE_LABELS`/`PROMOTION_TYPE_BADGE` (из `lib/promotions.ts`)
   используются как есть; добавлены только новые справочники журналов:
   `PROMOTION_ADMIN_ACTION_LABELS`, `NOTIFICATION_TYPE/CHANNEL/STATUS_LABELS` и
   badge статуса уведомления. Фильтры по UUID (actor/entity/listing/moderator/
   admin/user) — текстовые с дебаунсом; фильтры по enum — селекты.

Админка остаётся RU-only (i18n — ADMIN-17).

## Consequences

Positive:
- Все четыре журнала в одном месте; навигация — один пункт сайдбара.
- Один активный запрос за раз; кэш RTK Query гасит повторные переключения.
- Контракт выверен live против стека: все 4 эндпоинта, фильтр по `action`,
  валидация enum (`400`), guard без токена (`401`).
- Фильтр-примитивы вкладок переиспользуемы для будущих списков админки.

Negative / trade-offs:
- Состояние фильтров вкладки не сохраняется при переключении (условный рендер).
  Приемлемо для MVP; при необходимости — поднять состояние в URL/родителя.
- `FilterSelect`/`useDebouncedValue` теперь существуют в двух вариантах (общий
  в `logs/filters.tsx` и локальные копии в страницах модерации/жалоб). Унификация
  — отдельной задачей полиша (ADMIN-16), чтобы не мешать feature и refactor.

## Related files

- `apps/web/src/store/api/adminLogsApi.ts`
- `apps/web/src/lib/logs.ts`
- `apps/web/src/components/admin/logs/filters.tsx`
- `apps/web/src/components/admin/logs/AuditLogsTab.tsx`
- `apps/web/src/components/admin/logs/ModerationLogsTab.tsx`
- `apps/web/src/components/admin/logs/PromotionLogsTab.tsx`
- `apps/web/src/components/admin/logs/NotificationLogsTab.tsx`
- `apps/web/src/app/(admin)/admin/logs/page.tsx`

## Related task

- ADMIN-14 (TASK_ADMIN_PANEL.md), часть M16. Бэкенд — TASK-131 (API.md §16),
  audit_logs — ADR-004.
