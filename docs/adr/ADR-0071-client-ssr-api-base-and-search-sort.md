# ADR-0071 — Client SSR использует внутренний API-base; sort приведён к контракту §9

## Status

Accepted

## Date

2026-06-14

## Context

После перевода публичного портала (`apps/client`) с мок-данных на реальный API
в Docker перестали наполняться данными серверные (SSR) секции: обе карусели на
главной (`getFeaturedListings`, `searchListings({ tx: 'RENT' })`) и страница
`/search` («Купить»/«Аренда»), показывавшая «Ничего не найдено».

Две независимые причины (вторая всплыла после фикса первой):

1. **SSR не достаёт API внутри Docker.** `apps/client/src/lib/api/{listings,geo}.ts`
   брали базовый URL из `NEXT_PUBLIC_API_BASE_URL`. Эта переменная инлайнится в
   бандл на сборке под БРАУЗЕР и указывает на host-порт api (`http://localhost:4000`).
   Те же модули вызываются из server components (SSR), и внутри контейнера `client`
   `localhost:4000` — это сам контейнер, а не сервис `api` → `ECONNREFUSED` →
   `safeSearch`/`getDistricts` молча деградируют в пустой список.

2. **Невалидный `sort` → 400.** Клиент слал `sort=promotion_priority_desc`
   (в `getFeaturedListings` и `toApiSort('promotion')`) и `area_asc`, тогда как
   `GET /api/v1/search` по контракту §9 принимает только
   `date_desc | price_asc | price_desc | area_desc` (promotion-тир всегда первичный
   ключ ORDER BY). Строгая валидация (`@IsIn`, `forbidNonWhitelisted`) → 400 →
   снова деградация в пустую выдачу.

## Decision

1. **Серверный API-base отделён от браузерного.** Добавлен резолвер
   `apps/client/src/lib/api/base.ts → resolveApiBase()` с приоритетом:
   `API_INTERNAL_URL` (рантайм, имя сервиса Docker) → `NEXT_PUBLIC_API_BASE_URL`
   (браузер) → `http://localhost:4000` (host-dev). Резолвится при каждом вызове
   (читает рантайм-env у `next start`, а не значение момента импорта). `listings.ts`
   и `geo.ts` зовут его в каждом fetch. Браузерный путь (RTK Query
   `store/api/baseQuery.ts`) не тронут — он продолжает читать `NEXT_PUBLIC_*`.
   В `docker-compose.yml` сервису `client` добавлен рантайм
   `API_INTERNAL_URL: http://api:4000`.

2. **`sort` приведён к §9.** `toApiSort` отправляет только значения из
   `date_desc | price_asc | price_desc | area_desc`; UI-режим `promotion` =
   серверный дефолт → `sort` не отправляется; `area_asc` и любое иное значение
   опускаются (иначе строгая валидация → 400). `getFeaturedListings` больше не шлёт
   `sort` вовсе (промо-приоритет и так дефолтный ORDER BY).

`apps/web` (админка) правки не требует: данные грузятся только клиентским
RTK Query (`localhost:4000`), серверных fetch-ей у неё нет.

## Consequences

Positive:
- SSR-секции (карусели главной, `/search`, справочник районов) наполняются в Docker;
- браузерный и серверный базовые URL разведены явно и корректно для каждой среды;
- клиент строго соответствует контракту поиска §9 — никаких 400 от валидного UI.

Negative / trade-offs:
- появляется ещё одна env-переменная (`API_INTERNAL_URL`), которую нужно держать в
  compose/деплое для серверных fetch-ей внутри сети Docker;
- UI-сортировка `area_asc` молча игнорируется до появления её на бэке (§9 знает
  только `area_desc`).

## Related files

- apps/client/src/lib/api/base.ts (`resolveApiBase`)
- apps/client/src/lib/api/listings.ts (`toApiSort`, `getFeaturedListings`)
- apps/client/src/lib/api/geo.ts
- apps/client/src/lib/api/base.test.ts, listings.test.ts
- docker-compose.yml (`client.environment.API_INTERNAL_URL`)

## Related task

- Восстановление наполнения главной (карусели) и `/search` в Docker (SSR API-base + sort §9)
- Связано с ADR-0067 (search-text-query), ADR-0068 (geo-districts), §9 API.md
