# ADR-0121 — История изменений цены объявления (listing_price_history)

## Status

Accepted

## Date

2026-07-04

## Context

Цена объявления перезаписывалась in-place (`listings.price`) — портал не мог
показать динамику («создано за 10 000 → снижено до 9 800»), которая повышает
доверие покупателя и помогает торговаться (Zillow-style «Price history»).

## Decision

- Append-only таблица `listing_price_history` (id, listing_id, price DECIMAL(14,2),
  currency, created_at; индекс (listing_id, created_at); FK ON DELETE CASCADE) —
  по образцу `moderation_logs`, НЕ JSONB-поле на listings.
- События пишет `ListingsService`: строка при `create()` (цена создания) и при
  `update()`, если итоговая пара (price, currency) реально изменилась — в одной
  транзакции с записью listing.
- Миграция бэкфиллит по строке на существующее объявление (текущая цена,
  дата = created_at объявления).
- Отдача — публично внутри `GET /api/v1/listings/:id`: optional-поле
  `price_history: [{ price, currency, created_at }]`, от старых к новым
  (non-breaking, v1). Отдельного endpoint нет.

## Consequences

Positive:
- Публичная динамика цены на detail; история не теряется и не перезаписывается.
- Расширяемо (кто изменил, аналитика снижения) без смены контракта.

Negative / trade-offs:
- +1 таблица и +1 insert в транзакции create/update.
- Смена валюты делает соседние записи несравнимыми — клиент не считает дельту
  между разными валютами.

## Related files

- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260704000000_add_listing_price_history/migration.sql
- apps/api/src/listings/listings.service.ts

## Related task

- Листинговая история цены (spec docs/superpowers/specs/2026-07-04-listing-price-history-design.md)
