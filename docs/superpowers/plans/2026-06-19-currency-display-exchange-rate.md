# Currency Display + Daily USD/UZS Exchange Rate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch the official USD/UZS rate from cbu.uz once a day, store it with history + manual override, expose it via API, and let public-portal viewers toggle `[сум | $]` so every listing price shows in the chosen currency (native exact, converted with `≈`).

**Architecture:** Backend (NestJS + BullMQ + Prisma) gains an `ExchangeRate` table, a daily repeatable cron that calls cbu.uz, a public `GET /exchange-rate`, and admin override endpoints. The client (Next.js + RTK Query) reads the rate, stores a persisted display-currency preference (redux slice + localStorage), and converts prices at render time through one `usePriceFormatter` hook. The admin panel (apps/web) shows/overrides the rate. **Display-only:** native listing currency in the DB is never changed; backend search SQL is untouched.

**Tech Stack:** NestJS 10, Prisma, BullMQ (Redis), Next.js (App Router), RTK Query, next-intl, jest (api tests), vitest (client tests).

## Global Constraints

- **Display-only scope.** Never write converted values to the DB. Never modify `apps/api/src/search/search.service.ts` SQL or the search DTO price logic.
- **Currency enum values are exactly** `'UZS'` and `'USD'` (Prisma `enum Currency`).
- **Rate column type:** `Decimal(18, 6)`; rate semantics = `1 USD = rate UZS` (base=USD, quote=UZS). Money → Numeric, never Float.
- **Default display currency = `UZS`.** localStorage key = `'avino.displayCurrency'`, allowed values `'UZS' | 'USD'`.
- **`≈` prefix only on converted prices**, never on native. Rounding: target USD → whole dollars (`Math.round`); target UZS → nearest 1000 (`Math.round(v/1000)*1000`).
- **i18n parity:** every new key added to `messages/ru.json`, `messages/uz.json`, `messages/en.json`.
- **API routes versioned** (`@Controller({ path: '...', version: '1' })` → `/api/v1/...`). Admin endpoints guarded by `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)`; admin id via `@CurrentUser('id')`.
- **Cron default** `EXCHANGE_RATE_CRON='0 6 * * *'`, `EXCHANGE_RATE_TZ='Asia/Tashkent'`, `CBU_BASE_URL='https://cbu.uz'`. CBU endpoint: `GET {base}/ru/arkhiv-kursov-valyut/json/USD/`.
- **Test runners:** api = `pnpm --filter @avino/api test` (jest); client = `pnpm --filter @avino/client test` (vitest). Lint/build per app before commit. Subagents NEVER run git — the controller owns all git (Avino shared-workdir hazard). Commit steps below are for the controller.
- **`main` is protected** — open PRs, the user merges. Bundle ADR + DONE.md prep into the feature PR (no separate follow-up PR).

---

## File Structure

**apps/api (new unless noted):**
- `prisma/schema.prisma` — *modify*: add `enum ExchangeRateSource`, `model ExchangeRate`.
- `prisma/migrations/<ts>_exchange_rate/migration.sql` — generated.
- `prisma/seed.ts` (or existing seed) — *modify*: insert one bootstrap rate row.
- `src/config/configuration.ts` — *modify*: add `exchangeRateConfig` + register; `src/config/env.validation.ts` — *modify* (optional vars).
- `src/queues/queue.constants.ts` — *modify*: add exchange-rate queue/job names + payload type.
- `src/queues/queues.module.ts` — *modify*: provide+export `ExchangeRateQueue`.
- `src/exchange-rates/cbu.provider.ts` — pure `parseCbuUsdRate` + `fetchCbuUsdRate`.
- `src/exchange-rates/exchange-rate.queue.ts` — BullMQ producer (repeatable scheduler).
- `src/exchange-rates/exchange-rate.service.ts` — `getCurrent` / `refreshFromCbu` / `setManual` / `listHistory`.
- `src/exchange-rates/exchange-rate.worker.ts` — BullMQ consumer + cold-start refresh.
- `src/exchange-rates/exchange-rate.controller.ts` — public `GET /exchange-rate`.
- `src/exchange-rates/admin-exchange-rate.controller.ts` — admin `GET/PUT/POST`.
- `src/exchange-rates/dto/set-exchange-rate.dto.ts` — admin override DTO.
- `src/exchange-rates/exchange-rate.types.ts` — `ExchangeRateView` interface.
- `src/exchange-rates/exchange-rate.module.ts` — wires providers/controllers; imported by `AppModule`.
- `src/app.module.ts` — *modify*: import `ExchangeRateModule`.
- `*.spec.ts` next to each unit.
- `docs/API.md` — *modify*: document the 4 routes.

**apps/client (new unless noted):**
- `src/store/api/exchangeRateApi.ts` — RTK endpoint + `useGetExchangeRateQuery`.
- `src/store/currencySlice.ts` — display-currency slice + localStorage persistence.
- `src/store/store.ts` (the file registering `favorites` reducer) — *modify*: add `currency` reducer.
- `src/store/StoreProvider.tsx` — *modify*: add `<CurrencyHydrator/>`.
- `src/lib/useCurrencyPreference.ts` — `useCurrencyPreference()` + `useSetCurrency()`.
- `src/lib/usePriceFormatter.ts` — hook returning `{ price, pin, display }`.
- `src/lib/format.ts` — *modify*: extend `formatPrice` + `pinPrice` with `{ display, rate }`.
- `src/components/layout/CurrencySwitcher.tsx` — `[сум | $]` segmented control.
- `src/components/layout/Header.tsx` — *modify*: mount `<CurrencySwitcher/>`.
- `src/features/search/PropertyCard.tsx`, `src/features/detail/Detail.tsx`, `src/features/account/MyListings.tsx`, `src/features/map/MapView.tsx` — *modify*: use `usePriceFormatter`.
- `src/features/search/FilterBar.tsx` + `src/store/api/searchApi.ts` + the `ListingFilter` type — *modify*: bind `currency` when a price bound is set.
- `messages/{ru,uz,en}.json` — *modify*: add `units.approx`, `nav.currency*`.
- `*.test.ts` for slice, format, hook.

**apps/web (new unless noted):**
- `src/store/api/adminExchangeRateApi.ts` — admin RTK endpoints.
- `src/components/admin/ExchangeRatePanel.tsx` — panel.
- `src/app/admin/settings/page.tsx` — *modify*: replace static "Курс USD → сум" input with `<ExchangeRatePanel/>`.

---

# PHASE 1 — API (apps/api)

### Task 1: Prisma model + migration + bootstrap seed

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/seed.ts` (the file referenced by `prisma db seed`; if seeds are split, add to the main seed entrypoint)
- Generated: `apps/api/prisma/migrations/<ts>_exchange_rate/migration.sql`

**Interfaces:**
- Produces: Prisma model `ExchangeRate { id, base, quote, rate, source, fetchedAt, createdAt }`, enum `ExchangeRateSource { CBU, MANUAL }`. Table `exchange_rates`. At least one bootstrap row `(USD, UZS)`.

- [ ] **Step 1: Add enum + model to schema** — insert after the `enum Currency` block (near line 64):

```prisma
enum ExchangeRateSource {
  CBU
  MANUAL
}
```

And add the model near the other settings models (e.g. after `AppSetting`, ~line 592):

```prisma
/// Курс валют (USD→UZS). «Текущий курс» = последняя строка по fetchedAt.
/// История — все строки. Ручной оверрайд = строка с source=MANUAL.
model ExchangeRate {
  id        String             @id @default(uuid()) @db.Uuid
  base      Currency
  quote     Currency
  rate      Decimal            @db.Decimal(18, 6) // 1 base = rate quote (1 USD = rate UZS)
  source    ExchangeRateSource
  fetchedAt DateTime           @default(now()) @map("fetched_at") @db.Timestamptz(6)
  createdAt DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([base, quote, fetchedAt(sort: Desc)])
  @@map("exchange_rates")
}
```

- [ ] **Step 2: Create the migration**

Run: `pnpm --filter @avino/api exec prisma migrate dev --name exchange_rate`
Expected: a new folder under `prisma/migrations/` and "Your database is now in sync"; Prisma Client regenerated.
(Requires the dev Postgres up via docker compose. If the DB is not reachable, run `prisma migrate dev --create-only --name exchange_rate` to generate SQL, then apply once the DB is up.)

- [ ] **Step 3: Add a bootstrap seed row** — in `prisma/seed.ts`, inside the main seed function, add an idempotent insert so `getCurrent()` works before the first cron run:

```ts
const hasRate = await prisma.exchangeRate.findFirst({
  where: { base: 'USD', quote: 'UZS' },
});
if (!hasRate) {
  await prisma.exchangeRate.create({
    data: { base: 'USD', quote: 'UZS', rate: '12650.000000', source: 'MANUAL' },
  });
}
```

- [ ] **Step 4: Run the seed**

Run: `pnpm --filter @avino/api exec prisma db seed`
Expected: completes without error; re-running does not duplicate the rate row.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/prisma/seed.ts
git commit -m "feat(api): add ExchangeRate model, migration and bootstrap seed"
```

