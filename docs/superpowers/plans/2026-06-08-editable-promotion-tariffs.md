# Editable Promotion Tariffs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the hardcoded VIP/TOP tariff catalog into an admin-editable DB table, add admin endpoints + UI to edit prices and toggle plans, and let the admin pick the promo-expiry check interval (6h/12h) from the panel.

**Architecture:** New Prisma tables `promotion_plans` (6 fixed rows, editable price/isActive) and `app_settings` (key/value, holds the expiry cron). A DB-backed `PromotionPlansService` replaces the static catalog in the public plans endpoint and in admin activate/extend. New admin controllers expose plan editing and interval selection; interval changes re-register the BullMQ repeatable job at runtime. Price snapshots in `listing_promotions.price` mean editing a plan never affects active promotions. All changes audited via existing `audit_logs`.

**Tech Stack:** NestJS + Prisma (PostgreSQL) + BullMQ (apps/api); Next.js + RTK Query + TailAdmin (apps/web). Jest unit tests with mocked `PrismaService` (existing convention).

> **Test runner:** `apps/api` uses **jest** (`apps/api/package.json` → `"test": "jest"`). Run single specs with `cd apps/api && npx jest <relative-path>`. (The steps below say `rtk vitest run` as shorthand — substitute `npx jest` for the api package.)
>
> **ApiErrorCode import:** lives at `../common/dto/error-response.dto` (NOT `@avino/shared`); `NOT_FOUND` and `INVALID_PERIOD` are present there. Use `import { ApiErrorCode } from '../common/dto/error-response.dto';`.

---

## File Structure

**Backend (apps/api):**
- `prisma/schema.prisma` — add `PromotionPlan`, `AppSetting` models (modify)
- `prisma/migrations/20260608120000_add_promotion_plans_settings/migration.sql` — create tables + CHECK constraints + seed (create)
- `prisma/seed.ts` — idempotent seed of 6 plans + default interval (modify)
- `src/promotions/promotion-plans.service.ts` — DB-backed catalog: `listPlans`, `findPlan` (create)
- `src/promotions/promotion-plans.service.spec.ts` — unit tests (create)
- `src/promotions/promotions.service.ts` — `getPlans()` reads DB, active only (modify, becomes async)
- `src/promotions/admin-promotions.service.ts` — `activate`/`extend` use async `findPlan` (modify)
- `src/promotions/promotions.catalog.ts` — keep only as seed source constant; remove runtime `findPlan` export usage (modify)
- `src/promotions/promotions.module.ts` + `index.ts` — register/export new service (modify)
- `src/admin/dto/update-promotion-plan.dto.ts` — `{ price?, isActive? }` (create)
- `src/admin/dto/update-promotion-settings.dto.ts` — `{ expiryIntervalHours: 6|12 }` (create)
- `src/admin/admin-promotion-plans.controller.ts` — GET/PATCH plans (create)
- `src/admin/admin-promotion-plans.service.ts` — list/update plan + audit (create)
- `src/admin/admin-promotion-plans.service.spec.ts` — unit tests (create)
- `src/admin/admin-promotion-settings.controller.ts` — GET/PATCH interval (create)
- `src/admin/admin-promotion-settings.service.ts` — read/write app_setting + reschedule + audit (create)
- `src/admin/admin-promotion-settings.service.spec.ts` — unit tests (create)
- `src/admin/admin.module.ts` — register controllers/services (modify)
- `src/promotions/promotion-expiry.cron.ts` — preset↔cron mapping constants (create)
- `src/queues/promotion.queue.ts` — `rescheduleExpiry(cron)` + read interval from DB on init (modify)

**Frontend (apps/web):**
- `src/store/api/adminTypes.ts` — `PromotionPlan`, `PromotionSettings` types (modify)
- `src/store/api/adminPromotionsApi.ts` — 4 new endpoints (modify)
- `src/app/(admin)/admin/promotions/page.tsx` — tariffs table + interval selector (create)
- `src/components/admin/PromotionPlansTable.tsx` — editable 6-row table (create)
- `src/components/admin/PromotionSettingsCard.tsx` — 6h/12h selector (create)
- `src/lib/i18n/messages/promotions.ts` — RU/UZ/EN keys (modify)

**Docs:** `docs/API.md` (§15), `docs/DB_SCHEMA.md`, `docs/adr/ADR-00XX-editable-promotion-plans.md`, `docs/DONE.md`.

---

## Task 1: Prisma models + migration + seed

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260608120000_add_promotion_plans_settings/migration.sql`
- Modify: `apps/api/prisma/seed.ts`

- [ ] **Step 1: Add models to schema.prisma**

Append after the `PromotionLog` model:

```prisma
model PromotionPlan {
  id         String        @id @default(uuid()) @db.Uuid
  type       PromotionType
  periodDays Int           @map("period_days") @db.SmallInt
  price      Decimal       @db.Decimal(14, 2)
  currency   Currency      @default(UZS)
  isActive   Boolean       @default(true) @map("is_active")
  createdAt  DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([type, periodDays])
  @@map("promotion_plans")
}

