# Listing Price History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Хранить историю изменений цены объявления (append-only таблица `listing_price_history`) и публично показывать блок «История цены» на detail-странице клиента.

**Architecture:** Отдельная Prisma-модель `ListingPriceHistory` (по образцу `moderation_logs`); запись событий в `ListingsService.create()/update()` в тех же транзакциях; отдача `price_history` внутри `GET /api/v1/listings/:id` (non-breaking, v1). Клиент маппит поле в UI-модель и рендерит клиентский компонент `PriceHistory` на detail-странице.

**Tech Stack:** NestJS + Prisma + PostgreSQL (apps/api), Next.js + next-intl + Vitest/RTL (apps/client).

Spec: `docs/superpowers/specs/2026-07-04-listing-price-history-design.md`

## Global Constraints

- Границы app-папок: Tasks 1–4 — ТОЛЬКО `apps/api/`; Tasks 5–7 — ТОЛЬКО `apps/client/`. Два отдельных PR.
- `price` в API-ответах — строка с 2 дробными (`Decimal.toFixed(2)`), контракт API.md §7.
- Snake_case в API-ответах; camelCase в UI-модели клиента.
- Unversioned routes запрещены; новых endpoints НЕ добавляем (поле внутри существующего detail).
- i18n клиента: ключи в `apps/client/messages/{en,ru,uz}.json`; узбекский — ЛАТИНИЦА (проверить на кириллические двойники).
- Субагенты НЕ трогают git: коммиты/PR делает контроллер.
- int-spec НЕ добавляем (вне CI, требует живой PG — memory `avino-api-int-specs-gotchas`); покрытие — unit-тесты + live-verify на стенде.

---

# Часть A — apps/api (PR 1, branch `feature/listing-price-history-api`)

### Task 1: Prisma-модель + миграция с бэкфиллом

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (модель Listing ~строка 478 — relations; новая модель после ListingTranslation)
- Create: `apps/api/prisma/migrations/20260704000000_add_listing_price_history/migration.sql`

**Interfaces:**
- Produces: Prisma-модель `ListingPriceHistory` (`prisma.listingPriceHistory`), relation `Listing.priceHistory`.

- [ ] **Step 1: Добавить модель в schema.prisma**

В блок relations модели `Listing` (после `tourRequests TourRequest[]`):

```prisma
  priceHistory   ListingPriceHistory[]
```

Новая модель (после `ListingTranslation`, перед `ListingMedia`):

```prisma
/// История изменений цены объявления (ADR-0121). Append-only лог: строка на
/// каждое событие — цена создания + каждое реальное изменение (price, currency)
/// в ListingsService.create()/update(). Публично отдаётся в detail-ответе
/// (`price_history`), Zillow-style «Price history». ON DELETE CASCADE — история
/// не переживает физическое удаление объявления.
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

- [ ] **Step 2: Написать миграцию**

`apps/api/prisma/migrations/20260704000000_add_listing_price_history/migration.sql`:

```sql
-- CreateTable (ADR-0121: append-only история цены объявления)
CREATE TABLE "listing_price_history" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_price_history_listing_id_created_at_idx"
    ON "listing_price_history"("listing_id", "created_at");

-- AddForeignKey
ALTER TABLE "listing_price_history"
    ADD CONSTRAINT "listing_price_history_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: у существующих объявлений история начинается с текущей цены,
-- датированной созданием объявления (иначе история пуста навсегда).
INSERT INTO "listing_price_history" ("id", "listing_id", "price", "currency", "created_at")
SELECT gen_random_uuid(), l."id", l."price", l."currency", l."created_at"
FROM "listings" l;
```

- [ ] **Step 3: Перегенерировать Prisma-клиент**

Run: `pnpm --filter @avino/api exec prisma generate`
Expected: `Generated Prisma Client` без ошибок. (Memory: stale client после смены веток — generate обязателен.)

- [ ] **Step 4: Проверить компиляцию**

Run: `pnpm --filter @avino/api exec tsc --noEmit -p apps/api/tsconfig.json` (или `rtk tsc` из apps/api)
Expected: 0 ошибок.

### Task 2: Capture-логика + price_history в detail-ответе

**Files:**
- Modify: `apps/api/src/listings/listings.service.ts`

**Interfaces:**
- Consumes: `prisma.listingPriceHistory` из Task 1.
- Produces: `ListingDetailResponse.price_history: PriceHistoryEntry[]`, `export interface PriceHistoryEntry { price: string; currency: Currency; created_at: string }`.

- [ ] **Step 1: Экспортировать тип записи истории** (рядом с `ContactBlock`, ~строка 183):

```ts
/** Одно событие истории цены (ADR-0121): значение на момент created_at. */
export interface PriceHistoryEntry {
  price: string;
  currency: Currency;
  created_at: string;
}
```

В `ListingDetailResponse` (после `calls_count: number;`):

```ts
  /** История цены (ADR-0121): от старых к новым, первая строка — цена создания. */
  price_history: PriceHistoryEntry[];