---

### Task 2: Config namespace + queue/job constants

**Files:**
- Modify: `apps/api/src/config/configuration.ts`
- Modify: `apps/api/src/config/env.validation.ts` (if present; optional vars only)
- Modify: `apps/api/src/queues/queue.constants.ts`
- Modify: `apps/api/.env.example` (or the documented env sample)

**Interfaces:**
- Produces: config namespace `exchangeRate` → `{ cron, timezone, cbuBaseUrl }`; constants `EXCHANGE_RATE_QUEUE_NAME`, `REFRESH_EXCHANGE_RATE_JOB`, type `RefreshExchangeRateJobData`.

- [ ] **Step 1: Add config namespace** — in `configuration.ts`, mirror `promotionConfig`:

```ts
export const exchangeRateConfig = registerAs('exchangeRate', () => ({
  cron: process.env.EXCHANGE_RATE_CRON ?? '0 6 * * *',
  timezone: process.env.EXCHANGE_RATE_TZ ?? 'Asia/Tashkent',
  cbuBaseUrl: process.env.CBU_BASE_URL ?? 'https://cbu.uz',
}));
```

Add `exchangeRateConfig` to the `configurations` array exported at the bottom of the file.

- [ ] **Step 2: Add queue constants** — append to `queue.constants.ts`:

```ts
/** Очередь ежедневного обновления курса валют. */
export const EXCHANGE_RATE_QUEUE_NAME = 'exchange_rate_queue';

/** Repeatable-джоба: тянет USD/UZS из cbu.uz и пишет новую строку. */
export const REFRESH_EXCHANGE_RATE_JOB = 'refresh_exchange_rate';

/** Нагрузка пустая: джоба сама делает один fetch + insert. */
export type RefreshExchangeRateJobData = Record<string, never>;
```

- [ ] **Step 3: Document env** — add to `.env.example`:

```
# Exchange rate (cbu.uz, no key required)
EXCHANGE_RATE_CRON=0 6 * * *
EXCHANGE_RATE_TZ=Asia/Tashkent
CBU_BASE_URL=https://cbu.uz
```

If `env.validation.ts` enumerates known vars, add these three as optional strings (do not make them required).

- [ ] **Step 4: Verify it compiles**

Run: `pnpm --filter @avino/api exec tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config apps/api/src/queues/queue.constants.ts apps/api/.env.example
git commit -m "feat(api): exchange-rate config namespace and queue constants"
```

---

### Task 3: CBU provider (pure parse + fetch)

**Files:**
- Create: `apps/api/src/exchange-rates/cbu.provider.ts`
- Test: `apps/api/src/exchange-rates/cbu.provider.spec.ts`

**Interfaces:**
- Produces: `parseCbuUsdRate(json: unknown): string` (throws on bad shape), `fetchCbuUsdRate(baseUrl: string): Promise<string>`.

- [ ] **Step 1: Write failing tests** — `cbu.provider.spec.ts`:

```ts
import { parseCbuUsdRate } from './cbu.provider';

describe('parseCbuUsdRate', () => {
  it('extracts Rate from the CBU USD array payload', () => {
    const payload = [
      { id: 69, Code: '840', Ccy: 'USD', Rate: '12650.18', Date: '19.06.2026' },
    ];
    expect(parseCbuUsdRate(payload)).toBe('12650.18');
  });

  it('throws when payload is not a non-empty array', () => {
    expect(() => parseCbuUsdRate([])).toThrow();
    expect(() => parseCbuUsdRate({})).toThrow();
  });

  it('throws when Rate is missing or not numeric', () => {
    expect(() => parseCbuUsdRate([{ Ccy: 'USD' }])).toThrow();
    expect(() => parseCbuUsdRate([{ Ccy: 'USD', Rate: 'abc' }])).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @avino/api test -- cbu.provider`
Expected: FAIL — `parseCbuUsdRate is not a function`.

- [ ] **Step 3: Implement** — `cbu.provider.ts`:

```ts
/**
 * CBU (Центробанк РУз) provider. Эндпоинт USD:
 *   GET {baseUrl}/ru/arkhiv-kursov-valyut/json/USD/
 * Ответ — массив с одним объектом { Ccy:'USD', Rate:'12650.18', ... }.
 * Ключ не нужен. Нативный fetch (как Yandex/Eskiz).
 */
export function parseCbuUsdRate(json: unknown): string {
  if (!Array.isArray(json) || json.length === 0) {
    throw new Error('CBU payload is not a non-empty array');
  }
  const rate = (json[0] as { Rate?: unknown }).Rate;
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) {
    throw new Error(`CBU USD Rate is missing or not numeric: ${String(rate)}`);
  }
  return rate;
}

export async function fetchCbuUsdRate(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/ru/arkhiv-kursov-valyut/json/USD/`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`CBU request failed: HTTP ${res.status}`);
  }
  return parseCbuUsdRate(await res.json());
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @avino/api test -- cbu.provider`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/exchange-rates/cbu.provider.ts apps/api/src/exchange-rates/cbu.provider.spec.ts
git commit -m "feat(api): cbu.uz USD rate provider with pure parser"
```

---

### Task 4: ExchangeRateService

**Files:**
- Create: `apps/api/src/exchange-rates/exchange-rate.types.ts`
- Create: `apps/api/src/exchange-rates/exchange-rate.service.ts`
- Test: `apps/api/src/exchange-rates/exchange-rate.service.spec.ts`

**Interfaces:**
- Consumes: `fetchCbuUsdRate` (Task 3), `ConfigService` (`exchangeRate.cbuBaseUrl`), `PrismaService`.
- Produces:
  - `ExchangeRateView = { base: 'USD'; quote: 'UZS'; rate: string; fetched_at: string; source: 'CBU' | 'MANUAL' }`
  - `ExchangeRateService.getCurrent(): Promise<ExchangeRateView | null>`
  - `ExchangeRateService.refreshFromCbu(): Promise<void>`
  - `ExchangeRateService.setManual(adminId: string, rate: string): Promise<ExchangeRateView>`
  - `ExchangeRateService.listHistory(limit?: number): Promise<ExchangeRateView[]>`

- [ ] **Step 1: Add the view type** — `exchange-rate.types.ts`:

```ts
export interface ExchangeRateView {
  base: 'USD';
  quote: 'UZS';
  rate: string;
  fetched_at: string;
  source: 'CBU' | 'MANUAL';
}
```

- [ ] **Step 2: Write failing tests** — `exchange-rate.service.spec.ts`:

