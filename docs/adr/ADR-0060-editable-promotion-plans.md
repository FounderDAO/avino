# ADR-0060 — Editable promotion plans + admin-tunable expiry interval

## Status

Accepted

## Date

2026-06-08

## Context

Тарифная матрица продвижения (тир × период × цена) была статической константой
в коде (`promotions.catalog.ts`, `PROMOTION_PLANS`, ADR-0032). Для MVP это было
сознательным упрощением, но имело две болезненные точки:

- **Цены меняются только деплоем.** Любая корректировка стоимости TOP/VIP
  требует правки кода, PR и релиза — администратор не может менять монетизацию
  самостоятельно.
- **Интервал истечения промо — только из env.** Sweep-джоба
  `expire_listing_promotions` (`promotion_queue`, ADR-0035) брала cron из
  `PROMOTION_EXPIRY_CRON`; смена частоты также требовала деплоя/рестарта.

Промо-модель (ADR-0004, DB_SCHEMA §8) при этом остаётся прежней: тиры `TOP | VIP`
(приоритет `VIP > TOP > NORMAL`), периоды `7 | 14 | 30` дней, ledger
`listing_promotions` как source of truth, активация вручную админом
(`payment_status = NOT_REQUIRED`).

Перенос монетизации в админку — изменение, требующее подтверждения Team Lead
(CLAUDE.md §2); решение согласовано.

## Decision

1. **Каталог планов вынесен в таблицу БД `promotion_plans`** (см. DB_SCHEMA §8)
   взамен константы из ADR-0032. Матрица жёстко зафиксирована 6 строками через
   `UNIQUE (type, period_days)` + `CHECK period_days IN (7,14,30)`; новые тиры/
   периоды не создаются через эти эндпоинты. Сидируется теми же ценами, что были
   в коде (TOP 50000/90000/150000, VIP 120000/210000/350000 UZS). Каждая строка
   имеет `is_active` (default true). `PromotionPlansService` читает каталог из БД.

2. **Публичный `GET /api/v1/promotions/plans`** теперь отдаёт только активные
   планы из БД (форма ответа не изменилась — non-breaking, API.md §15).

3. **Админ-эндпоинты (ADMIN-only, API.md §15):**
   - `GET /api/v1/admin/promotion-plans` — все 6 планов, включая неактивные.
   - `PATCH /api/v1/admin/promotion-plans/:id` — `{ price?, isActive? }`; пишет
     `audit_logs(PROMOTION_PLAN_UPDATE)` (old/new цена + is_active).
   - `GET /api/v1/admin/promotion-settings` → `{ expiryIntervalHours: 6 | 12 }`.
   - `PATCH /api/v1/admin/promotion-settings` — `{ expiryIntervalHours: 6 | 12 }`;
     маппит preset → cron (`0 */6 * * *` / `0 */12 * * *`), персистит в
     `app_settings`, перерегистрирует repeatable BullMQ-джобу в рантайме
     (`PromotionQueue.rescheduleExpiry`); пишет
     `audit_logs(PROMOTION_SETTINGS_UPDATE)`.

4. **Снапшот цены при активации.** Активация/продление берут цену через
   `findPlan` из БД и записывают её в `listing_promotions.price`. Поэтому правка
   цены плана не затрагивает уже активные промо — их стоимость зафиксирована на
   момент активации.

5. **Интервал истечения — в `app_settings`** (ключ `promotion_expiry_cron`,
   seed `0 */12 * * *`). `PromotionExpiryService` читает cron из `app_settings`
   на старте; env `PROMOTION_EXPIRY_CRON` остаётся fallback-дефолтом.

6. **Frontend** — страница `/admin/promotions`: редактируемая таблица тарифов
   (цена + переключатель активности) и селектор интервала (6h/12h),
   локализована RU/UZ/EN, добавлена ссылка в сайдбар.

## Consequences

Positive:
- Админ-самообслуживание по ценам и частоте истечения — без деплоя.
- Полный audit trail на каждое изменение (`PROMOTION_PLAN_UPDATE`,
  `PROMOTION_SETTINGS_UPDATE`).
- Снапшот цены сохраняет стабильность активных промо при правке тарифа.
- Публичный контракт `/promotions/plans` не сломан (только источник данных).

Negative / trade-offs:
- Один дополнительный чтение БД на старте (cron из `app_settings`).
- Env `PROMOTION_EXPIRY_CRON` теперь fallback, а не первичный источник.
- Матрица по-прежнему ограничена 6 строками (по дизайну) — добавление новых
  тиров/периодов потребует миграции, а не записи через эндпоинт.

Supersedes ADR-0032 (static in-code catalog): каталог более не код-константа.

## Related files

- apps/api/prisma/schema.prisma (promotion_plans, app_settings)
- apps/api/src/promotions/promotion-plans.service.ts
- apps/api/src/promotions/promotions.service.ts
- apps/api/src/promotions/promotions.controller.ts
- apps/api/src/admin/admin-promotion-plans.controller.ts
- apps/api/src/admin/admin-promotion-settings.controller.ts
- apps/api/src/promotions/promotion-expiry.service.ts
- apps/api/src/promotions/promotion.queue.ts
- apps/web/src/app/(admin)/admin/promotions
- docs/API.md (§15)
- docs/DB_SCHEMA.md (§8)

## Related task

- Editable promotion tariffs + expiry interval

## Supersedes

- docs/adr/ADR-0032-promotion-plans-static-catalog.md