```

- [ ] **Step 2: Дополнить LISTING_DETAIL_SELECT** (после `_count: ...`):

```ts
  // История цены (ADR-0121): от старых к новым для публичного блока detail.
  priceHistory: {
    select: { price: true, currency: true, createdAt: true },
    orderBy: { createdAt: Prisma.SortOrder.asc },
  },
```

- [ ] **Step 3: create() — первая строка истории в той же транзакции**

Заменить тело `$transaction` в `create()`:

```ts
    const listing = await this.prisma.$transaction(async (tx) => {
      await this.ensureSellerRole(tx, ownerId);
      const created = await tx.listing.create({ data, select: LISTING_SELECT });
      // Первая строка истории цены — цена создания (ADR-0121).
      await tx.listingPriceHistory.create({
        data: { listingId: created.id, price: dto.price, currency: dto.currency },
      });
      return created;
    });
```

- [ ] **Step 4: update() — append при реальном изменении**

В `findFirst` метода `update()` добавить в select: `price: true, currency: true`.

Заменить финальный `this.prisma.listing.update(...)` на:

```ts
    // История цены (ADR-0121): событие пишем, только если итоговая пара
    // (price, currency) реально отличается — платный no-op не логируем.
    const priceTouched = dto.price !== undefined || dto.currency !== undefined;
    const nextPrice = dto.price ?? existing.price.toFixed(2);
    const nextCurrency = dto.currency ?? existing.currency;
    const priceChanged =
      priceTouched &&
      (!existing.price.equals(new Prisma.Decimal(nextPrice)) ||
        nextCurrency !== existing.currency);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.listing.update({
        where: { id: listingId },
        data,
        select: LISTING_SELECT,
      });
      if (priceChanged) {
        await tx.listingPriceHistory.create({
          data: { listingId, price: nextPrice, currency: nextCurrency },
        });
      }
      return row;
    });
    return this.toResponse(updated);
```

- [ ] **Step 5: toDetailResponse — маппинг** (после `calls_count: listing.callsCount,`):

```ts
      price_history: listing.priceHistory.map((h) => ({
        price: h.price.toFixed(2),
        currency: h.currency,
        created_at: h.createdAt.toISOString(),
      })),
```

- [ ] **Step 6: Компиляция**

Run: `pnpm --filter @avino/api exec tsc --noEmit`
Expected: 0 ошибок.

### Task 3: Unit-тесты service

**Files:**
- Modify: `apps/api/src/listings/listings.service.spec.ts`

ВАЖНО: `update()` теперь читает `existing.price/currency` и идёт через `$transaction`; `findOne` маппит `listing.priceHistory`. Существующие фикстуры нужно дополнить, иначе тесты упадут:
- в `beforeEach` в мок prisma добавить `listingPriceHistory: { create: jest.fn().mockResolvedValue({}) }`;
- во всех моках `findFirst` внутри `describe('update')` добавить `price: new Prisma.Decimal('4500000.00'), currency: Currency.UZS`;
- во всех моках `findUnique` внутри `describe('findOne')` добавить `priceHistory: []`.

- [ ] **Step 1: Тесты create/update**

В `describe('create')`:

```ts
    it('writes the initial price-history row inside the create transaction', async () => {
      prisma.listing.create.mockResolvedValue(dbListing);

      await service.create(OWNER_ID, validCreate as any);

      expect(prisma.listingPriceHistory.create).toHaveBeenCalledWith({
        data: {
          listingId: LISTING_ID,
          price: '4500000.00',
          currency: Currency.UZS,
        },
      });
    });
