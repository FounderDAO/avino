# Дизайн: история изменения цены объявления (listing price history)

Дата: 2026-07-04
Статус: утверждено Team Lead (чат, 2026-07-04)

## Проблема

Цена объявления перезаписывается in-place (`listings.price`). Нужно хранить историю
изменений (создали за 10 000 → снизили до 9 800 → …) и показывать её публично на
detail-странице (Zillow-style «Price history») — прозрачность для покупателя.

## Решения (утверждены)

- **Видимость:** публичная — блок «История цены» на detail-странице клиента виден всем.
- **Хранение:** отдельная append-only таблица `listing_price_history`
  (по образцу `moderation_logs` / `legal_consents`), НЕ JSONB-поле на listings.

## 1. Схема БД (apps/api)

```prisma
model ListingPriceHistory {
  id        String   @id @default(uuid()) @db.Uuid
  listingId String   @map("listing_id") @db.Uuid
  price     Decimal  @db.Decimal(14, 2)
  currency  Currency
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  listing Listing @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@index([listingId, createdAt])
  @@map("listing_price_history")
}
```

Миграция **бэкфиллит** по одной строке на каждый существующий listing:
текущие `price`/`currency`, `created_at = listings.created_at` — у старых
объявлений история начинается с «цены создания».

## 2. Запись событий (listings.service.ts)

- `create()` — первая строка истории (цена создания) в той же транзакции, что и listing.
- `update()` — если `dto.price`/`dto.currency` переданы И итоговая пара
  (price, currency) реально отличается от текущей — append строки; listing update +
  history insert в одной транзакции. Совпадает — не пишем (нет дублей).
- Других точек изменения цены нет (модерация меняет статус/переводы).

## 3. API-контракт (non-breaking, v1)

`GET /api/v1/listings/:id` (detail) получает optional-поле:

```json
"price_history": [
  { "price": "10000.00", "currency": "USD", "created_at": "2026-07-01T10:00:00Z" },
  { "price": "9800.00",  "currency": "USD", "created_at": "2026-07-03T14:30:00Z" }
]
```

От старых к новым. `price` строкой с 2 дробными (`toFixed(2)`, контракт §7).
Отдельный endpoint не нужен; контракт нейтрален для Flutter.

## 4. Клиент (apps/client)

Блок «История цены» на detail-странице: строки «дата — цена — изменение (↓ −2 %)».
Цена — через форматтеры `lib/format.ts` + валютный тоггл. Первая строка — «Опубликовано».
Если запись одна — колонка «изменение» пустая/блок в одну строку. i18n uz/ru/en.

## 5. Разбиение на PR

- **PR 1 — apps/api**: schema + миграция (с бэкфиллом) + capture в service +
  `price_history` в detail response + тесты + ADR + openapi regen.
- **PR 2 — apps/client**: UI-блок + i18n + тест рендера.

## Тесты

- api unit: append при create; append при изменении цены/валюты; no-op при
  update без изменения цены; порядок в detail response.
- api int-spec: detail возвращает историю после смены цены.
- client: рендер блока с 2+ записями и с одной.
