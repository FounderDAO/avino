# ADR-0034 — Admin promotion cancel & extend: ACTIVE-only guard, cache reset, extend anchoring

## Status

Accepted

## Date

2026-06-05

## Context

TASK-122 (milestone M12) добавляет управление уже существующей промо
(API.md §15, CLAUDE.md §9):

- `PATCH /api/v1/admin/listing-promotions/:id/cancel` — отменить промо.
- `PATCH /api/v1/admin/listing-promotions/:id/extend` — продлить промо.

Активация и история уже реализованы (TASK-121, ADR-0033) и адресуются по
**листингу** (`/admin/listings/:id/promotions`). Cancel/extend, в отличие от них,
адресуются по **id самой промо-строки** (`/admin/listing-promotions/:id/...`) —
это отдельное пространство роутов, а значит и отдельный контроллер.

Промо-модель зафиксирована (ADR-0004, DB_SCHEMA §8): тиры `TOP | VIP`, периоды
`7 | 14 | 30`, источник истины — ledger `listing_promotions`, read-cache на
`listings.promotion_*`. Каталог цен статичен (ADR-0032). Действия аудита
`CANCEL_PROMOTION`/`EXTEND_PROMOTION` уже заведены в enum `PromotionAdminAction`.

Открытые вопросы этой задачи:

1. **Допустимый статус.** Над какой промо разрешены cancel/extend? Error-каталог
   (§17) определяет `PROMOTION_NOT_ACTIVE` как «промо не в статусе ACTIVE
   (extend/cancel)», но §15 явно перечисляет этот код только у extend.
2. **Сброс read-cache при отмене.** Чем представлять «нет промо» в кэше
   `listings.promotion_*`.
3. **Якорь продления.** От чего отсчитывать новый `expires_at` — от `now` или от
   текущего `expires_at`.
4. **Что логировать.** Только доменный `promotion_logs` (как буквально пишет §15)
   или также cross-cutting `audit_logs`.

## Decision

1. **Только `ACTIVE`-промо.** Cancel и extend требуют `status = ACTIVE`, иначе
   `422 PROMOTION_NOT_ACTIVE`. Отменять/продлевать `CANCELLED/EXPIRED/REFUNDED`
   нечего. Следуем формулировке error-каталога («extend/cancel»), а не более
   узкому перечислению у POST. Общий guard `requireActivePromotion` для обеих
   операций: `404 NOT_FOUND`, если строки нет; `422 PROMOTION_NOT_ACTIVE` иначе.

2. **Cancel сбрасывает cache в `NORMAL`.** В одной транзакции: `status →
   CANCELLED`, а read-cache на `listings` обнуляется до `promotion_type = NORMAL`,
   `promotion_started_at = null`, `promotion_expires_at = null` (то самое
   представление «нет промо», что и в search/listings). Поскольку отменяемая промо
   была единственной `ACTIVE`, её cache и лежит на листинге — сброс корректен и
   только усиливает инвариант «одна ACTIVE на листинг» (TASK-122 «Only one ACTIVE
   promotion remains»).

3. **Extend отсчитывает от текущего `expires_at`.** `expires_at += period_days`
   именно от старого `expires_at` (а не от `now`): у `ACTIVE`-промо он в будущем,
   значит это продление, а не рестарт. На случай рассинхрона данных
   подстраховываемся `now` (берём `max`-смысл через `expiresAt ?? now`), чтобы не
   уехать в прошлое. `period_days` валидируется по каталогу тира промо
   (`findPlan`) → `422 INVALID_PERIOD`, симметрично активации. Тир при продлении не
   меняется; read-cache синхронизируется только по дате.

4. **Пишем и `promotion_logs`, и `audit_logs`.** §15 у cancel/extend называет
   только `promotion_logs(CANCEL_PROMOTION|EXTEND_PROMOTION)` (с дельтой
   `old_type/old_expires_at → new`, плюс `reason` у cancel). Дополнительно пишем
   `audit_logs(LISTING_PROMOTION_CHANGE)` — как и активация (ADR-0033 п.2): это
   cross-cutting журнал админ-действий безопасности (ADR-0004), он не меняет форму
   ответа API, а лишь поддерживает полноту аудита платных операций.

## Consequences

Positive:
- Контракт API.md §15 (cancel + extend) реализован без новых таблиц и миграций —
  переиспользуются ledger, read-cache и enum-действия.
- Инвариант «одна ACTIVE на листинг» соблюдён: cancel выводит строку из
  ACTIVE-множества, extend не создаёт новых строк.
- Единый guard `requireActivePromotion` устраняет дублирование 404/422 между
  cancel и extend.
- Полный аудит платных операций: доменная дельта в `promotion_logs` +
  cross-cutting запись в `audit_logs`, согласовано с активацией.

Negative / trade-offs:
- Cancel требует `ACTIVE`: повторный cancel уже отменённой промо вернёт
  `422 PROMOTION_NOT_ACTIVE`, а не станет идемпотентным no-op. Для админ-UI это
  приемлемо (явный сигнал, что состояние уже изменилось).
- Extend «жёстко» добавляет период к `expires_at`; перенос на конкретную дату или
  сокращение срока контрактом не предусмотрены и в скоуп не входят.
- Гонка двух параллельных cancel/extend разрешается на уровне «последний
  выигрывает» (pre-check + update), без conditional-update по статусу — достаточно
  для редких ручных админ-действий; усиление до `updateMany WHERE status=ACTIVE`
  отложено как преждевременное.

## Related files

- apps/api/src/promotions/admin-promotions.service.ts (cancel, extend, requireActivePromotion)
- apps/api/src/promotions/admin-promotions.service.spec.ts
- apps/api/src/promotions/dto/cancel-promotion.dto.ts
- apps/api/src/promotions/dto/extend-promotion.dto.ts
- apps/api/src/promotions/promotions.catalog.ts (findPlan)
- apps/api/src/admin/admin-listing-promotions.controller.ts
- apps/api/src/admin/admin.module.ts
- docs/API.md (§15)

## Related task

- TASK-122
