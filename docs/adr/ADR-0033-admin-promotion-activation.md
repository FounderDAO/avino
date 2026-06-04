# ADR-0033 — Admin promotion activation: supersede semantics, idempotency, ADMIN-only

## Status

Accepted

## Date

2026-06-05

## Context

TASK-121 (milestone M12) реализует ручную активацию промо VIP/TOP
(API.md §15, CLAUDE.md §9):

- `POST /api/v1/admin/listings/:id/promotions` — активировать тариф вручную.
- `GET /api/v1/admin/listings/:id/promotions` — история промо листинга (ledger).

Промо-модель уже зафиксирована (ADR-0004, DB_SCHEMA §8): тиры `TOP | VIP`,
периоды `7 | 14 | 30` дней, источник истины — ledger `listing_promotions`,
read-cache на `listings.promotion_*`, online-оплаты в MVP нет
(`payment_status = NOT_REQUIRED`). Каталог цен — статическая константа
(ADR-0032, `PROMOTION_PLANS`). Миграция `20260603170000_add_promotions` уже
создала ledger + два PARTIAL UNIQUE индекса: «одна `ACTIVE` на листинг» и
«не-null `payment_reference` уникален».

Открытые вопросы этой задачи:

1. **Роль доступа.** Acceptance-критерий TASK-121 пишет расплывчато
   («admin/moderator … if approved by role rules»), а API.md §15 явно требует
   **ADMIN**.
2. **Что делать с уже активной промо** при новой активации — заблокировать
   (`409`) или закрыть и заменить (supersede)? API.md допускает оба, но в
   описании POST основное поведение — «закрывает предыдущую активную промо».
3. **Идемпотентность.** API.md §15/§24 объявляет POST идемпотентным по
   `Idempotency-Key`, но cross-cutting инфраструктуры идемпотентности в коде нет.
4. **Уведомление** владельцу при активации.

Решения по монетизации требуют подтверждения Team Lead (CLAUDE.md §2).

## Decision

1. **Доступ — только `ADMIN`.** Следуем API.md §15 (приоритет контракта над
   формулировкой задачи). `MODERATOR` модерирует контент, но не управляет
   платными тирами. Guard'ы: `JwtAuthGuard` + `RolesGuard` + `@Roles(ADMIN)` на
   `AdminPromotionsController`.

2. **Auto-supersede.** Новая активация в одной транзакции переводит предыдущую
   `ACTIVE`-промо в `CANCELLED`, создаёт новую `ACTIVE`, обновляет read-cache на
   `listings` и пишет `promotion_logs` (дельта `old_type/old_expires_at` →
   `new_*`) + `audit_logs(LISTING_PROMOTION_CHANGE)`. Это держит инвариант «одна
   `ACTIVE` на листинг» (PARTIAL UNIQUE) и соответствует TASK-122 «Only one
   ACTIVE promotion remains». Конкурентная гонка за активную строку отдаёт
   `409 ACTIVE_PROMOTION_EXISTS`.

3. **Идемпотентность — лёгкая, через `payment_reference`.** Заголовок
   `Idempotency-Key` сохраняется в колонку `payment_reference` (PARTIAL UNIQUE
   WHERE NOT NULL — заведена ровно под это, ADR-0004). Повтор с тем же ключом
   возвращает уже созданную промо: pre-check перед транзакцией + replay на
   `P2002` в гонке. Генеральная middleware-идемпотентность (для платёжных
   callbacks) откладывается до Phase 1.5; форма ответа от этого не изменится.

4. **Без уведомления при активации.** Контракт POST (API.md §15) перечисляет
   только `promotion_logs` + `audit_logs`. Тип `PROMOTION_ACTIVATED` существует,
   но его рассылка не входит в этот эндпоинт — остаётся на будущее, чтобы не
   расширять контракт.

5. **Валидация периода.** DTO ограничивает `type ∈ {TOP, VIP}` (иначе `400`), а
   `period_days` проверяется по каталогу в сервисе → `422 INVALID_PERIOD`
   (как требует контракт, а не `400`). Цена/валюта берутся из `PROMOTION_PLANS`.
   `user_id` новой промо = инициатор-админ; `payment_status = NOT_REQUIRED`.

## Consequences

Positive:
- Контракт API.md §15 (POST + GET history) реализован без новых таблиц и миграций.
- Инвариант «одна ACTIVE» соблюдён транзакцией и БД-индексом одновременно.
- Идемпотентность переиспользует уже существующую колонку/индекс — без новой
  инфраструктуры; ретраи админки не плодят дубли.
- `promotion_logs` несёт дельту, давая аудит цепочки supersede.

Negative / trade-offs:
- Лёгкая идемпотентность покрывает только активацию, не общий механизм для всех
  retriable POST/callbacks — это отложено (Phase 1.5).
- `409 ACTIVE_PROMOTION_EXISTS` для конкурентной гонки определяется по `P2002`
  без разбора `meta.target`; при не-идемпотентном вызове это корректный исход,
  но различить два partial-unique индекса по коду нельзя — поэтому при наличии
  `Idempotency-Key` сначала пробуем replay, и только иначе отдаём `409`.

## Related files

- apps/api/src/promotions/admin-promotions.service.ts
- apps/api/src/promotions/admin-promotions.service.spec.ts
- apps/api/src/promotions/dto/activate-promotion.dto.ts
- apps/api/src/promotions/promotions.catalog.ts (findPlan)
- apps/api/src/promotions/promotions.module.ts
- apps/api/src/admin/admin-promotions.controller.ts
- apps/api/src/admin/admin.module.ts
- docs/API.md (§15)

## Related task

- TASK-121