model AppSetting {
  key       String   @id @db.VarChar(80)
  value     String   @db.VarChar(255)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@map("app_settings")
}
```

- [ ] **Step 2: Create the migration SQL**

Create `apps/api/prisma/migrations/20260608120000_add_promotion_plans_settings/migration.sql`:

```sql
-- promotion_plans: admin-editable tariff matrix (fixed 6 rows enforced by CHECK)
CREATE TABLE "promotion_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" "PromotionType" NOT NULL,
  "period_days" SMALLINT NOT NULL,
  "price" DECIMAL(14,2) NOT NULL,
  "currency" "Currency" NOT NULL DEFAULT 'UZS',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "promotion_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotion_plans_type_check" CHECK ("type" IN ('TOP','VIP')),
  CONSTRAINT "promotion_plans_period_check" CHECK ("period_days" IN (7,14,30))
);
CREATE UNIQUE INDEX "promotion_plans_type_period_days_key"
  ON "promotion_plans" ("type","period_days");

-- Seed the 6 plans with current catalog prices (idempotent).
INSERT INTO "promotion_plans" ("id","type","period_days","price","currency","is_active","updated_at") VALUES
  (gen_random_uuid(),'TOP',7,'50000.00','UZS',true,now()),
  (gen_random_uuid(),'TOP',14,'90000.00','UZS',true,now()),
  (gen_random_uuid(),'TOP',30,'150000.00','UZS',true,now()),
  (gen_random_uuid(),'VIP',7,'120000.00','UZS',true,now()),
  (gen_random_uuid(),'VIP',14,'210000.00','UZS',true,now()),
  (gen_random_uuid(),'VIP',30,'350000.00','UZS',true,now())
ON CONFLICT ("type","period_days") DO NOTHING;

