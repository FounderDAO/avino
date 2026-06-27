# ADR-0112 — Эндпоинт распределения цены `GET /search/price-distribution`

## Status

Accepted

## Date

2026-06-27

## Context

Редизайн фильтра цены под Zillow (вкладки, слайдер с двумя ручками, гистограмма
распределения, поля Мин/Макс, «Применить») требует данных о распределении цен —
их у фронта нет: клиент видит только текущую страницу keyset-выдачи, а не всю
популяцию. В Фазе 1 Zillow-фильтров гистограмма была отложена именно из-за
отсутствия endpoint распределения. Нужно решить форму этих данных.

## Decision

Добавлен публичный `GET /api/v1/search/price-distribution`.

- **Параметры:** `currency` (`UZS|USD`) + `transaction_type` (`SALE|RENT`), **оба
  обязательны** (отсутствие/мусор → 400). Распределение считается в пределах одной
  валюты и одной сделки — масштаб цен у них принципиально разный, FX не применяем
  (как и в фильтрации цены, API.md §9).
- **Глобально, без контекста (v1):** учитываются только `status = 'ACTIVE'`; район/
  комнаты/полигон и прочие фильтры НЕ применяются. Проще, кэшируемо, визуально
  достаточно. Контекстная гистограмма — возможная будущая фаза.
- **Форма ответа** (snake_case, как домен поиска): `{ currency, transaction_type,
  min: 0, max, buckets: [{from,to,count}]×30, overflow_count }`. Домен `[0, max]`,
  где `max = niceCeil(percentile_cont(0.99))` — p99-потолок, округлённый вверх до
  «красивого» числа (1/2/2.5/5/10 × 10ᵏ); всё дороже max попадает в `overflow_count`
  (хвост `width_bucket = N+1`, аналог Zillow «$10M+»).
- **Реализация:** две raw-SQL агрегации (`percentile_cont` для потолка + `width_bucket`
  для 30 равных корзин), бинды через `Prisma.sql`. Пустая выборка / `max ≤ 0` →
  `{min:0, max:0, buckets:[], overflow_count:0}` (фронт деградирует к фолбэк-домену).
- Response-DTO — в `*.dto.ts` (иначе swagger-плагин не задокументирует); путь
  попадает в публичный документ по существующему префиксу `/api/v1/search`.

Причина отдельного endpoint (а не агрегации на клиенте): клиент не располагает
полной популяцией цен, а считать распределение на каждой выдаче дорого.

## Consequences

Positive:
- Гистограмма получает реальные данные; инвариант «Σ count бакетов + overflow =
  числу видимых (currency, tx)» строгий (покрыт unit + недеструктивным int-spec).
- Non-breaking: новый endpoint, существующие не тронуты.
- Кэшируемо по `(currency, transaction_type)` (короткий TTL — при необходимости).

Negative / trade-offs:
- Глобальная (не контекстная) гистограмма: бары не сужаются под район/комнаты —
  принято для v1 как достаточное приближение.
- Граница `price = max` уходит в overflow (включающая семантика `width_bucket`):
  данных не теряет, инвариант суммы цел; вероятность удара ровно в p99-потолок мала.
- Деплой: смёрженный код селектит распределение — БД должна быть с применёнными
  миграциями (как обычно).

## Related files

- `apps/api/src/search/dto/price-distribution.dto.ts` (+ `.dto.spec.ts`)
- `apps/api/src/search/search.service.ts` (`niceCeil`, `priceDistribution`),
  `search.service.distribution.spec.ts`, `search.service.distribution.int-spec.ts`
- `apps/api/src/search/search.controller.ts`
- `apps/api/openapi.{public,internal}.json`

## Related task

- Zillow-фильтр цены (гистограмма). PR A (API). Spec/plan:
  `docs/superpowers/{specs,plans}/2026-06-27-zillow-price-filter-histogram*`.
- Клиентская часть (Popover + слайдер + гистограмма) — PR B.
