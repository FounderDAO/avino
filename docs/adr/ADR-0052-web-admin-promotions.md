# ADR-0052 — Web admin: управление промо VIP/TOP в карточке листинга

## Status

Accepted

## Date

2026-06-06

## Context

ADMIN-13 закрывает фронтенд ручного управления промо VIP/TOP в админ-панели
(`apps/web`). Бэкенд готов (TASK-120/121/122, API.md §15): активация по листингу
(`POST /admin/listings/:id/promotions`, идемпотентно по `Idempotency-Key`),
история ledger (`GET .../promotions`) и управление активной промо по её `id`
(`PATCH /admin/listing-promotions/:id/cancel|extend`). Online-оплат в MVP нет —
`payment_status = NOT_REQUIRED`, активацию делает админ вручную; цена берётся из
статического каталога планов (тир × период × цена).

Нужно решить, **где** живёт управление промо, **как** клиент обеспечивает
идемпотентность активации и **как** маппятся доменные ошибки (`409
ACTIVE_PROMOTION_EXISTS`, `422 INVALID_PERIOD`, `422 PROMOTION_NOT_ACTIVE`).

## Decision

1. **Размещение — в карточке листинга** (`/admin/listings/[id]`), а не отдельной
   страницей `/admin/promotions`. Промо неотделимо от листинга, карточка уже
   зависимость (`Depends: ADMIN-09`), отдельный listing-picker не нужен. Панель
   вынесена в переиспользуемый компонент `components/admin/PromotionsPanel.tsx`,
   чтобы не раздувать страницу.

2. **API-слой — отдельный RTK Query-слайс** `store/api/adminPromotionsApi.ts`
   (инъекция в общий `adminApi`, CLAUDE.md §4). Асимметрия роутов сохранена как
   на бэкенде: активация/история адресуются по листингу, cancel/extend — по `id`
   промо-строки. Все мутации `invalidatesTags: ['Admin']` → история и read-cache
   карточки (`promotion_*`) перечитываются после действия.

3. **Идемпотентность активации — свежий `Idempotency-Key` (UUID) на попытку**,
   передаётся заголовком в мутации (`crypto.randomUUID()`). Защита от двойного
   клика/ретрая: повтор с тем же ключом возвращает уже созданную промо, не
   создавая дубль (live-verified: повтор → тот же `id`, 201).

4. **Авто-замещение, а не блокировка.** Бэкенд при активации закрывает
   предыдущую `ACTIVE`-промо в той же транзакции, поэтому UI всегда показывает
   форму активации (с пометкой «Активация заменит текущую активную промо», если
   активная есть), а не прячет её за `409`. `409 ACTIVE_PROMOTION_EXISTS` всё
   равно замаплен как fallback.

5. **Ошибки — по стабильному `error.code`** (а не `message`), RU-сообщения в
   `lib/promotions.ts` (`promotionErrorMessage`). Каталог цен зеркалится в
   `lib/promotions.ts` только для превью стоимости в форме; source of truth —
   `promotions.catalog.ts` на бэкенде.

Админка остаётся RU-only (i18n — ADMIN-17).

## Consequences

Positive:
- Управление промо в одном месте с модерацией листинга; нет лишней навигации.
- Идемпотентная активация устойчива к двойным сабмитам.
- Контракт выверен live против бэкенда (активация/идемпотентность/extend/cancel +
  оба 422 и общий flow).
- Слайс/хелперы переиспользуемы для будущего журнала промо (ADMIN-14).

Negative / trade-offs:
- Каталог цен дублируется на клиенте (превью). При смене цен нужно править оба
  места; помечено в коде как зеркало (бэкенд — единственный SoT активации).
- Активная промо вычисляется на клиенте из истории (`status === 'ACTIVE'`),
  завязка на корректность ledger (одна `ACTIVE` на листинг — гарантирует БД).

## Related files

- `apps/web/src/components/admin/PromotionsPanel.tsx`
- `apps/web/src/store/api/adminPromotionsApi.ts`
- `apps/web/src/store/api/adminTypes.ts` (промо-DTO: запросы + nullable даты)
- `apps/web/src/lib/promotions.ts`
- `apps/web/src/app/(admin)/admin/listings/[id]/page.tsx`

## Related task

- ADMIN-13 (TASK_ADMIN_PANEL.md), часть M16. Бэкенд — TASK-120/121/122, ADR-0004.