```ts
import { ExchangeRateService } from './exchange-rate.service';

jest.mock('./cbu.provider', () => ({
  fetchCbuUsdRate: jest.fn(),
}));
import { fetchCbuUsdRate } from './cbu.provider';

function makeService() {
  const prisma: any = {
    exchangeRate: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const config: any = { get: jest.fn().mockReturnValue('https://cbu.uz') };
  const service = new ExchangeRateService(prisma, config);
  return { service, prisma, config };
}

describe('ExchangeRateService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getCurrent maps the latest row to snake_case view', async () => {
    const { service, prisma } = makeService();
    prisma.exchangeRate.findFirst.mockResolvedValue({
      base: 'USD', quote: 'UZS', rate: '12650.180000',
      source: 'CBU', fetchedAt: new Date('2026-06-19T06:00:00Z'),
    });
    const view = await service.getCurrent();
    expect(prisma.exchangeRate.findFirst).toHaveBeenCalledWith({
      where: { base: 'USD', quote: 'UZS' },
      orderBy: { fetchedAt: 'desc' },
    });
    expect(view).toEqual({
      base: 'USD', quote: 'UZS', rate: '12650.180000',
      fetched_at: '2026-06-19T06:00:00.000Z', source: 'CBU',
    });
  });

  it('getCurrent returns null when no rows', async () => {
    const { service, prisma } = makeService();
    prisma.exchangeRate.findFirst.mockResolvedValue(null);
    expect(await service.getCurrent()).toBeNull();
  });

  it('refreshFromCbu inserts a CBU row with the fetched rate', async () => {
    const { service, prisma } = makeService();
    (fetchCbuUsdRate as jest.Mock).mockResolvedValue('12700.50');
    await service.refreshFromCbu();
    expect(prisma.exchangeRate.create).toHaveBeenCalledWith({
      data: { base: 'USD', quote: 'UZS', rate: '12700.50', source: 'CBU' },
    });
  });

  it('refreshFromCbu does NOT insert when the fetch fails', async () => {
    const { service, prisma } = makeService();
    (fetchCbuUsdRate as jest.Mock).mockRejectedValue(new Error('boom'));
    await expect(service.refreshFromCbu()).rejects.toThrow('boom');
    expect(prisma.exchangeRate.create).not.toHaveBeenCalled();
  });

  it('setManual inserts a MANUAL row and writes an audit log', async () => {
    const { service, prisma } = makeService();
    prisma.exchangeRate.create.mockResolvedValue({
      base: 'USD', quote: 'UZS', rate: '13000.000000',
      source: 'MANUAL', fetchedAt: new Date('2026-06-19T07:00:00Z'),
    });
    const view = await service.setManual('admin-1', '13000');
    expect(prisma.exchangeRate.create).toHaveBeenCalledWith({
      data: { base: 'USD', quote: 'UZS', rate: '13000', source: 'MANUAL' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'admin-1',
        action: 'EXCHANGE_RATE_MANUAL_SET',
        entityType: 'exchange_rate',
      }),
    });
    expect(view.source).toBe('MANUAL');
  });
});
```

- [ ] **Step 3: Run, verify fail**

Run: `pnpm --filter @avino/api test -- exchange-rate.service`
Expected: FAIL — cannot find module `./exchange-rate.service`.

- [ ] **Step 4: Implement** — `exchange-rate.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import { fetchCbuUsdRate } from './cbu.provider';
import { ExchangeRateView } from './exchange-rate.types';

type Row = {
  base: string; quote: string; rate: string;
  source: string; fetchedAt: Date;
};

function toView(row: Row): ExchangeRateView {
  return {
    base: 'USD',
    quote: 'UZS',
    rate: String(row.rate),
    fetched_at: row.fetchedAt.toISOString(),
    source: row.source as 'CBU' | 'MANUAL',
  };
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getCurrent(): Promise<ExchangeRateView | null> {
    const row = await this.prisma.exchangeRate.findFirst({
      where: { base: 'USD', quote: 'UZS' },
      orderBy: { fetchedAt: 'desc' },
    });
    return row ? toView(row as unknown as Row) : null;
  }

  async listHistory(limit = 30): Promise<ExchangeRateView[]> {
    const rows = await this.prisma.exchangeRate.findMany({
      where: { base: 'USD', quote: 'UZS' },
      orderBy: { fetchedAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => toView(r as unknown as Row));
  }

  async refreshFromCbu(): Promise<void> {
    const baseUrl =
      this.config.get<string>('exchangeRate.cbuBaseUrl') ?? 'https://cbu.uz';
    let rate: string;
    try {
      rate = await fetchCbuUsdRate(baseUrl);
    } catch (err) {
      this.logger.error(
        `CBU refresh failed, keeping last rate: ${(err as Error).message}`,
      );
      throw err; // keep last row; BullMQ retries
    }
    await this.prisma.exchangeRate.create({
      data: { base: 'USD', quote: 'UZS', rate, source: 'CBU' },
    });
    this.logger.log(`Exchange rate refreshed from CBU: 1 USD = ${rate} UZS`);
  }

  async setManual(adminId: string, rate: string): Promise<ExchangeRateView> {
    const row = await this.prisma.exchangeRate.create({
      data: { base: 'USD', quote: 'UZS', rate, source: 'MANUAL' },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'EXCHANGE_RATE_MANUAL_SET',
        entityType: 'exchange_rate',
        entityId: null,
        metadata: { rate },
      },
    });
    return toView(row as unknown as Row);
  }
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @avino/api test -- exchange-rate.service`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/exchange-rates/exchange-rate.service.ts apps/api/src/exchange-rates/exchange-rate.service.spec.ts apps/api/src/exchange-rates/exchange-rate.types.ts
git commit -m "feat(api): ExchangeRateService (getCurrent/refresh/setManual/history)"
```

---

### Task 5: Queue producer + worker + module wiring + cold-start

**Files:**
- Create: `apps/api/src/exchange-rates/exchange-rate.queue.ts`
- Create: `apps/api/src/exchange-rates/exchange-rate.worker.ts`
- Create: `apps/api/src/exchange-rates/exchange-rate.module.ts`
- Modify: `apps/api/src/queues/queues.module.ts` (provide+export `ExchangeRateQueue`)
- Modify: `apps/api/src/app.module.ts` (import `ExchangeRateModule`)

**Interfaces:**
- Consumes: `ExchangeRateService` (Task 4), config `exchangeRate.cron|timezone`, queue constants (Task 2), `buildBullConnection`.
- Produces: `ExchangeRateQueue` (registers repeatable job in `onModuleInit`), `ExchangeRateWorker` (consumes job → `service.refreshFromCbu()`; cold-start: if no current rate, refresh once on boot).

- [ ] **Step 1: Implement the producer** — `exchange-rate.queue.ts` (mirror `promotion.queue.ts`):

```ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import {
  EXCHANGE_RATE_QUEUE_NAME,
  REFRESH_EXCHANGE_RATE_JOB,
} from '../queues/queue.constants';

const SCHEDULER_ID = 'refresh-exchange-rate';