-- app_settings: generic key/value; seed the expiry interval (12h default).
CREATE TABLE "app_settings" (
  "key" VARCHAR(80) NOT NULL,
  "value" VARCHAR(255) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
INSERT INTO "app_settings" ("key","value","updated_at")
  VALUES ('promotion_expiry_cron','0 */12 * * *', now())
ON CONFLICT ("key") DO NOTHING;
```

- [ ] **Step 3: Make seed.ts idempotently seed plans + setting**

Add to `apps/api/prisma/seed.ts` inside `main()` after roles, and import `PromotionType`, `Currency`:

```typescript
import { PrismaClient, PromotionType, Currency } from '@prisma/client';

const PLAN_SEED = [
  { type: PromotionType.TOP, periodDays: 7, price: '50000.00' },
  { type: PromotionType.TOP, periodDays: 14, price: '90000.00' },
  { type: PromotionType.TOP, periodDays: 30, price: '150000.00' },
  { type: PromotionType.VIP, periodDays: 7, price: '120000.00' },
  { type: PromotionType.VIP, periodDays: 14, price: '210000.00' },
  { type: PromotionType.VIP, periodDays: 30, price: '350000.00' },
];

for (const p of PLAN_SEED) {
  await prisma.promotionPlan.upsert({
    where: { type_periodDays: { type: p.type, periodDays: p.periodDays } },
    update: {},
    create: { ...p, currency: Currency.UZS, isActive: true },
  });
}

await prisma.appSetting.upsert({
  where: { key: 'promotion_expiry_cron' },
  update: {},
  create: { key: 'promotion_expiry_cron', value: '0 */12 * * *' },
});
```

- [ ] **Step 4: Apply migration + regenerate client**

Run: `cd apps/api && rtk prisma migrate dev --name add_promotion_plans_settings && rtk prisma generate`
Expected: migration applied, `PromotionPlan`/`AppSetting` available on the Prisma client.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(db): add promotion_plans + app_settings tables with seed"
```

---

## Task 2: PromotionPlansService (DB-backed catalog)

**Files:**
- Create: `apps/api/src/promotions/promotion-plans.service.ts`
- Test: `apps/api/src/promotions/promotion-plans.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/promotions/promotion-plans.service.spec.ts`:

```typescript
import { Currency, PromotionType } from '@prisma/client';
import { PromotionPlansService } from './promotion-plans.service';

function makePlan(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'p1',
    type: PromotionType.TOP,
    periodDays: 7,
    price: { toFixed: () => '50000.00' },
    currency: Currency.UZS,
    isActive: true,
    ...over,
  };
}

describe('PromotionPlansService', () => {
  const prisma = { promotionPlan: { findMany: jest.fn(), findFirst: jest.fn() } };
  let service: PromotionPlansService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new PromotionPlansService(prisma as never);
  });

  it('listPlans({activeOnly:true}) filters by isActive', async () => {
    prisma.promotionPlan.findMany.mockResolvedValue([makePlan()]);
    const plans = await service.listPlans({ activeOnly: true });
    expect(prisma.promotionPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].price).toBe('50000.00');
    expect(plans[0].period_days).toBe(7);
  });

  it('findPlan returns active plan, null when inactive/missing', async () => {
    prisma.promotionPlan.findFirst.mockResolvedValue(makePlan());
    const hit = await service.findPlan(PromotionType.TOP, 7);
    expect(prisma.promotionPlan.findFirst).toHaveBeenCalledWith({
      where: { type: PromotionType.TOP, periodDays: 7, isActive: true },
    });
    expect(hit?.price).toBe('50000.00');

    prisma.promotionPlan.findFirst.mockResolvedValue(null);
    expect(await service.findPlan(PromotionType.VIP, 99)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && rtk vitest run src/promotions/promotion-plans.service.spec.ts` (use `npx jest` if the project uses jest — check `apps/api/package.json` test script first)
Expected: FAIL — `PromotionPlansService` not found.

- [ ] **Step 3: Write the service**

Create `apps/api/src/promotions/promotion-plans.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { Currency, PromotionType } from '@prisma/client';
import { PrismaService } from '../prisma';

/** Публичная форма плана (snake_case, Decimal как строка) — контракт API.md §15. */
export interface PromotionPlanView {
  type: PromotionType;
  period_days: number;
  price: string;
  currency: Currency;
}

/**
 * PromotionPlansService — каталог промо-планов из БД (`promotion_plans`).
 * Заменяет статический PROMOTION_PLANS: цена редактируема админом, поэтому
 * единственный источник истины — таблица. `findPlan` отдаёт только активный план
 * (неактивный = нельзя купить новую промо этой комбинации).
 */
@Injectable()
export class PromotionPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans({ activeOnly }: { activeOnly: boolean }): Promise<PromotionPlanView[]> {
    const rows = await this.prisma.promotionPlan.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ type: 'asc' }, { periodDays: 'asc' }],
    });
    return rows.map((r) => ({
      type: r.type,
      period_days: r.periodDays,
      price: r.price.toFixed(2),
      currency: r.currency,
    }));
  }

  async findPlan(type: PromotionType, periodDays: number): Promise<PromotionPlanView | null> {
    const r = await this.prisma.promotionPlan.findFirst({
      where: { type, periodDays, isActive: true },
    });
    if (!r) return null;
    return { type: r.type, period_days: r.periodDays, price: r.price.toFixed(2), currency: r.currency };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && rtk vitest run src/promotions/promotion-plans.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Register in module + export**

Modify `apps/api/src/promotions/promotions.module.ts` — add `PromotionPlansService` to `providers` and `exports`. Modify `apps/api/src/promotions/index.ts` — add:

```typescript
export { PromotionPlansService, PromotionPlanView } from './promotion-plans.service';
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/promotions
git commit -m "feat(api): DB-backed PromotionPlansService"
```

---

## Task 3: Wire DB catalog into public + admin flows

**Files:**
- Modify: `apps/api/src/promotions/promotions.service.ts`
- Modify: `apps/api/src/promotions/admin-promotions.service.ts`
- Modify: `apps/api/src/promotions/promotions.service.spec.ts`

- [ ] **Step 1: Update public plans service to read DB (async)**

Replace body of `apps/api/src/promotions/promotions.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PromotionPlansService, PromotionPlanView } from './promotion-plans.service';

export interface PromotionPlansResponse {
  plans: PromotionPlanView[];
}

@Injectable()
export class PromotionsService {
  constructor(private readonly plans: PromotionPlansService) {}

