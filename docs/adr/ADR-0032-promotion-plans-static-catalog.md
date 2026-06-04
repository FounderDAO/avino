# ADR-0032 — Promotion plans: static in-code catalog for the public endpoint

## Status

Accepted

## Date

2026-06-05

## Context

TASK-120 (milestone M12) добавляет публичный каталог промо-планов
(API.md §15, CLAUDE.md §9):

- `GET /api/v1/promotions/plans` — каталог планов продвижения (тир × период × цена).

Промо-модель уже зафиксирована (ADR-0004, DB_SCHEMA §8): тиры `TOP | VIP`
(приоритет `VIP > TOP > NORMAL`), периоды `7 | 14 | 30` дней, источник истины —
ledger `listing_promotions`, online-оплаты в MVP нет (активация вручную админом,
`payment_status = NOT_REQUIRED`). Миграция `20260603170000_add_promotions` уже
создала `listing_promotions` и `promotion_logs`.

Открытые вопросы для этой задачи:

1. **Где хранить сами планы (цены)?** В схеме нет таблицы `promotion_plans` —
   только ledger активаций и read-cache на `listings`.
2. **Какие цены на 14 дней?** API.md §15 фиксирует только 7 и 30 дней
   (TOP 50k/150k, VIP 120k/350k UZS), а acceptance-критерий требует и 14 дней.

Цены — это монетизация, решение по которой требует подтверждения Team Lead
(CLAUDE.md §2).

## Decision

1. **Каталог планов — статическая константа в коде** (`promotions.catalog.ts`,
   `PROMOTION_PLANS`), а не таблица БД. Для MVP цены фиксированы и редко меняются;
   отдельная таблица/CRUD/админка под планы — преждевременное усложнение.
   Эндпоинт `GET /api/v1/promotions/plans` публичный (как `/search`), без guard:
   каталог цен видят гости, web и mobile.

2. **Ценовая матрица (UZS), согласована с Team Lead:** 7/30 дней — из API.md §15;
   14 дней — середина между ними.

   | Тир | 7 дней | 14 дней | 30 дней |
   |-----|--------|---------|---------|
   | TOP | 50 000 | 90 000  | 150 000 |
   | VIP | 120 000| 210 000 | 350 000 |

   Цены отдаются строками-`Decimal` (`"50000.00"`), чтобы не терять точность на
   клиенте; валюта `UZS` (FX в MVP нет).

3. Сервис не зависит от Prisma/Redis — чистая отдача каталога; возврат —
   поверхностная копия, чтобы внешняя мутация не ломала константу.

## Consequences

Positive:
- Минимальный объём: ни миграций, ни новой таблицы, ни guard.
- Единый источник истины по планам (`PROMOTION_PLANS`) — переиспользуется
  будущими админ-задачами активации/продления (TASK-121/122) для валидации
  периода и подстановки цены.
- Публичный контракт по API.md §15 без изменений схемы.

Negative / trade-offs:
- Изменение цен = деплой кода, а не запись в БД/админку. Приемлемо для MVP;
  при появлении online-оплаты каталог можно вынести в таблицу/конфиг без
  изменения формы ответа.
- 14-дневные цены введены этой задачей (в API.md их не было) — зафиксированы
  здесь как решение.

## Related files

- apps/api/src/promotions/promotions.catalog.ts
- apps/api/src/promotions/promotions.service.ts
- apps/api/src/promotions/promotions.controller.ts
- apps/api/src/promotions/promotions.module.ts
- apps/api/src/promotions/promotions.service.spec.ts
- apps/api/src/promotions/index.ts
- apps/api/src/app.module.ts
- docs/API.md (§15)

## Related task

- TASK-120