@Injectable()
export class ExchangeRateQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExchangeRateQueue.name);
  private readonly queue: Queue;
  private readonly cron: string;
  private readonly tz: string;

  constructor(config: ConfigService) {
    const url = config.get<string>('redis.url');
    if (!url) throw new Error('REDIS_URL is not configured');
    this.cron = config.get<string>('exchangeRate.cron') ?? '0 6 * * *';
    this.tz = config.get<string>('exchangeRate.timezone') ?? 'Asia/Tashkent';
    this.queue = new Queue(EXCHANGE_RATE_QUEUE_NAME, {
      connection: buildBullConnection(url),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      SCHEDULER_ID,
      { pattern: this.cron, tz: this.tz },
      {
        name: REFRESH_EXCHANGE_RATE_JOB,
        data: {},
        opts: { removeOnComplete: true, removeOnFail: 100 },
      },
    );
    this.logger.log(
      `Scheduled ${REFRESH_EXCHANGE_RATE_JOB} (cron="${this.cron}", tz="${this.tz}")`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
```

- [ ] **Step 2: Implement the worker** — `exchange-rate.worker.ts` (mirror `promotion.worker.ts`, plus cold-start):

```ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import { EXCHANGE_RATE_QUEUE_NAME } from '../queues/queue.constants';
import { ExchangeRateService } from './exchange-rate.service';

@Injectable()
export class ExchangeRateWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExchangeRateWorker.name);
  private worker?: Worker;

  constructor(
    private readonly config: ConfigService,
    private readonly service: ExchangeRateService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<string>('redis.url');
    if (!url) throw new Error('REDIS_URL is not configured');

    this.worker = new Worker(
      EXCHANGE_RATE_QUEUE_NAME,
      () => this.service.refreshFromCbu(),
      { connection: buildBullConnection(url), concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Exchange-rate job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
      );
    });

    // Cold start: if there is no rate yet, fetch once now (best-effort).
    void this.coldStart();
    this.logger.log('Exchange-rate worker started (concurrency=1)');
  }

  private async coldStart(): Promise<void> {
    try {
      if (!(await this.service.getCurrent())) {
        await this.service.refreshFromCbu();
      }
    } catch (err) {
      this.logger.warn(`Cold-start refresh skipped: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
```

- [ ] **Step 3: Create the module** — `exchange-rate.module.ts` (controllers added in Tasks 6–7):

```ts
import { Module } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateWorker } from './exchange-rate.worker';

@Module({
  providers: [ExchangeRateService, ExchangeRateWorker],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
```

- [ ] **Step 4: Register the queue producer** — in `queues.module.ts`, add `ExchangeRateQueue` to both `providers` and `exports` (alongside `PromotionQueue`). Import it from `../exchange-rates/exchange-rate.queue`.

- [ ] **Step 5: Import the module** — in `app.module.ts`, add `ExchangeRateModule` to the `imports` array (next to `PromotionsModule`).

- [ ] **Step 6: Verify compile + existing tests stay green**

Run: `pnpm --filter @avino/api exec tsc --noEmit && pnpm --filter @avino/api test`
Expected: compiles; full jest suite passes (no regressions).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/exchange-rates apps/api/src/queues/queues.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): exchange-rate daily cron queue, worker and module wiring"
```

---

### Task 6: Public controller `GET /exchange-rate`

**Files:**
- Create: `apps/api/src/exchange-rates/exchange-rate.controller.ts`
- Modify: `apps/api/src/exchange-rates/exchange-rate.module.ts` (add to `controllers`)
- Test: `apps/api/src/exchange-rates/exchange-rate.controller.spec.ts`

**Interfaces:**
- Consumes: `ExchangeRateService.getCurrent` / `listHistory`.
- Produces: route `GET /api/v1/exchange-rate` → `ExchangeRateView` (200 even on cold DB — falls back to a synthesized null-safe view is NOT allowed; instead return the seeded current row; if truly null, return `{...rate:'0'...}` is NOT allowed — see step).

- [ ] **Step 1: Write failing test** — `exchange-rate.controller.spec.ts`:

```ts
import { ExchangeRateController } from './exchange-rate.controller';

describe('ExchangeRateController', () => {
  it('returns the current rate view', async () => {
    const view = {
      base: 'USD', quote: 'UZS', rate: '12650.180000',
      fetched_at: '2026-06-19T06:00:00.000Z', source: 'CBU',
    };
    const service: any = { getCurrent: jest.fn().mockResolvedValue(view) };
    const controller = new ExchangeRateController(service);
    expect(await controller.current()).toEqual(view);
  });

  it('404s when no rate exists', async () => {
    const service: any = { getCurrent: jest.fn().mockResolvedValue(null) };
    const controller = new ExchangeRateController(service);
    await expect(controller.current()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @avino/api test -- exchange-rate.controller`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `exchange-rate.controller.ts`:

```ts
import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateView } from './exchange-rate.types';

@Controller({ path: 'exchange-rate', version: '1' })
export class ExchangeRateController {
  constructor(private readonly service: ExchangeRateService) {}

  /** `GET /api/v1/exchange-rate` — текущий курс USD→UZS (публичный, кэшируемый). */
  @Get()
  async current(): Promise<ExchangeRateView> {
    const view = await this.service.getCurrent();
    if (!view) throw new NotFoundException('No exchange rate available');
    return view;
  }
}
```

Add `ExchangeRateController` to the module's `controllers: [ExchangeRateController]`.

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @avino/api test -- exchange-rate.controller`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/exchange-rates/exchange-rate.controller.ts apps/api/src/exchange-rates/exchange-rate.controller.spec.ts apps/api/src/exchange-rates/exchange-rate.module.ts
git commit -m "feat(api): public GET /exchange-rate endpoint"
```

---

### Task 7: Admin controller (`GET` / `PUT` / `POST refresh`)

**Files:**
- Create: `apps/api/src/exchange-rates/dto/set-exchange-rate.dto.ts`
- Create: `apps/api/src/exchange-rates/admin-exchange-rate.controller.ts`
- Modify: `apps/api/src/exchange-rates/exchange-rate.module.ts` (add controller)
- Test: `apps/api/src/exchange-rates/admin-exchange-rate.controller.spec.ts`

**Interfaces:**
- Consumes: `ExchangeRateService.getCurrent/listHistory/setManual/refreshFromCbu`.
- Produces: `GET /api/v1/admin/exchange-rate` → `{ current, history }`; `PUT /api/v1/admin/exchange-rate` body `{ rate }` → `ExchangeRateView`; `POST /api/v1/admin/exchange-rate/refresh` → `ExchangeRateView`.

- [ ] **Step 1: DTO** — `dto/set-exchange-rate.dto.ts` (reuse the decimal pattern from search DTO):

```ts
import { Matches } from 'class-validator';

const DECIMAL = /^\d{1,12}(\.\d{1,6})?$/;

export class SetExchangeRateDto {
  @Matches(DECIMAL, { message: 'rate must be a positive decimal (<=6 fraction digits)' })
  rate!: string;
}
```

- [ ] **Step 2: Write failing test** — `admin-exchange-rate.controller.spec.ts`:

```ts
import { AdminExchangeRateController } from './admin-exchange-rate.controller';

function make() {
  const service: any = {
    getCurrent: jest.fn().mockResolvedValue({ source: 'CBU' }),
    listHistory: jest.fn().mockResolvedValue([{ source: 'CBU' }]),
    setManual: jest.fn().mockResolvedValue({ source: 'MANUAL' }),
    refreshFromCbu: jest.fn().mockResolvedValue(undefined),
  };
  return { service, controller: new AdminExchangeRateController(service) };
}

describe('AdminExchangeRateController', () => {
  it('GET returns current + history', async () => {
    const { controller, service } = make();
    const res = await controller.get();
    expect(res).toEqual({ current: { source: 'CBU' }, history: [{ source: 'CBU' }] });
    expect(service.listHistory).toHaveBeenCalled();
  });

  it('PUT delegates to setManual with adminId', async () => {
    const { controller, service } = make();
    const res = await controller.set('admin-1', { rate: '13000' });
    expect(service.setManual).toHaveBeenCalledWith('admin-1', '13000');
    expect(res.source).toBe('MANUAL');
  });

  it('POST refresh triggers a CBU fetch then returns current', async () => {
    const { controller, service } = make();
    await controller.refresh();
    expect(service.refreshFromCbu).toHaveBeenCalled();
    expect(service.getCurrent).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run, verify fail**

Run: `pnpm --filter @avino/api test -- admin-exchange-rate.controller`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement** — `admin-exchange-rate.controller.ts`:

```ts
import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateView } from './exchange-rate.types';
import { SetExchangeRateDto } from './dto/set-exchange-rate.dto';

@Controller({ path: 'admin/exchange-rate', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminExchangeRateController {
  constructor(private readonly service: ExchangeRateService) {}

  @Get()
  async get(): Promise<{ current: ExchangeRateView | null; history: ExchangeRateView[] }> {
    return { current: await this.service.getCurrent(), history: await this.service.listHistory() };
  }

  @Put()
  set(@CurrentUser('id') adminId: string, @Body() dto: SetExchangeRateDto): Promise<ExchangeRateView> {
    return this.service.setManual(adminId, dto.rate);
  }

  @Post('refresh')
  async refresh(): Promise<ExchangeRateView | null> {
    await this.service.refreshFromCbu();
    return this.service.getCurrent();
  }
}
```

Verify the import paths for `JwtAuthGuard`, `RolesGuard`, `Roles`, `CurrentUser` against an existing admin controller (`admin-promotion-settings.controller.ts`) and copy them exactly. Add `AdminExchangeRateController` to the module's `controllers`.

- [ ] **Step 5: Run, verify pass + full suite**

Run: `pnpm --filter @avino/api test -- admin-exchange-rate.controller && pnpm --filter @avino/api test`
Expected: PASS; no regressions in the full suite.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/exchange-rates/admin-exchange-rate.controller.ts apps/api/src/exchange-rates/admin-exchange-rate.controller.spec.ts apps/api/src/exchange-rates/dto/set-exchange-rate.dto.ts apps/api/src/exchange-rates/exchange-rate.module.ts
git commit -m "feat(api): admin exchange-rate endpoints (get/override/refresh)"
```

---

### Task 8: API docs

**Files:**
- Modify: `apps/api/docs/API.md` (or repo `docs/API.md` — match where routes are documented)

**Interfaces:** none (docs).

- [ ] **Step 1: Document the routes** — add a section:

```markdown
### Exchange rate

- `GET /api/v1/exchange-rate` — current USD→UZS rate `{ base, quote, rate, fetched_at, source }` (public, cacheable).
- `GET /api/v1/admin/exchange-rate` — current + recent history (ADMIN).
- `PUT /api/v1/admin/exchange-rate` — manual override `{ rate }` (ADMIN, audit-logged).
- `POST /api/v1/admin/exchange-rate/refresh` — trigger an immediate cbu.uz refresh (ADMIN).

Rate is refreshed daily by the `refresh_exchange_rate` repeatable job (default `0 6 * * *`, `Asia/Tashkent`).
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/docs/API.md
git commit -m "docs(api): document exchange-rate endpoints"
```

---

# PHASE 2 — CLIENT (apps/client)

### Task 9: RTK Query exchange-rate endpoint

**Files:**
- Create: `apps/client/src/store/api/exchangeRateApi.ts`

**Interfaces:**
- Produces: type `ExchangeRate = { base: 'USD'; quote: 'UZS'; rate: string; fetchedAt: string; source: 'CBU' | 'MANUAL' }`; hook `useGetExchangeRateQuery()`.

- [ ] **Step 1: Implement** — `exchangeRateApi.ts` (mirror `searchApi.ts` injection + snake→camel map):

```ts
import { baseApi } from './baseApi';

export interface ExchangeRate {
  base: 'USD';
  quote: 'UZS';
  rate: string;
  fetchedAt: string;
  source: 'CBU' | 'MANUAL';
}

interface ExchangeRateDto {
  base: 'USD';
  quote: 'UZS';
  rate: string;
  fetched_at: string;
  source: 'CBU' | 'MANUAL';
}

export const exchangeRateApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getExchangeRate: build.query<ExchangeRate, void>({
      query: () => ({ url: '/exchange-rate' }),
      transformResponse: (dto: ExchangeRateDto): ExchangeRate => ({
        base: dto.base,
        quote: dto.quote,
        rate: dto.rate,
        fetchedAt: dto.fetched_at,
        source: dto.source,
      }),
    }),
  }),
  overrideExisting: false,
});

export const { useGetExchangeRateQuery } = exchangeRateApi;
```

- [ ] **Step 2: Verify build**

Run: `pnpm --filter @avino/client exec tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/store/api/exchangeRateApi.ts
git commit -m "feat(client): RTK getExchangeRate endpoint"
```

---

### Task 10: Currency preference slice + hooks + hydration

**Files:**
- Create: `apps/client/src/store/currencySlice.ts`
- Create: `apps/client/src/lib/useCurrencyPreference.ts`
- Modify: `apps/client/src/store/store.ts` (register reducer — same file that registers `favorites`)
- Modify: `apps/client/src/store/StoreProvider.tsx` (add hydrator)
- Test: `apps/client/src/store/currencySlice.test.ts`

**Interfaces:**
- Produces: slice `currency` with `displayCurrency: 'UZS' | 'USD'`; actions `hydrateCurrency(value)`, `setCurrency(value)`; `readCurrencyFromStorage()`; hooks `useCurrencyPreference(): 'UZS' | 'USD'` and `useSetCurrency(): (c) => void`.

- [ ] **Step 1: Write failing test** — `currencySlice.test.ts`:

```ts
import reducer, { hydrateCurrency, setCurrency } from './currencySlice';

describe('currencySlice', () => {
  it('defaults to UZS', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({ displayCurrency: 'UZS' });
  });
  it('hydrate sets the value', () => {
    expect(reducer(undefined, hydrateCurrency('USD'))).toEqual({ displayCurrency: 'USD' });
  });
  it('setCurrency switches the value', () => {
    const s = reducer({ displayCurrency: 'UZS' }, setCurrency('USD'));
    expect(s.displayCurrency).toBe('USD');
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @avino/client test -- currencySlice`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the slice** — `currencySlice.ts` (mirror `favoritesSlice.ts` persistence):

```ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type DisplayCurrency = 'UZS' | 'USD';
const STORAGE_KEY = 'avino.displayCurrency';

export function readCurrencyFromStorage(): DisplayCurrency {
  if (typeof window === 'undefined') return 'UZS';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'USD' ? 'USD' : 'UZS';
  } catch {
    return 'UZS';
  }
}

function persist(value: DisplayCurrency): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode */
  }
}

interface CurrencyState {
  displayCurrency: DisplayCurrency;
}
const initialState: CurrencyState = { displayCurrency: 'UZS' };

const currencySlice = createSlice({
  name: 'currency',
  initialState,
  reducers: {
    hydrateCurrency(state, action: PayloadAction<DisplayCurrency>) {
      state.displayCurrency = action.payload;
    },
    setCurrency(state, action: PayloadAction<DisplayCurrency>) {
      state.displayCurrency = action.payload;
      persist(action.payload);
    },
  },
});

export const { hydrateCurrency, setCurrency } = currencySlice.actions;
export default currencySlice.reducer;
```

- [ ] **Step 4: Register reducer + hydrator** — in `store.ts`, add `currency: currencyReducer` next to `favorites`. In `StoreProvider.tsx`, add a `CurrencyHydrator` mirroring `FavoritesHydrator`:

```tsx
function CurrencyHydrator() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(hydrateCurrency(readCurrencyFromStorage()));
  }, [dispatch]);
  return null;
}
```

Render `<CurrencyHydrator/>` alongside `<FavoritesHydrator/>`.

- [ ] **Step 5: Implement hooks** — `useCurrencyPreference.ts`:

```ts
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setCurrency, type DisplayCurrency } from '../store/currencySlice';

export function useCurrencyPreference(): DisplayCurrency {
  return useAppSelector((s) => s.currency.displayCurrency);
}

export function useSetCurrency(): (c: DisplayCurrency) => void {
  const dispatch = useAppDispatch();
  return (c) => dispatch(setCurrency(c));
}
```

(Confirm the hooks file path `../store/hooks` matches the repo's `useAppSelector`/`useAppDispatch` exports.)

- [ ] **Step 6: Run tests + build**

Run: `pnpm --filter @avino/client test -- currencySlice && pnpm --filter @avino/client exec tsc --noEmit`
Expected: PASS; compiles.

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/store/currencySlice.ts apps/client/src/store/currencySlice.test.ts apps/client/src/lib/useCurrencyPreference.ts apps/client/src/store/store.ts apps/client/src/store/StoreProvider.tsx
git commit -m "feat(client): persisted display-currency preference (slice + hooks + hydrator)"
```

---

### Task 11: Conversion in format.ts

**Files:**
- Modify: `apps/client/src/lib/format.ts`
- Test: `apps/client/src/lib/format.currency.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: extended `FormatPriceOptions { suffix?, display?, rate? }`; `formatPrice(listing, t, opts)` and `pinPrice(listing, t, opts?)` now convert when `opts.display !== listing.currency && opts.rate > 0`. Helper `convertPrice(value, from, to, rate)` exported for the hook/tests.

- [ ] **Step 1: Add i18n key first** — in `messages/ru.json`, `uz.json`, `en.json` under `units`, add:
  - ru: `"approx": "≈"`
  - uz: `"approx": "≈"`
  - en: `"approx": "≈"`

  (The glyph is the same; it exists so the helper pulls it via `t('approx')` instead of hardcoding.)

- [ ] **Step 2: Write failing tests** — `format.currency.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';
import { formatPrice, convertPrice, type T } from './format';
import ru from '../../messages/ru.json';

const t = createTranslator({ locale: 'ru', messages: ru as Record<string, unknown>, namespace: 'units' }) as unknown as T;
const RATE = 12650;

describe('convertPrice', () => {
  it('USD→UZS multiplies', () => expect(convertPrice(100, 'USD', 'UZS', RATE)).toBe(1_265_000));
  it('UZS→USD divides', () => expect(convertPrice(1_265_000, 'UZS', 'USD', RATE)).toBe(100));
  it('same currency is identity', () => expect(convertPrice(50, 'USD', 'USD', RATE)).toBe(50));
});

describe('formatPrice with display currency', () => {
  const usd = { price: '98000', currency: 'USD' as const, tx: 'SALE' as const };
  const uzs = { price: '1450000', currency: 'UZS' as const, tx: 'SALE' as const };

  it('native currency shows exact (no ≈)', () => {
    expect(formatPrice(uzs, t, { display: 'UZS', rate: RATE })).not.toContain('≈');
    expect(formatPrice(uzs, t, { display: 'UZS', rate: RATE })).toContain('сум');
  });
  it('UZS listing shown in USD is converted, rounded to whole $, with ≈', () => {
    // 1 450 000 / 12650 = 114.6 → $115
    expect(formatPrice(uzs, t, { display: 'USD', rate: RATE })).toBe('≈ $115');
  });
  it('USD listing shown in UZS is converted, rounded to 1000, with ≈', () => {
    // 98000 * 12650 = 1 239 700 000 (already on 1000s)
    expect(formatPrice(usd, t, { display: 'UZS', rate: RATE })).toBe('≈ 1 239 700 000 сум');
  });
  it('falls back to native when rate is missing', () => {
    expect(formatPrice(uzs, t, { display: 'USD' })).not.toContain('≈');
  });
});
```

(Note: the space in the expected UZS string is a regular space in the test source; `Intl.NumberFormat('ru-RU')` emits a narrow no-break space. If the assertion fails purely on the separator, switch the test to `.replace(/\s/g, ' ')` normalization — keep the rounding/`≈` assertions intact.)

- [ ] **Step 3: Run, verify fail**

Run: `pnpm --filter @avino/client test -- format.currency`
Expected: FAIL — `convertPrice` not exported / output differs.

- [ ] **Step 4: Implement** — edit `format.ts`:

Extend the options interface:

```ts
export interface FormatPriceOptions {
  /** Добавлять суффикс «/мес» для аренды (по умолчанию true). */
  suffix?: boolean;
  /** Целевая валюта отображения; если ≠ нативной — конверт с «≈». */
  display?: Currency;
  /** Курс 1 USD = rate UZS. */
  rate?: number;
}

/** Конверсия суммы между валютами по курсу 1 USD = rate UZS. */
export function convertPrice(value: number, from: Currency, to: Currency, rate: number): number {
  if (from === to) return value;
  return from === 'USD' ? value * rate : value / rate;
}

/** Округление под валюту отображения: USD → целые $, UZS → до 1000. */
function roundForCurrency(value: number, currency: Currency): number {
  return currency === 'USD' ? Math.round(value) : Math.round(value / 1000) * 1000;
}
```

Rewrite the body of `formatPrice`:

```ts
export function formatPrice(
  listing: Pick<Listing, 'price' | 'currency' | 'tx'>,
  t: T,
  opts: FormatPriceOptions = {},
): string {
  const native = Number(listing.price);
  const convert =
    opts.display != null && opts.display !== listing.currency && !!opts.rate && opts.rate > 0;
  const target: Currency = convert ? opts.display! : listing.currency;
  const value = convert
    ? roundForCurrency(convertPrice(native, listing.currency, target, opts.rate!), target)
    : native;
  const money = target === 'USD' ? '$' + nf.format(value) : nf.format(value) + ' ' + t('sum');
  const body = (convert ? t('approx') + ' ' : '') + money;
  if (opts.suffix === false) return body;
  return listing.tx === 'RENT' ? body + t('perMonth') : body;
}
```

Extend `pinPrice` to accept the same `{ display, rate }` (3rd arg) and convert before bucketing:

```ts
export function pinPrice(
  listing: Pick<Listing, 'price' | 'currency'>,
  t: T,
  opts: { display?: Currency; rate?: number } = {},
): string {
  const convert =
    opts.display != null && opts.display !== listing.currency && !!opts.rate && opts.rate > 0;
  const target: Currency = convert ? opts.display! : listing.currency;
  const raw = convert
    ? convertPrice(Number(listing.price), listing.currency, target, opts.rate!)
    : Number(listing.price);
  const n = target === 'USD' ? Math.round(raw) : raw;
  const approx = convert ? t('approx') + ' ' : '';
  if (target === 'USD') {
    if (n >= 1000) return approx + '$' + trim(n / 1000) + 'K';
    return approx + '$' + trim(n);
  }
  if (n >= 1e9) return approx + trim(n / 1e9) + ' ' + t('billion');
  if (n >= 1e6) return approx + trim(n / 1e6) + ' ' + t('million');
  if (n >= 1e3) return approx + trim(n / 1e3) + 'K';
  return approx + trim(n);
}
```

- [ ] **Step 5: Run, verify pass (and the existing `format.test.ts` stays green)**

Run: `pnpm --filter @avino/client test -- format`
Expected: PASS for both `format.test.ts` and `format.currency.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/lib/format.ts apps/client/src/lib/format.currency.test.ts apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "feat(client): currency conversion in formatPrice/pinPrice with ≈ marker"
```

---

### Task 12: usePriceFormatter hook + route call sites

**Files:**
- Create: `apps/client/src/lib/usePriceFormatter.ts`
- Modify: `apps/client/src/features/search/PropertyCard.tsx`
- Modify: `apps/client/src/features/detail/Detail.tsx`
- Modify: `apps/client/src/features/account/MyListings.tsx`
- Modify: `apps/client/src/features/map/MapView.tsx`

**Interfaces:**
- Consumes: `useCurrencyPreference` (Task 10), `useGetExchangeRateQuery` (Task 9), `formatPrice`/`pinPrice` (Task 11), `useTranslations('units')`.
- Produces: `usePriceFormatter(): { price(listing, opts?), pin(listing), display }`.

- [ ] **Step 1: Implement the hook** — `usePriceFormatter.ts`:

```ts
import { useTranslations } from 'next-intl';
import type { Listing } from './mock/types';
import { formatPrice, pinPrice, type FormatPriceOptions } from './format';
import { useCurrencyPreference } from './useCurrencyPreference';
import { useGetExchangeRateQuery } from '../store/api/exchangeRateApi';

export function usePriceFormatter() {
  const t = useTranslations('units');
  const display = useCurrencyPreference();
  const { data } = useGetExchangeRateQuery();
  const rate = data ? Number(data.rate) : undefined;

  return {
    display,
    price: (
      listing: Pick<Listing, 'price' | 'currency' | 'tx'>,
      opts: Omit<FormatPriceOptions, 'display' | 'rate'> = {},
    ) => formatPrice(listing, t, { ...opts, display, rate }),
    pin: (listing: Pick<Listing, 'price' | 'currency'>) =>
      pinPrice(listing, t, { display, rate }),
  };
}
```

- [ ] **Step 2: Route PropertyCard** — replace `const tUnits = useTranslations('units')` + `formatPrice(listing, tUnits)` with:

```tsx
const fmt = usePriceFormatter();
// ...
{fmt.price(listing)}
```

Remove the now-unused `tUnits`/`formatPrice` import if nothing else uses them in the file.

- [ ] **Step 3: Route Detail.tsx** — same swap: `usePriceFormatter()` → `fmt.price(listing)`.

- [ ] **Step 4: Route MyListings.tsx** — same swap for its `formatPrice` call(s).

- [ ] **Step 5: Route MapView pins** — `pinPrice` is called inside the non-React `pinHTML` string builder. Get the formatter at the component top level and pass the precomputed price string in:
  - In the `MapView` component body: `const fmt = usePriceFormatter();`
  - Where pins/placemarks are built (the `.map` over listings that calls `pinHTML`), compute `const priceText = fmt.pin(listing);` and pass `priceText` into `pinHTML(...)`, replacing the internal `pinPrice(listing, t)` call with the passed-in string. Adjust `pinHTML`'s signature to accept `priceText: string`.

- [ ] **Step 6: Build + manual check**

Run: `pnpm --filter @avino/client exec tsc --noEmit && pnpm --filter @avino/client build`
Expected: compiles and builds (use raw `next build` if `rtk next build` reports a false error — see project note).

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/lib/usePriceFormatter.ts apps/client/src/features/search/PropertyCard.tsx apps/client/src/features/detail/Detail.tsx apps/client/src/features/account/MyListings.tsx apps/client/src/features/map/MapView.tsx
git commit -m "feat(client): route price call sites through usePriceFormatter"
```

---

### Task 13: CurrencySwitcher in the header

**Files:**
- Create: `apps/client/src/components/layout/CurrencySwitcher.tsx`
- Modify: `apps/client/src/components/layout/Header.tsx`
- Modify: `apps/client/messages/{ru,uz,en}.json` (switcher labels)

**Interfaces:**
- Consumes: `useCurrencyPreference`, `useSetCurrency`, `useTranslations('nav')`.
- Produces: `<CurrencySwitcher/>` rendered next to `<LangSwitcher/>`.

- [ ] **Step 1: Add i18n labels** — under a `nav` namespace in all three message files:
  - ru: `"currencyUZS": "сум", "currencyUSD": "$", "currencyLabel": "Валюта"`
  - uz: `"currencyUZS": "so'm", "currencyUSD": "$", "currencyLabel": "Valyuta"`
  - en: `"currencyUZS": "UZS", "currencyUSD": "$", "currencyLabel": "Currency"`

  (Confirm the `nav` namespace exists; if labels for the header live in another namespace, add them there for parity.)

- [ ] **Step 2: Implement the switcher** — `CurrencySwitcher.tsx` (segmented control, matches the lightweight `LangSwitcher` styling):

```tsx
'use client';
import { useTranslations } from 'next-intl';
import { useCurrencyPreference, useSetCurrency } from '../../lib/useCurrencyPreference';

export function CurrencySwitcher() {
  const t = useTranslations('nav');
  const display = useCurrencyPreference();
  const setCurrency = useSetCurrency();

  return (
    <div className="inline-flex items-center rounded-full border border-black/10 p-0.5 text-sm" aria-label={t('currencyLabel')}>
      <button
        type="button"
        aria-pressed={display === 'UZS'}
        className={display === 'UZS' ? 'rounded-full bg-black/90 px-2.5 py-0.5 text-white' : 'px-2.5 py-0.5 text-black/60'}
        onClick={() => setCurrency('UZS')}
      >
        {t('currencyUZS')}
      </button>
      <button
        type="button"
        aria-pressed={display === 'USD'}
        className={display === 'USD' ? 'rounded-full bg-black/90 px-2.5 py-0.5 text-white' : 'px-2.5 py-0.5 text-black/60'}
        onClick={() => setCurrency('USD')}
      >
        {t('currencyUSD')}
      </button>
    </div>
  );
}
```

(Match the surrounding Tailwind tokens used by `LangSwitcher`/`Header` — colors/radius may differ; copy the file's conventions rather than these literal classes if they clash.)

- [ ] **Step 3: Mount in Header** — in `Header.tsx`, in the desktop actions row (where `<LangSwitcher />` is rendered, ~line 122), add `<CurrencySwitcher />` immediately before `<LangSwitcher />`. Add the import.

- [ ] **Step 4: Build + visual check**

Run: `pnpm --filter @avino/client exec tsc --noEmit`
Then per the project screenshot recipe (Chrome headless, client on :3001) confirm the `[сум | $]` toggle renders in the header and flips card prices.
Expected: toggle visible; clicking `$` converts visible prices with `≈`, persists across reload.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/components/layout/CurrencySwitcher.tsx apps/client/src/components/layout/Header.tsx apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "feat(client): header currency switcher [сум | $]"
```

---

### Task 14: Bind currency in the price filter

**Files:**
- Modify: `apps/client/src/features/search/FilterBar.tsx`
- Modify: `apps/client/src/store/api/searchApi.ts`
- Modify: the `ListingFilter` type (where `priceMin`/`priceMax` are declared — likely `apps/client/src/store/api/searchApi.ts` or a `types` file)

**Interfaces:**
- Consumes: `useCurrencyPreference`.
- Produces: when a price bound is present, the search request includes `currency=<displayCurrency>`; otherwise it is omitted.

- [ ] **Step 1: Add `currency` to the filter type** — add `currency?: 'UZS' | 'USD'` to `ListingFilter`.

- [ ] **Step 2: Send it conditionally in the params builder** — in `searchApi.ts` `filterParams()`, after the price lines add:

```ts
if (filter.currency && (filter.priceMin != null || filter.priceMax != null)) {
  params.currency = filter.currency;
}
```

(The backend already accepts `currency` and filters per native currency — no API change.)

- [ ] **Step 3: Feed display currency into the filter** — in `FilterBar.tsx`, read `const displayCurrency = useCurrencyPreference();` and include `currency: displayCurrency` when building the `ListingFilter` passed to the search query. Also label the price inputs with the active symbol: pass `currency` into the `priceFrom`/`priceTo` placeholders or add a small adornment (`$`/`сум`) next to the price dropdown trigger using `displayCurrency`.

- [ ] **Step 4: Build**

Run: `pnpm --filter @avino/client exec tsc --noEmit`
Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/search/FilterBar.tsx apps/client/src/store/api/searchApi.ts
git commit -m "feat(client): scope price filter to display currency when a bound is set"
```

---

# PHASE 3 — ADMIN WEB (apps/web)

### Task 15: Admin RTK endpoints

**Files:**
- Create: `apps/web/src/store/api/adminExchangeRateApi.ts`

**Interfaces:**
- Produces: `useGetAdminExchangeRateQuery()`, `useSetExchangeRateMutation()`, `useRefreshExchangeRateMutation()`; types `AdminExchangeRate`, `AdminExchangeRateView { current, history }`.

- [ ] **Step 1: Implement** — `adminExchangeRateApi.ts` (mirror `adminTelegramSettingsApi.ts`):

```ts
import { adminApi } from './adminApi';

export interface ExchangeRateRow {
  base: 'USD';
  quote: 'UZS';
  rate: string;
  fetched_at: string;
  source: 'CBU' | 'MANUAL';
}
export interface AdminExchangeRateView {
  current: ExchangeRateRow | null;
  history: ExchangeRateRow[];
}

export const adminExchangeRateApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    getAdminExchangeRate: build.query<AdminExchangeRateView, void>({
      query: () => ({ url: '/admin/exchange-rate' }),
      providesTags: ['Admin'],
    }),
    setExchangeRate: build.mutation<ExchangeRateRow, { rate: string }>({
      query: (body) => ({ url: '/admin/exchange-rate', method: 'PUT', body }),
      invalidatesTags: ['Admin'],
    }),
    refreshExchangeRate: build.mutation<ExchangeRateRow | null, void>({
      query: () => ({ url: '/admin/exchange-rate/refresh', method: 'POST' }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetAdminExchangeRateQuery,
  useSetExchangeRateMutation,
  useRefreshExchangeRateMutation,
} = adminExchangeRateApi;
```

(Confirm `'Admin'` is in `adminApi`/`baseApi` `tagTypes`; if not, use the tag the other admin settings endpoints use.)

- [ ] **Step 2: Build**

Run: `pnpm --filter @avino/web exec tsc --noEmit`
Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/store/api/adminExchangeRateApi.ts
git commit -m "feat(web): admin exchange-rate RTK endpoints"
```

---

### Task 16: Exchange-rate admin panel

**Files:**
- Create: `apps/web/src/components/admin/ExchangeRatePanel.tsx`
- Modify: `apps/web/src/app/admin/settings/page.tsx` (replace the static "Курс USD → сум" input)

**Interfaces:**
- Consumes: Task 15 hooks.
- Produces: `<ExchangeRatePanel/>`.

- [ ] **Step 1: Implement the panel** — `ExchangeRatePanel.tsx` (mirror `TelegramNotificationsToggle.tsx` card style):

```tsx
'use client';
import { useState } from 'react';
import {
  useGetAdminExchangeRateQuery,
  useSetExchangeRateMutation,
  useRefreshExchangeRateMutation,
} from '../../store/api/adminExchangeRateApi';

export function ExchangeRatePanel() {
  const { data, isLoading } = useGetAdminExchangeRateQuery();
  const [setRate, { isLoading: isSaving }] = useSetExchangeRateMutation();
  const [refresh, { isLoading: isRefreshing }] = useRefreshExchangeRateMutation();
  const [draft, setDraft] = useState('');

  const current = data?.current;

  return (
    <div className="a-card" style={{ padding: 24, maxWidth: 640, marginTop: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 14.5 }}>Курс USD → сум</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
        {isLoading
          ? '…'
          : current
            ? `1 USD = ${current.rate} сум · ${current.source} · ${new Date(current.fetched_at).toLocaleString('ru-RU')}`
            : 'Курс ещё не загружен'}
      </div>

      <div className="row gap-16" style={{ marginTop: 12, alignItems: 'center' }}>
        <input
          className="a-field"
          inputMode="decimal"
          placeholder="Напр. 12700"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          className="abtn abtn-primary"
          disabled={isSaving || !draft.trim()}
          onClick={async () => {
            await setRate({ rate: draft.trim() });
            setDraft('');
          }}
        >
          {isSaving ? '…' : 'Задать вручную'}
        </button>
        <button
          type="button"
          className="abtn"
          disabled={isRefreshing}
          onClick={() => void refresh()}
        >
          {isRefreshing ? '…' : 'Обновить из ЦБ'}
        </button>
      </div>

      {data?.history?.length ? (
        <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--muted)' }}>
          {data.history.slice(0, 7).map((r, i) => (
            <div key={i}>
              {new Date(r.fetched_at).toLocaleDateString('ru-RU')} — {r.rate} ({r.source})
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Replace the static input** — in `settings/page.tsx`, remove the hardcoded `<label>Курс USD → сум</label><input ... defaultValue="12 700" />` block and render `<ExchangeRatePanel />` (place it next to `<SmsSendingToggle />` / `<TelegramNotificationsToggle />`). Add the import.

- [ ] **Step 3: Build + manual check**

Run: `pnpm --filter @avino/web exec tsc --noEmit`
Then load `/admin/settings` (web), confirm the panel shows the current rate, the "Обновить из ЦБ" button updates it, and a manual value sticks.
Expected: live rate shown; refresh + manual override both work.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/ExchangeRatePanel.tsx apps/web/src/app/admin/settings/page.tsx
git commit -m "feat(web): exchange-rate admin panel (current/history/override/refresh)"
```

---

# PHASE 4 — Finalize

### Task 17: ADR + DONE.md + spec status (in the feature PR)

**Files:**
- Create: `docs/adr/ADR-00XX-currency-display-exchange-rate.md` (next free number — check `docs/adr/` for the highest)
- Modify: `docs/DONE.md`
- Modify: `docs/superpowers/specs/2026-06-19-currency-display-exchange-rate-design.md` (status → done)

**Interfaces:** none.

- [ ] **Step 1: Write the ADR** — context (mixed-currency listings hard to compare), decision (daily cbu.uz cron → ExchangeRate table with history + manual override → public GET → client display toggle; display-only, search untouched; cross-currency filter deferred to Phase 2), consequences (approximate `≈` values; admin override sticky until next CBU run; new env vars). Reference the spec and plan paths.

- [ ] **Step 2: Add the DONE.md entry** — one line summarizing the feature + ADR number + PR (fill PR after opening).

- [ ] **Step 3: Flip the spec status** — change the spec header `Статус:` to `реализовано (ADR-00XX, PR #NNN)`.

- [ ] **Step 4: Commit**

```bash
git add docs/adr docs/DONE.md docs/superpowers/specs/2026-06-19-currency-display-exchange-rate-design.md
git commit -m "docs(adr): record currency-display exchange-rate decision + DONE"
```

- [ ] **Step 5: Open the PR** (controller, using the gh token per project CLAUDE.md; never print the token):

```bash
git push -u origin feat/currency-display-exchange-rate
gh pr create --base main --title "feat: daily USD/UZS rate + currency display toggle" --body "<summary, link spec + ADR, note display-only scope and Phase-2 cross-currency filter>"
```

Expected: PR opened against `main`. The user merges (main is protected; do not `--admin`).

---

## Self-Review

**Spec coverage:**
- §3.2 model → Task 1 ✓ · §3.3 service+cron → Tasks 3,4,5 ✓ · §3.4 endpoints → Tasks 6,7 ✓ · §3.5 client (RTK, preference, format, hook, switcher) → Tasks 9–13 ✓ · §3.6 filter binding → Task 14 ✓ · §3.7 admin panel → Tasks 15,16 ✓ · §4 error handling (fail→keep last, cold start, missing-rate fallback, ≈) → Tasks 4,5,6,11 ✓ · §5 tests (api jest + client vitest) → Tasks 3,4,6,7,10,11 ✓ · §6 env → Task 2 ✓ · §7 ADR/DONE/finalize → Task 17 ✓. No gaps.
- Phase-2 cross-currency SQL filter is intentionally out of scope (documented in §3.6 and ADR), not a missing task.

**Placeholder scan:** No "TBD/handle errors/similar to Task N". Every code step shows code. The `<ts>` in migration paths is Prisma's generated timestamp, not a placeholder to fill. The `ADR-00XX`/`#NNN` are resolved at finalize time (Task 17 steps say how).

**Type consistency:** API wire shape is snake_case (`fetched_at`) everywhere (service `toView`, public controller, admin view, web `ExchangeRateRow`); client RTK `transformResponse` maps to camel `fetchedAt` only inside apps/client. `convertPrice(value, from, to, rate)` signature identical in format.ts (Task 11) and consumed by usePriceFormatter (Task 12). `ExchangeRateService` method names (`getCurrent`/`refreshFromCbu`/`setManual`/`listHistory`) match across Tasks 4, 5, 6, 7. `setCurrency`/`hydrateCurrency`/`displayCurrency` consistent across Tasks 10, 12, 13, 14.
