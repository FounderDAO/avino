# ADR-0101 — Live-данные дашборда админки + обложки в админ-списке

## Status

Accepted

## Date

2026-06-22

## Context

Дашборд `/admin` и таблица объявлений админки частично работали на мок-данных:

- **Графики** дашборда («Объявления за год», «Покупка / Аренда», «Объявления по
  районам») и лента «Последних действий» брались из `apps/web/src/lib/mock`
  (статичные массивы) — у бэкенда не было эндпоинта с историческими рядами и
  агрегатами.
- **Бейдж счётчика модерации** в сайдбаре показывал `ADMIN.moderation.length`
  (мок), а не реальное число листингов в очереди.
- **Главные фото** в админ-таблице и в очереди модерации на дашборде всегда были
  статичным плейсхолдером `FALLBACK_PHOTO`: `GET /admin/listings` отдавал
  компактную строку без media.
- **Пагинация** админ-таблицы показывала только номер текущей страницы со
  стрелками — не было видно общего числа страниц.

KPI-карточки (`GET /admin/stats`) и сама очередь модерации
(`GET /admin/listings?status=NEW`) уже были на живых данных.

## Decision

1. **Обложка в админ-списке.** В `GET /api/v1/admin/listings` добавлено optional
   response field `photo_url` (non-breaking, §14): первое media по `sort_order`,
   URL генерируется sign-on-read (ADR-0086) из `storage_key` (или thumbnail).
   `ModerationService` получает `UploadsService` (через `UploadsModule`),
   `toListItem` стал async. Клиентский адаптер `rowToAdminListing` берёт
   `photo_url ?? FALLBACK_PHOTO`.

2. **Новый эндпоинт аналитики.** Добавлен `GET /api/v1/admin/analytics`
   (MODERATOR/ADMIN) → `{ listings_over_time, buy_rent, by_district,
   recent_activity }`. Вынесен в отдельный `AdminAnalyticsService`/Controller,
   а не в `AdminStatsService`: счётчики stats лёгкие и инвалидируются после
   каждой админ-мутации, а агрегаты графиков тяжелее (groupBy/`$queryRaw`) и не
   нуждаются в перечитывании на каждое действие. Помесячный ряд строится
   `generate_series` (12 бакетов, включая нулевые месяцы); топ-6 районов —
   `groupBy` + джойн имён из справочника; лента — последние 6 записей
   `moderation_logs`. Везде исключён `DELETED`.

3. **Живой бейдж модерации.** Сайдбар берёт счётчик из `GET /admin/stats`
   (`listings_new`) — тот же источник, что и KPI «На проверке».

4. **Пагинация.** Админ-таблица показывает оконный список номеров страниц с
   многоточием (первая/последняя + текущая ±1) и подпись «стр. X из N» через
   уже существующий хелпер `totalPages`.

## Consequences

Positive:
- Дашборд и таблица отражают реальное состояние платформы; нет расхождения между
  бейджем «3» и KPI «12».
- `photo_url` переиспользуется и в очереди модерации на дашборде.
- Видно общее число страниц, можно прыгнуть к любой.
- Графики/лента инвалидируются после админ-мутаций (тег `Admin` в RTK Query).

Negative / trade-offs:
- `GET /admin/listings` теперь резолвит presigned-URL обложки на каждую строку
  (N запросов к S3-подписи на страницу из 20; подпись локальная, без сетевого
  вызова — стоимость мала).
- Агрегаты аналитики считаются «на лету» (без кэша/материализации); при росте
  числа листингов имеет смысл кэшировать или материализовать ряды.
- `by_district` показывает только листинги с заполненным `district_id`.

## Related files

- apps/api/src/moderation/moderation.service.ts
- apps/api/src/moderation/moderation.module.ts
- apps/api/src/admin/admin-analytics.service.ts
- apps/api/src/admin/admin-analytics.controller.ts
- apps/api/src/admin/admin.module.ts
- apps/api/openapi.internal.json
- apps/web/src/store/api/adminTypes.ts
- apps/web/src/store/api/adminAnalyticsApi.ts
- apps/web/src/lib/adapters/analytics.ts
- apps/web/src/lib/adapters/listings.ts
- apps/web/src/app/admin/page.tsx
- apps/web/src/app/admin/listings/page.tsx
- apps/web/src/components/admin/Sidebar.tsx
- docs/API.md

## Related task

- TASK-221