```

В `describe('update')` (используя локальную фикстуру existing-мока этого describe):

```ts
    it('appends a price-history row when the price actually changes', async () => {
      prisma.listing.update.mockResolvedValue(dbListing);
      await service.update(OWNER_ID, LISTING_ID, { price: '4200000.00' } as any);
      expect(prisma.listingPriceHistory.create).toHaveBeenCalledWith({
        data: {
          listingId: LISTING_ID,
          price: '4200000.00',
          currency: Currency.UZS,
        },
      });
    });

    it('appends a price-history row when only the currency changes', async () => {
      prisma.listing.update.mockResolvedValue(dbListing);
      await service.update(OWNER_ID, LISTING_ID, { currency: Currency.USD } as any);
      expect(prisma.listingPriceHistory.create).toHaveBeenCalledWith({
        data: {
          listingId: LISTING_ID,
          price: '4500000.00',
          currency: Currency.USD,
        },
      });
    });

    it('does not append history when the submitted price equals the current one', async () => {
      prisma.listing.update.mockResolvedValue(dbListing);
      await service.update(OWNER_ID, LISTING_ID, { price: '4500000.00' } as any);
      expect(prisma.listingPriceHistory.create).not.toHaveBeenCalled();
    });

    it('does not append history when price/currency are not in the dto', async () => {
      prisma.listing.update.mockResolvedValue(dbListing);
      await service.update(OWNER_ID, LISTING_ID, { rooms: 3 } as any);
      expect(prisma.listingPriceHistory.create).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Тест findOne (маппинг price_history)**

В `describe('findOne')`, на базе фикстуры detail-мока этого describe:

```ts
    it('returns price_history in chronological order', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...detailDbListing, // локальное имя detail-фикстуры в этом describe
        priceHistory: [
          {
            price: new Prisma.Decimal('4500000.00'),
            currency: Currency.UZS,
            createdAt: new Date('2026-06-02T08:00:00.000Z'),
          },
          {
            price: new Prisma.Decimal('4200000.00'),
            currency: Currency.UZS,
            createdAt: new Date('2026-07-01T08:00:00.000Z'),
          },
        ],
      });

      const res = await service.findOne(LISTING_ID, undefined);

      expect(res.price_history).toEqual([
        {
          price: '4500000.00',
          currency: Currency.UZS,
          created_at: '2026-06-02T08:00:00.000Z',
        },
        {
          price: '4200000.00',
          currency: Currency.UZS,
          created_at: '2026-07-01T08:00:00.000Z',
        },
      ]);
    });
```

- [ ] **Step 3: Прогнать тесты**

Run: `pnpm --filter @avino/api test -- listings.service.spec`
Expected: PASS, 0 failures (все существующие + новые).

### Task 4: Документация + openapi

**Files:**
- Create: `docs/adr/ADR-0121-listing-price-history.md`
- Modify: `docs/API.md` (§7, detail-ответ `GET /api/v1/listings/:id`)
- Possibly regenerated: `apps/api/openapi.public.json`, `apps/api/openapi.internal.json`

- [ ] **Step 1: ADR-0121**

```markdown
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
```

- [ ] **Step 2: docs/API.md** — в описании ответа `GET /api/v1/listings/:id` (§7) добавить поле:

```text
price_history — массив событий цены (ADR-0121), от старых к новым:
[{ "price": "10000.00", "currency": "USD", "created_at": "2026-07-01T10:00:00Z" }]
Первая запись — цена создания объявления.
```

- [ ] **Step 3: openapi regen**

Run: `pnpm --filter @avino/api openapi:export` (CI drift-check).
Expected: файлы перегенерированы; если diff есть — включить в коммит.

- [ ] **Step 4: Финальная проверка Части A**

Run: `pnpm --filter @avino/api test` и `pnpm --filter @avino/api exec tsc --noEmit`
Expected: GREEN.

---

# Часть B — apps/client (PR 2, branch `feature/client-price-history`, после мержа PR 1 или stacked)

### Task 5: API-слой клиента + UI-модель

**Files:**
- Modify: `apps/client/src/lib/api/listings.ts` (`ApiListingDetail`, `mapListing`)
- Modify: `apps/client/src/lib/mock/types.ts` (`Listing`, новый `PriceHistoryEntry`)

**Interfaces:**
- Produces: `Listing.priceHistory?: PriceHistoryEntry[]` где `PriceHistoryEntry = { price: string; currency: Currency; createdAt: string }` (экспорт из `@/lib/mock/types`).

- [ ] **Step 1: types.ts** — после `TourWindow`:

```ts
/** Событие истории цены (detail-only, ADR-0121). */
export interface PriceHistoryEntry {
  /** Цена — строка (деньги НЕ number). */
  price: string;
  currency: Currency;
  /** ISO-дата события. */
  createdAt: string;
}
```

В `Listing` (после `likesCount?: number;`):

```ts
  /** История цены (detail-only, ADR-0121): от старых к новым. */
  priceHistory?: PriceHistoryEntry[];
```

- [ ] **Step 2: listings.ts** — в `ApiListingDetail` (после `likes_count?: number;`):

```ts
  /** История цены (ADR-0121): от старых к новым. Optional — старый бэкенд. */
  price_history?: { price: string; currency: Currency; created_at: string }[];
```

В `mapListing` (рядом с `likesCount`):

```ts
    priceHistory: detail?.price_history?.map((h) => ({
      price: h.price,
      currency: h.currency,
      createdAt: h.created_at,
    })),
```

- [ ] **Step 3: Компиляция**

Run: `pnpm --filter @avino/client exec tsc --noEmit`
Expected: 0 ошибок.

### Task 6: Компонент PriceHistory + место на Detail + i18n

**Files:**
- Create: `apps/client/src/features/detail/PriceHistory.tsx`
- Modify: `apps/client/src/features/detail/Detail.tsx` (рендер после блока Facts)
- Modify: `apps/client/messages/en.json`, `apps/client/messages/ru.json`, `apps/client/messages/uz.json` (секция `listing`)

**Interfaces:**
- Consumes: `Listing.priceHistory` из Task 5; `usePriceFormatter()` (`fmt.price({price, currency, tx})`).

- [ ] **Step 1: PriceHistory.tsx**

```tsx
/**
 * PriceHistory — публичный блок «История цены» на detail (ADR-0121, Zillow-style).
 * Клиентский компонент (usePriceFormatter → цена следует за тогглом [сум|$]).
 * Записи приходят от старых к новым; показываем новые сверху. Дельта — % к
 * предыдущей записи; между разными валютами не считается.
 */
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { Listing, PriceHistoryEntry } from '@/lib/mock/types';
import { usePriceFormatter } from '@/lib/usePriceFormatter';

export interface PriceHistoryProps {
  listing: Pick<Listing, 'tx' | 'priceHistory'>;
}

/** % к предыдущей записи; null — сравнить нельзя (нет prev / другая валюта / шум <0.05%). */
function deltaPct(
  prev: PriceHistoryEntry | undefined,
  cur: PriceHistoryEntry,
): number | null {
  if (!prev || prev.currency !== cur.currency) return null;
  const a = Number(prev.price);
  const b = Number(cur.price);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return null;
  const pct = ((b - a) / a) * 100;
  return Math.abs(pct) < 0.05 ? null : pct;
}

const DATE_LOCALES: Record<string, string> = { uz: 'uz-UZ', en: 'en-US', ru: 'ru-RU' };

export function PriceHistory({ listing }: PriceHistoryProps) {
  const t = useTranslations('listing');
  const locale = useLocale();
  const fmt = usePriceFormatter();
  const entries = listing.priceHistory ?? [];
  if (entries.length === 0) return null;

  const dateFmt = new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? 'ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Новые сверху; label: первая (хронологически) запись — «Опубликовано».
  const rows = entries
    .map((entry, i) => ({ entry, isFirst: i === 0, pct: deltaPct(entries[i - 1], entry) }))
    .reverse();

  return (
    <div className="mt-7">
      <h2 className="text-[22px]">{t('priceHistory.title')}</h2>
      <div className="mt-3 overflow-hidden rounded-feature border border-border">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(({ entry, isFirst, pct }) => (
              <tr
                key={entry.createdAt}
                className="border-b border-border last:border-b-0"
              >
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {dateFmt.format(new Date(entry.createdAt))}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {isFirst ? t('priceHistory.listed') : t('priceHistory.changed')}
                </td>
                <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                  {fmt.price({ price: entry.price, currency: entry.currency, tx: listing.tx })}
                </td>
                <td className="px-4 py-3 w-24 text-right whitespace-nowrap">
                  {pct != null && (
                    <span
                      className={`inline-flex items-center gap-1 text-[13px] font-semibold ${
                        pct < 0 ? 'text-green' : 'text-red-500'
                      }`}
                    >
                      {pct < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                      {pct > 0 ? '+' : '−'}
                      {Math.abs(pct).toFixed(1)} %
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Примечание: проверить, что `text-green` — существующий токен (используется в Detail.tsx для галочек особенностей); если для роста нет токена — взять tailwind `text-red-500` как в коде выше или существующий проектный токен опасности.

- [ ] **Step 2: Detail.tsx** — импорт + рендер после `<Facts listing={listing} className="mt-6" />`:

```tsx
import { PriceHistory } from './PriceHistory';
```

```tsx
          {/* История цены (ADR-0121) */}
          <PriceHistory listing={listing} />
```

- [ ] **Step 3: i18n** — в секцию `listing` каждого файла:

en.json:
```json
      "priceHistory": {
        "title": "Price history",
        "listed": "Listed",
        "changed": "Price change"
      }
```

ru.json:
```json
      "priceHistory": {
        "title": "История цены",
        "listed": "Опубликовано",
        "changed": "Изменение цены"
      }
```

uz.json (латиница!):
```json
      "priceHistory": {
        "title": "Narx tarixi",
        "listed": "E'lon qilingan",
        "changed": "Narx o'zgarishi"
      }
```

- [ ] **Step 4: Компиляция + build**

Run: `pnpm --filter @avino/client exec tsc --noEmit`, затем `pnpm --filter @avino/client exec next build` (НЕ `rtk next build` — memory: врёт «Errors: 1»).
Expected: 0 ошибок TS; build успешен.

### Task 7: Тест PriceHistory

**Files:**
- Create: `apps/client/src/features/detail/PriceHistory.test.tsx`

- [ ] **Step 1: Написать тест**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PriceHistory } from './PriceHistory';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'ru',
}));
vi.mock('@/lib/usePriceFormatter', () => ({
  usePriceFormatter: () => ({
    display: 'USD',
    price: (l: { price: string }) => `$${l.price}`,
    pin: () => '',
  }),
}));

const E = (price: string, createdAt: string, currency: 'USD' | 'UZS' = 'USD') => ({
  price,
  currency,
  createdAt,
});

describe('PriceHistory', () => {
  it('ничего не рендерит без истории', () => {
    const { container } = render(
      <PriceHistory listing={{ tx: 'SALE', priceHistory: [] }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('одна запись — «Опубликовано», без дельты', () => {
    render(
      <PriceHistory
        listing={{ tx: 'SALE', priceHistory: [E('10000.00', '2026-06-01T00:00:00Z')] }}
      />,
    );
    expect(screen.getByText('priceHistory.title')).toBeInTheDocument();
    expect(screen.getByText('priceHistory.listed')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('две записи — снижение −2.0 %', () => {
    render(
      <PriceHistory
        listing={{
          tx: 'SALE',
          priceHistory: [
            E('10000.00', '2026-06-01T00:00:00Z'),
            E('9800.00', '2026-07-01T00:00:00Z'),
          ],
        }}
      />,
    );
    expect(screen.getByText('priceHistory.changed')).toBeInTheDocument();
    expect(screen.getByText(/−2\.0\s?%/)).toBeInTheDocument();
  });

  it('смена валюты — дельта не считается', () => {
    render(
      <PriceHistory
        listing={{
          tx: 'SALE',
          priceHistory: [
            E('10000.00', '2026-06-01T00:00:00Z', 'USD'),
            E('126000000.00', '2026-07-01T00:00:00Z', 'UZS'),
          ],
        }}
      />,
    );
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Прогнать тесты**

Run: `pnpm --filter @avino/client test -- PriceHistory`
Expected: PASS. (Известный предсущ. долг: 2 фейла LoginModal.test.tsx — НЕ регресс, memory `avino-loginmodal-test-preexisting-fail` — при полном прогоне игнорировать.)

---

## Верификация (контроллер, после обеих частей)

1. Локальный live-verify (memory `avino-local-live-verify-recipe`): поднять стек, PATCH цены своего листинга → GET detail → `price_history` из 2 записей; открыть `/listing/:id` на :3001 → блок «История цены».
2. PR 1 → main; затем PR 2 (client optional-поле — безопасен и до деплоя api).
3. After merge: ADR-0121 уже в PR 1; DONE.md записи — в feature-PR (memory `avino-finalize-in-feature-pr`).