  /** Публичный каталог: только активные планы. */
  async getPlans(): Promise<PromotionPlansResponse> {
    return { plans: await this.plans.listPlans({ activeOnly: true }) };
  }
}
```

Also make `apps/api/src/promotions/promotions.controller.ts` `getPlans()` `async`/awaited (it already returns the service call — confirm the return type is `Promise<PromotionPlansResponse>`).

- [ ] **Step 2: Replace static findPlan in admin-promotions.service.ts**

In `apps/api/src/promotions/admin-promotions.service.ts`:
- Remove the import `import { findPlan } from './promotions.catalog';`
- Inject `PromotionPlansService` in the constructor as `private readonly plans: PromotionPlansService` (add import from `./promotion-plans.service`).
- At line ~99 (`activate`): change `const plan = findPlan(dto.type, dto.period_days);` to `const plan = await this.plans.findPlan(dto.type, dto.period_days);`.
- At line ~314 (`extend`): change `if (!findPlan(promotion.type, dto.period_days)) {` to `if (!(await this.plans.findPlan(promotion.type, dto.period_days))) {`.

- [ ] **Step 3: Update the public-plans unit test for DB source**

Rewrite `apps/api/src/promotions/promotions.service.spec.ts` to mock `PromotionPlansService`:

```typescript
import { Currency, PromotionType } from '@prisma/client';
import { PromotionsService } from './promotions.service';

describe('PromotionsService', () => {
  const plansSvc = { listPlans: jest.fn() };
  let service: PromotionsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new PromotionsService(plansSvc as never);
  });

  it('returns only active plans from PromotionPlansService', async () => {
    plansSvc.listPlans.mockResolvedValue([
      { type: PromotionType.TOP, period_days: 7, price: '50000.00', currency: Currency.UZS },
    ]);
    const { plans } = await service.getPlans();
    expect(plansSvc.listPlans).toHaveBeenCalledWith({ activeOnly: true });
    expect(plans).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Fix admin-promotions.service.spec.ts constructor + findPlan mocks**

In `apps/api/src/promotions/admin-promotions.service.spec.ts`, add a `plans` mock `{ findPlan: jest.fn().mockResolvedValue({ type, period_days, price, currency }) }`, pass it to the `AdminPromotionsService` constructor, and ensure `findPlan` resolves a plan for valid periods and `null` for invalid-period assertions (replacing reliance on the static catalog).

- [ ] **Step 5: Run the promotions test suite**

Run: `cd apps/api && rtk vitest run src/promotions`
Expected: PASS (all promotions specs green).

- [ ] **Step 6: Remove runtime catalog export, keep seed constant only**

In `apps/api/src/promotions/index.ts` remove `findPlan` from the catalog export line, leaving `export { PROMOTION_PLANS, PromotionPlan } from './promotions.catalog';` (kept only as a reference/seed constant). Confirm no remaining runtime import of `findPlan` via: `cd apps/api && grep -rn "findPlan" src | grep -v spec | grep -v promotion-plans.service`.
Expected: only definitions in `promotion-plans.service.ts`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/promotions
git commit -m "refactor(api): public + admin promo flows read plans from DB"
```

---

## Task 4: Admin promotion-plans endpoints (edit price / toggle)

**Files:**
- Create: `apps/api/src/admin/dto/update-promotion-plan.dto.ts`
- Create: `apps/api/src/admin/admin-promotion-plans.service.ts`
- Create: `apps/api/src/admin/admin-promotion-plans.controller.ts`
- Test: `apps/api/src/admin/admin-promotion-plans.service.spec.ts`
- Modify: `apps/api/src/admin/admin.module.ts`

- [ ] **Step 1: Write the DTO**

Create `apps/api/src/admin/dto/update-promotion-plan.dto.ts`:

```typescript
import { IsBoolean, IsOptional, Matches } from 'class-validator';

/** Тело `PATCH /admin/promotion-plans/:id`. price — Decimal-строка > 0. */
export class UpdatePromotionPlanDto {
  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'price must be a positive decimal' })
  price?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

- [ ] **Step 2: Write the failing service test**

Create `apps/api/src/admin/admin-promotion-plans.service.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { Currency, PromotionType } from '@prisma/client';
import { AdminPromotionPlansService } from './admin-promotion-plans.service';

describe('AdminPromotionPlansService', () => {
  const prisma = {
    promotionPlan: { findUnique: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: AdminPromotionPlansService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(async (cb: never) =>
      (cb as (t: typeof prisma) => unknown)(prisma),
    );
    service = new AdminPromotionPlansService(prisma as never);
  });

  it('updatePlan writes new price and an audit log with old→new', async () => {
    const existing = {
      id: 'p1', type: PromotionType.TOP, periodDays: 7,
      price: { toFixed: () => '50000.00' }, currency: Currency.UZS, isActive: true,
    };
    prisma.promotionPlan.findUnique.mockResolvedValue(existing);
    prisma.promotionPlan.update.mockResolvedValue({
      ...existing, price: { toFixed: () => '60000.00' },
    });

    await service.updatePlan('admin1', 'p1', { price: '60000.00' });

    expect(prisma.promotionPlan.update).toHaveBeenCalledWith({
      where: { id: 'p1' }, data: { price: '60000.00' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'PROMOTION_PLAN_UPDATE',
          entityType: 'promotion_plan',
          entityId: 'p1',
          metadata: expect.objectContaining({ old_price: '50000.00', new_price: '60000.00' }),
        }),
      }),
    );
  });

  it('updatePlan throws 404 for unknown id', async () => {
    prisma.promotionPlan.findUnique.mockResolvedValue(null);
    await expect(service.updatePlan('a', 'nope', { price: '1.00' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && rtk vitest run src/admin/admin-promotion-plans.service.spec.ts`
Expected: FAIL — service not found.

- [ ] **Step 4: Write the service**

Create `apps/api/src/admin/admin-promotion-plans.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { PromotionPlansService, PromotionPlanView } from '../promotions';
import { UpdatePromotionPlanDto } from './dto/update-promotion-plan.dto';

@Injectable()
export class AdminPromotionPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans?: PromotionPlansService, // optional: reuse listing for GET
  ) {}

  /** Все 6 планов (включая неактивные) для админ-таблицы. */
  async list(): Promise<PromotionPlanView[]> {
    const rows = await this.prisma.promotionPlan.findMany({
      orderBy: [{ type: 'asc' }, { periodDays: 'asc' }],
    });
    return rows.map((r) => ({
      type: r.type, period_days: r.periodDays, price: r.price.toFixed(2), currency: r.currency,
    }));
  }

  async updatePlan(adminId: string, id: string, dto: UpdatePromotionPlanDto) {
    const existing = await this.prisma.promotionPlan.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ code: ApiErrorCode.NOT_FOUND, message: 'Plan not found' });
    }
    const data: { price?: string; isActive?: boolean } = {};
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.promotionPlan.update({ where: { id }, data });
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'PROMOTION_PLAN_UPDATE',
          entityType: 'promotion_plan',
          entityId: id,
          metadata: {
            old_price: existing.price.toFixed(2),
            new_price: updated.price.toFixed(2),
            old_is_active: existing.isActive,
            new_is_active: updated.isActive,
          },
        },
      });
      return {
        id: updated.id, type: updated.type, period_days: updated.periodDays,
        price: updated.price.toFixed(2), currency: updated.currency, isActive: updated.isActive,
      };
    });
  }
}
```

Note: this service does NOT actually need `PromotionPlansService` for `list` — drop the optional param if unused; the test constructs with `prisma` only.

- [ ] **Step 5: Write the controller**

Create `apps/api/src/admin/admin-promotion-plans.controller.ts`:

```typescript
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { AdminPromotionPlansService } from './admin-promotion-plans.service';
import { UpdatePromotionPlanDto } from './dto/update-promotion-plan.dto';

/**
 * AdminPromotionPlansController — редактирование тарифной матрицы VIP/TOP
 * (цена + isActive). Только ADMIN. `/api/v1/admin/promotion-plans`.
 */
@Controller({ path: 'admin/promotion-plans', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPromotionPlansController {
  constructor(private readonly service: AdminPromotionPlansService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Patch(':id')
  update(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromotionPlanDto,
  ) {
    return this.service.updatePlan(adminId, id, dto);
  }
}
```

- [ ] **Step 6: Register in admin.module.ts**

In `apps/api/src/admin/admin.module.ts`: import and add `AdminPromotionPlansController` to `controllers` and `AdminPromotionPlansService` to `providers`. (`PromotionsModule` is already imported, exporting `PromotionPlansService`.)

- [ ] **Step 7: Run tests**

Run: `cd apps/api && rtk vitest run src/admin/admin-promotion-plans.service.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/admin
git commit -m "feat(api): admin promotion-plans GET/PATCH with audit"
```

---

## Task 5: Expiry interval setting + dynamic reschedule

**Files:**
- Create: `apps/api/src/promotions/promotion-expiry.cron.ts`
- Create: `apps/api/src/admin/dto/update-promotion-settings.dto.ts`
- Create: `apps/api/src/admin/admin-promotion-settings.service.ts`
- Create: `apps/api/src/admin/admin-promotion-settings.controller.ts`
- Test: `apps/api/src/admin/admin-promotion-settings.service.spec.ts`
- Modify: `apps/api/src/queues/promotion.queue.ts`
- Modify: `apps/api/src/admin/admin.module.ts`

- [ ] **Step 1: Create the preset↔cron mapping**

Create `apps/api/src/promotions/promotion-expiry.cron.ts`:

```typescript
/** Ключ настройки интервала истечения промо в app_settings. */
export const PROMOTION_EXPIRY_CRON_KEY = 'promotion_expiry_cron';

/** Допустимые пресеты интервала (часы) → cron-паттерн. */
export const EXPIRY_PRESET_CRON: Record<6 | 12, string> = {
  6: '0 */6 * * *',
  12: '0 */12 * * *',
};

/** cron → часы для UI; неизвестный паттерн → 12 (ближайший дефолт). */
export function cronToHours(cron: string): 6 | 12 {
  return cron === EXPIRY_PRESET_CRON[6] ? 6 : 12;
}
```

- [ ] **Step 2: Add rescheduleExpiry + DB-read to PromotionQueue**

Modify `apps/api/src/queues/promotion.queue.ts`:
- Inject `PrismaService` (import from `../prisma`); make `cron` mutable (`private cron: string`).
- In `onModuleInit`, before upsert, read DB: 

```typescript
const setting = await this.prisma.appSetting.findUnique({
  where: { key: 'promotion_expiry_cron' },
});
if (setting?.value) this.cron = setting.value;
```

- Extract the upsert into a reusable method and add a public `rescheduleExpiry`:

```typescript
async rescheduleExpiry(cron: string): Promise<void> {
  this.cron = cron;
  await this.queue.upsertJobScheduler(
    EXPIRY_SCHEDULER_ID,
    { pattern: cron },
    {
      name: EXPIRE_LISTING_PROMOTIONS_JOB,
      data: {},
      opts: { removeOnComplete: true, removeOnFail: 100 },
    },
  );
  this.logger.log(`Rescheduled ${EXPIRE_LISTING_PROMOTIONS_JOB} (cron="${cron}")`);
}
```

Have `onModuleInit` call `await this.rescheduleExpiry(this.cron)` (after reading DB) instead of the inline upsert. Note `QueuesModule` is `@Global`, so `PromotionQueue` is injectable in AdminModule without extra imports; `PrismaModule` is global too.

- [ ] **Step 3: Write the settings DTO**

Create `apps/api/src/admin/dto/update-promotion-settings.dto.ts`:

```typescript
import { IsIn } from 'class-validator';

/** Тело `PATCH /admin/promotion-settings`. Только пресеты 6ч/12ч. */
export class UpdatePromotionSettingsDto {
  @IsIn([6, 12])
  expiryIntervalHours!: 6 | 12;
}
```

- [ ] **Step 4: Write the failing settings-service test**

Create `apps/api/src/admin/admin-promotion-settings.service.spec.ts`:

```typescript
import { AdminPromotionSettingsService } from './admin-promotion-settings.service';

describe('AdminPromotionSettingsService', () => {
  const prisma = { appSetting: { findUnique: jest.fn(), upsert: jest.fn() }, auditLog: { create: jest.fn() } };
  const queue = { rescheduleExpiry: jest.fn() };
  let service: AdminPromotionSettingsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new AdminPromotionSettingsService(prisma as never, queue as never);
  });

  it('get() maps stored cron to interval hours', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: '0 */6 * * *' });
    expect(await service.get()).toEqual({ expiryIntervalHours: 6 });
  });

  it('get() defaults to 12h when unset', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);
    expect(await service.get()).toEqual({ expiryIntervalHours: 12 });
  });

  it('update() persists cron, reschedules queue, writes audit', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: '0 */12 * * *' });
    await service.update('admin1', { expiryIntervalHours: 6 });

    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'promotion_expiry_cron' },
        update: { value: '0 */6 * * *' },
      }),
    );
    expect(queue.rescheduleExpiry).toHaveBeenCalledWith('0 */6 * * *');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'PROMOTION_SETTINGS_UPDATE',
          metadata: expect.objectContaining({ old_cron: '0 */12 * * *', new_cron: '0 */6 * * *' }),
        }),
      }),
    );
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd apps/api && rtk vitest run src/admin/admin-promotion-settings.service.spec.ts`
Expected: FAIL — service not found.

- [ ] **Step 6: Write the settings service**

Create `apps/api/src/admin/admin-promotion-settings.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { PromotionQueue } from '../queues/promotion.queue';
import {
  EXPIRY_PRESET_CRON,
  PROMOTION_EXPIRY_CRON_KEY,
  cronToHours,
} from '../promotions/promotion-expiry.cron';
import { UpdatePromotionSettingsDto } from './dto/update-promotion-settings.dto';

export interface PromotionSettingsView {
  expiryIntervalHours: 6 | 12;
}

@Injectable()
export class AdminPromotionSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: PromotionQueue,
  ) {}

  async get(): Promise<PromotionSettingsView> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: PROMOTION_EXPIRY_CRON_KEY },
    });
    return { expiryIntervalHours: row?.value ? cronToHours(row.value) : 12 };
  }

  async update(adminId: string, dto: UpdatePromotionSettingsDto): Promise<PromotionSettingsView> {
    const newCron = EXPIRY_PRESET_CRON[dto.expiryIntervalHours];
    const prev = await this.prisma.appSetting.findUnique({
      where: { key: PROMOTION_EXPIRY_CRON_KEY },
    });

    await this.prisma.appSetting.upsert({
      where: { key: PROMOTION_EXPIRY_CRON_KEY },
      update: { value: newCron },
      create: { key: PROMOTION_EXPIRY_CRON_KEY, value: newCron },
    });
    await this.queue.rescheduleExpiry(newCron);
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'PROMOTION_SETTINGS_UPDATE',
        entityType: 'app_setting',
        entityId: null,
        metadata: { old_cron: prev?.value ?? null, new_cron: newCron },
      },
    });
    return { expiryIntervalHours: dto.expiryIntervalHours };
  }
}
```

- [ ] **Step 7: Write the settings controller**

Create `apps/api/src/admin/admin-promotion-settings.controller.ts`:

```typescript
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { AdminPromotionSettingsService } from './admin-promotion-settings.service';
import { UpdatePromotionSettingsDto } from './dto/update-promotion-settings.dto';

@Controller({ path: 'admin/promotion-settings', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPromotionSettingsController {
  constructor(private readonly service: AdminPromotionSettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Patch()
  update(@CurrentUser('id') adminId: string, @Body() dto: UpdatePromotionSettingsDto) {
    return this.service.update(adminId, dto);
  }
}
```

- [ ] **Step 8: Register in admin.module.ts**

Add `AdminPromotionSettingsController` to `controllers` and `AdminPromotionSettingsService` to `providers`.

- [ ] **Step 9: Run tests + build**

Run: `cd apps/api && rtk vitest run src/admin src/promotions && rtk tsc -p tsconfig.json --noEmit`
Expected: all green, no type errors.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): admin-configurable promo expiry interval (6h/12h) with live reschedule"
```

---

## Task 6: Frontend — RTK Query endpoints + types

**Files:**
- Modify: `apps/web/src/store/api/adminTypes.ts`
- Modify: `apps/web/src/store/api/adminPromotionsApi.ts`

- [ ] **Step 1: Add types**

Append to `apps/web/src/store/api/adminTypes.ts`:

```typescript
export interface AdminPromotionPlan {
  id: string;
  type: 'TOP' | 'VIP';
  period_days: 7 | 14 | 30;
  price: string;
  currency: 'UZS' | 'USD';
  isActive: boolean;
}

export interface PromotionSettings {
  expiryIntervalHours: 6 | 12;
}
```

- [ ] **Step 2: Add endpoints**

Add to the `endpoints` block in `apps/web/src/store/api/adminPromotionsApi.ts` (before `overrideExisting`), and import the new types:

```typescript
    getPromotionPlans: build.query<AdminPromotionPlan[], void>({
      query: () => ({ url: '/admin/promotion-plans' }),
      providesTags: ['Admin'],
    }),
    updatePromotionPlan: build.mutation<
      AdminPromotionPlan,
      { id: string; body: { price?: string; isActive?: boolean } }
    >({
      query: ({ id, body }) => ({ url: `/admin/promotion-plans/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Admin'],
    }),
    getPromotionSettings: build.query<PromotionSettings, void>({
      query: () => ({ url: '/admin/promotion-settings' }),
      providesTags: ['Admin'],
    }),
    updatePromotionSettings: build.mutation<PromotionSettings, { expiryIntervalHours: 6 | 12 }>({
      query: (body) => ({ url: '/admin/promotion-settings', method: 'PATCH', body }),
      invalidatesTags: ['Admin'],
    }),
```

Add the generated hooks to the export block:

```typescript
  useGetPromotionPlansQuery,
  useUpdatePromotionPlanMutation,
  useGetPromotionSettingsQuery,
  useUpdatePromotionSettingsMutation,
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && rtk tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/store
git commit -m "feat(web): RTK Query endpoints for promotion plans + settings"
```

---

## Task 7: Frontend — page, table, settings card, i18n

**Files:**
- Create: `apps/web/src/components/admin/PromotionPlansTable.tsx`
- Create: `apps/web/src/components/admin/PromotionSettingsCard.tsx`
- Create: `apps/web/src/app/(admin)/admin/promotions/page.tsx`
- Modify: `apps/web/src/lib/i18n/messages/promotions.ts`

- [ ] **Step 1: Add i18n keys**

Add to `apps/web/src/lib/i18n/messages/promotions.ts` under each locale (RU/UZ/EN) — keys: `promotionsAdmin.title`, `.subtitle`, `.tier`, `.period`, `.price`, `.active`, `.save`, `.saved`, `.interval`, `.interval6h`, `.interval12h`, `.periodDaysFmt` (e.g. RU `"{n} дней"`). Mirror the existing structure in that file (match how other message namespaces are keyed).

- [ ] **Step 2: Build the editable plans table**

Create `apps/web/src/components/admin/PromotionPlansTable.tsx` — a client component that:
- calls `useGetPromotionPlansQuery()`,
- renders rows (tier, period, an editable price `<input>` bound to local state per row, an `isActive` toggle, a Save button),
- on Save calls `useUpdatePromotionPlanMutation()` with `{ id, body: { price, isActive } }`,
- shows loading/disabled state during mutation.
Follow the table/markup conventions in `apps/web/src/components/admin/logs/PromotionLogsTab.tsx` (Tailwind classes, dark-mode variants) and use `useT()` for all labels.

- [ ] **Step 3: Build the settings card**

Create `apps/web/src/components/admin/PromotionSettingsCard.tsx` — client component:
- `useGetPromotionSettingsQuery()` to read current `expiryIntervalHours`,
- a two-option selector (6ч / 12ч) — buttons or `<select>`,
- on change calls `useUpdatePromotionSettingsMutation()` with `{ expiryIntervalHours }`,
- localized labels via `useT()`.

- [ ] **Step 4: Build the page**

Create `apps/web/src/app/(admin)/admin/promotions/page.tsx` mirroring `apps/web/src/app/(admin)/admin/logs/page.tsx` header pattern:

```tsx
"use client";

import { useT } from "@/lib/i18n";
import { PromotionPlansTable } from "@/components/admin/PromotionPlansTable";
import { PromotionSettingsCard } from "@/components/admin/PromotionSettingsCard";

export default function AdminPromotionsPage() {
  const { t } = useT();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
          {t("promotionsAdmin.title")}
        </h1>
        <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
          {t("promotionsAdmin.subtitle")}
        </p>
      </div>
      <PromotionPlansTable />
      <PromotionSettingsCard />
    </div>
  );
}
```

- [ ] **Step 5: Add nav link**

Add a sidebar/nav entry to `/admin/promotions` wherever the admin nav is defined (search: `cd apps/web && grep -rln "/admin/logs" src/components src/layout`). Mirror the existing `/admin/logs` link entry.

- [ ] **Step 6: Build + lint**

Run: `cd apps/web && rtk next build` (or `rtk tsc --noEmit && rtk lint`)
Expected: builds clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): admin promotions page — editable tariffs + expiry interval"
```

---

## Task 8: Live verification

- [ ] **Step 1: Bring up the stack + seed**

Per the project's local live-verify recipe: `rtk docker compose up -d`, run migrations/seed inside the api container, obtain an ADMIN session (OTP dev code in api logs).

- [ ] **Step 2: Verify endpoints**

Run (with admin Bearer token):
```bash
rtk curl -X GET  http://localhost:3000/api/v1/admin/promotion-plans -H "Authorization: Bearer $TOKEN"
rtk curl -X PATCH http://localhost:3000/api/v1/admin/promotion-plans/$ID -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"price":"60000.00"}'
rtk curl -X GET  http://localhost:3000/api/v1/promotions/plans
rtk curl -X PATCH http://localhost:3000/api/v1/admin/promotion-settings -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"expiryIntervalHours":6}'
```
Expected: PATCH plan returns new price; public `/promotions/plans` reflects it; settings PATCH returns `{expiryIntervalHours:6}` and api logs show "Rescheduled expire_listing_promotions (cron=\"0 */6 * * *\")". Confirm a `PROMOTION_PLAN_UPDATE` row in `audit_logs`.

- [ ] **Step 3: Verify role-guard**

Run the plan PATCH without an admin token → expect `403`.

- [ ] **Step 4: Verify in browser**

Open `/admin/promotions`, edit a price, toggle a plan, switch interval to 6h — confirm UI updates and persists on reload.

---

## Task 9: Docs + ADR + DONE (same PR)

**Files:**
- Modify: `docs/API.md` (§15 promotions)
- Modify: `docs/DB_SCHEMA.md`
- Create: `docs/adr/ADR-00XX-editable-promotion-plans.md`
- Modify: `docs/DONE.md`

- [ ] **Step 1: Update API.md §15** — document `GET/PATCH /admin/promotion-plans`, `GET/PATCH /admin/promotion-settings`, and that `GET /promotions/plans` now returns only active plans from DB.

- [ ] **Step 2: Update DB_SCHEMA.md** — add `promotion_plans` and `app_settings` tables (columns, constraints, the fixed-6 CHECK), and note the catalog is no longer code-static.

- [ ] **Step 3: Write the ADR** — context (hardcoded catalog → admin-editable), decision (DB table + fixed-6 CHECK + price snapshot keeps active promos stable + runtime cron reschedule), consequences. Use the next ADR number (check `ls docs/adr`).

- [ ] **Step 4: Mark DONE.md** — add the completed entry following the existing format.

- [ ] **Step 5: Commit + open PR**

```bash
git add docs
git commit -m "docs: editable promotion plans (API.md, DB_SCHEMA.md, ADR, DONE)"
git push -u origin <feature-branch>
gh pr create --title "feat: editable VIP/TOP tariffs + admin expiry interval" --body "..."
```

---

## Self-Review Notes

- **Spec coverage:** §3.1 promotion_plans → Task 1/2; §3.2 app_settings → Task 1/5; §4.1 DB catalog + price snapshot → Task 2/3 (snapshot is inherent — `listing_promotions.price` written at activation, unchanged here); §4.2 admin endpoints → Task 4/5; §4.3 reschedule → Task 5; §5 frontend → Task 6/7; §6 tests → Tasks 2-5 unit + Task 8 live; §7 migration/rollback → Task 1; §9 finalize → Task 9. All covered.
- **Price-snapshot note:** no code change is required to *preserve* the snapshot — activation already persists `price` into `listing_promotions`. Task 3 only changes where the *plan* price is read; active rows are untouched. The spec's unit test "active promo keeps old price" is satisfied by Task 4's audit-only update (it never touches `listing_promotions`); an explicit regression assertion can be added to `admin-promotion-plans.service.spec.ts` if desired.
- **Test runner (confirmed):** `apps/api` uses jest — run `cd apps/api && npx jest <path>`. The `rtk vitest run` shorthand in steps maps to `npx jest`.
- **ApiErrorCode (confirmed):** imported from `../common/dto/error-response.dto`; `NOT_FOUND`/`INVALID_PERIOD` exist there.
