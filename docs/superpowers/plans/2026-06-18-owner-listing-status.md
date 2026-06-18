# Owner Listing Status (Hide / Sold / Rented / Reactivate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a listing owner hide (temporarily), mark sold/rented, and reactivate their own listing from the "Мои объявления" page.

**Architecture:** Reuse the existing `ListingStatus` enum (`ARCHIVED/SOLD/RENTED`) — no new statuses. Add one owner-only endpoint `PATCH /api/v1/listings/:id/status` that runs a small transition state-machine in `ListingsService`. A new boolean `edited_since_hidden` makes "smart return" (un-hide → straight to `ACTIVE` when safe) deterministic. The public read-path is unchanged: `status='ACTIVE'` already hides everything else. The client wires status-contextual buttons through a pure helper + an RTK Query mutation.

**Tech Stack:** NestJS + Prisma + PostgreSQL (apps/api); Next.js + RTK Query + next-intl + Vitest/RTL (apps/client). Jest for api tests.

## Global Constraints

- **One app-folder per PR.** apps/api changes and apps/client changes are **separate PRs** (docs/CLAUDE.md §0). PR A = apps/api, PR B = apps/client. `packages/shared` is NOT touched.
- **API versioning:** every route under `/api/v1` (controller already declares `version: '1'`). Unversioned routes forbidden (CLAUDE.md §14).
- **Error contract is stable:** reuse existing `ApiErrorCode` values verbatim — `NOT_FOUND` (404), `FORBIDDEN` (403), `INVALID_STATUS_TRANSITION` (422). Do not add new codes.
- **Read-path unchanged:** do NOT modify search or `findOne` visibility — `status='ACTIVE'` already fully hides `ARCHIVED/SOLD/RENTED`.
- **RTK Query only** on the client — no `fetch()`/`axios` in components (CLAUDE.md §4).
- **i18n parity:** every new key added to `ru.json`, `uz.json`, `en.json` together; one JSON writer.
- **Conventional Commits.** Subagents never run git — the controller owns all git (memory: subagents-shared-workdir-git-hazard).
- **Branches:** PR A → `feat/owner-listing-status-api`; PR B → `feat/owner-listing-status-client`. Both stacked off the current `feat/owner-listing-status` (where the spec lives), or off `main` once chore work merges — controller decides at push time.
- **Statuses are the single source of truth** — never add a parallel `is_hidden`/`visible` flag.

---

# PR A — apps/api (backend)

Branch: `feat/owner-listing-status-api`

### Task A1: Add `edited_since_hidden` column (schema + migration + generate)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Listing model, around line 401–403)
- Create: `apps/api/prisma/migrations/20260618130000_add_listing_edited_since_hidden/migration.sql`

**Interfaces:**
- Produces: a Prisma `Listing.editedSinceHidden: boolean` field (DB column `edited_since_hidden`, default `false`) available to Task A2.

- [ ] **Step 1: Add the field to the Listing model**

In `apps/api/prisma/schema.prisma`, inside `model Listing { ... }`, add the field next to `publishedAt` (before `createdAt`/`updatedAt`):

```prisma
  publishedAt        DateTime?                              @map("published_at") @db.Timestamptz(6)
  editedSinceHidden  Boolean                                @default(false) @map("edited_since_hidden")
  createdAt          DateTime                               @default(now()) @map("created_at") @db.Timestamptz(6)
```

- [ ] **Step 2: Create the migration SQL**

Create `apps/api/prisma/migrations/20260618130000_add_listing_edited_since_hidden/migration.sql`:

```sql
-- Owner "smart return": marks a hidden (ARCHIVED) listing whose content was edited
-- while hidden, so REACTIVATE re-enters moderation instead of going straight to ACTIVE.
ALTER TABLE "listings"
  ADD COLUMN "edited_since_hidden" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Regenerate the Prisma client and validate**

Run: `pnpm --filter @avino/api exec prisma validate && pnpm --filter @avino/api exec prisma generate`
Expected: "The schema at prisma/schema.prisma is valid" and "Generated Prisma Client".

- [ ] **Step 4: Verify the api still builds (types compile with the new field)**

Run: `pnpm --filter @avino/api exec tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260618130000_add_listing_edited_since_hidden/migration.sql
git commit -m "feat(listings): add edited_since_hidden column for owner smart-return"
```

---

### Task A2: Owner-status DTO + `setOwnerStatus` service logic + `update()` dirty-flag

**Files:**
- Create: `apps/api/src/listings/dto/owner-status.dto.ts`
- Modify: `apps/api/src/listings/listings.service.ts` (imports; `update()` ~line 427 & ~444; add `setOwnerStatus` + transition constants)
- Test: `apps/api/src/listings/owner-status.service.spec.ts`

**Interfaces:**
- Consumes: `Listing.editedSinceHidden` (Task A1); existing `ListingsService.toResponse`, `LISTING_SELECT`, `ListingResponse`.
- Produces:
  - `enum OwnerListingAction { HIDE, MARK_SOLD, MARK_RENTED, REACTIVATE }` (string enum) in `owner-status.dto.ts`
  - `class OwnerStatusDto { action: OwnerListingAction }`
  - `ListingsService.setOwnerStatus(ownerId: string, listingId: string, action: OwnerListingAction): Promise<ListingResponse>` — consumed by Task A3.

- [ ] **Step 1: Create the DTO + action enum**

Create `apps/api/src/listings/dto/owner-status.dto.ts`:

```ts
import { IsEnum } from 'class-validator';

/**
 * Владельческие действия над собственным листингом
 * (`PATCH /api/v1/listings/:id/status`). Маппинг на listing_status и проверку
 * допустимости перехода делает ListingsService.setOwnerStatus.
 *
 * - HIDE        → ARCHIVED (временно скрыть; обратимо)
 * - MARK_SOLD   → SOLD     (только для transaction_type=SALE)
 * - MARK_RENTED → RENTED   (только для transaction_type=RENT)
 * - REACTIVATE  → ACTIVE | NEW (см. smart-return)
 */
export enum OwnerListingAction {
  HIDE = 'HIDE',
  MARK_SOLD = 'MARK_SOLD',
  MARK_RENTED = 'MARK_RENTED',
  REACTIVATE = 'REACTIVATE',
}

/** Тело `PATCH /api/v1/listings/:id/status` (owner). */
export class OwnerStatusDto {
  @IsEnum(OwnerListingAction)
  action!: OwnerListingAction;
}
```

- [ ] **Step 2: Write the failing spec**

Create `apps/api/src/listings/owner-status.service.spec.ts`:

```ts
import { HttpException, NotFoundException } from '@nestjs/common';
import {
  Currency,
  Language,
  ListingStatus,
  PropertyType,
  TransactionType,
} from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { DistrictsService } from '../geo';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
import { ListingsService } from './listings.service';
import { OwnerListingAction } from './dto/owner-status.dto';

/**
 * Юнит-тесты ListingsService.setOwnerStatus (owner hide/sold/rented/reactivate).
 * Prisma мокается; проверяются таблица переходов, smart-return и authz.
 */
describe('ListingsService.setOwnerStatus', () => {
  const OWNER_ID = 'u1';
  const LISTING_ID = '11111111-1111-1111-1111-111111111111';

  let prisma: any;
  let service: ListingsService;

  /** Базовая строка листинга владельца; кейсы переопределяют поля. */
  function row(over: Partial<Record<string, unknown>> = {}) {
    return {
      id: LISTING_ID,
      ownerId: OWNER_ID,
      status: ListingStatus.ACTIVE,
      transactionType: TransactionType.SALE,
      publishedAt: new Date('2026-06-10T08:00:00.000Z'),
      editedSinceHidden: false,
      ...over,
    };
  }

  /** Краткий ответ toResponse (LISTING_SELECT). */
  const updatedResponseRow = {
    id: LISTING_ID,
    status: ListingStatus.ARCHIVED,
    transactionType: TransactionType.SALE,
    propertyType: PropertyType.APARTMENT,
    originalLanguage: Language.RU,
    price: { toFixed: () => '100.00' },
    currency: Currency.UZS,
    createdAt: new Date('2026-06-02T08:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = {
      listing: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue(updatedResponseRow),
      },
    };
    const districts = {
      namesByIds: jest.fn(),
      pickName: jest.fn(),
    } as unknown as DistrictsService;
    const uploads = {
      resolveMediaUrl: jest.fn(),
    } as unknown as UploadsService;
    service = new ListingsService(
      prisma,
      new TranslationsService(prisma),
      districts,
      uploads,
    );
  });

  async function expectCode(promise: Promise<unknown>, code: ApiErrorCode) {
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    try {
      await promise;
    } catch (e) {
      const res = (e as HttpException).getResponse() as { code: string };
      expect(res.code).toBe(code);
    }
  }

  /** Целевой статус из update-вызова (что сервис записал). */
  function writtenStatus(): ListingStatus {
    return prisma.listing.update.mock.calls[0][0].data.status;
  }
  function writtenData() {
    return prisma.listing.update.mock.calls[0][0].data;
  }

  it('HIDE active listing → ARCHIVED + resets edited flag', async () => {
    prisma.listing.findFirst.mockResolvedValue(row({ status: ListingStatus.ACTIVE }));
    await service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.HIDE);
    expect(writtenStatus()).toBe(ListingStatus.ARCHIVED);
    expect(writtenData().editedSinceHidden).toBe(false);
  });

  it('HIDE pending (NEW) listing → ARCHIVED (withdraw from queue)', async () => {
    prisma.listing.findFirst.mockResolvedValue(row({ status: ListingStatus.NEW }));
    await service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.HIDE);
    expect(writtenStatus()).toBe(ListingStatus.ARCHIVED);
  });

  it('MARK_SOLD a SALE listing → SOLD', async () => {
    prisma.listing.findFirst.mockResolvedValue(
      row({ status: ListingStatus.ACTIVE, transactionType: TransactionType.SALE }),
    );
    await service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.MARK_SOLD);
    expect(writtenStatus()).toBe(ListingStatus.SOLD);
  });

  it('MARK_SOLD on a RENT listing → 422', async () => {
    prisma.listing.findFirst.mockResolvedValue(
      row({ transactionType: TransactionType.RENT }),
    );
    await expectCode(
      service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.MARK_SOLD),
      ApiErrorCode.INVALID_STATUS_TRANSITION,
    );
  });

  it('MARK_RENTED a RENT listing → RENTED', async () => {
    prisma.listing.findFirst.mockResolvedValue(
      row({ status: ListingStatus.ACTIVE, transactionType: TransactionType.RENT }),
    );
    await service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.MARK_RENTED);
    expect(writtenStatus()).toBe(ListingStatus.RENTED);
  });

  it('REACTIVATE archived + published + not edited → ACTIVE (smart return)', async () => {
    prisma.listing.findFirst.mockResolvedValue(
      row({
        status: ListingStatus.ARCHIVED,
        publishedAt: new Date('2026-06-10T08:00:00.000Z'),
        editedSinceHidden: false,
      }),
    );
    await service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.REACTIVATE);
    expect(writtenStatus()).toBe(ListingStatus.ACTIVE);
    expect(writtenData().editedSinceHidden).toBe(false);
  });

  it('REACTIVATE archived but edited-while-hidden → NEW', async () => {
    prisma.listing.findFirst.mockResolvedValue(
      row({
        status: ListingStatus.ARCHIVED,
        publishedAt: new Date('2026-06-10T08:00:00.000Z'),
        editedSinceHidden: true,
      }),
    );
    await service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.REACTIVATE);
    expect(writtenStatus()).toBe(ListingStatus.NEW);
  });

  it('REACTIVATE archived that was never published → NEW (no moderation bypass)', async () => {
    prisma.listing.findFirst.mockResolvedValue(
      row({ status: ListingStatus.ARCHIVED, publishedAt: null, editedSinceHidden: false }),
    );
    await service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.REACTIVATE);
    expect(writtenStatus()).toBe(ListingStatus.NEW);
  });

  it('REACTIVATE a SOLD listing → NEW (always re-moderation)', async () => {
    prisma.listing.findFirst.mockResolvedValue(
      row({ status: ListingStatus.SOLD, publishedAt: new Date(), editedSinceHidden: false }),
    );
    await service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.REACTIVATE);
    expect(writtenStatus()).toBe(ListingStatus.NEW);
  });

  it('HIDE an already SOLD listing → 422 (illegal source)', async () => {
    prisma.listing.findFirst.mockResolvedValue(row({ status: ListingStatus.SOLD }));
    await expectCode(
      service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.HIDE),
      ApiErrorCode.INVALID_STATUS_TRANSITION,
    );
  });

  it("another user's listing → 403", async () => {
    prisma.listing.findFirst.mockResolvedValue(row({ ownerId: 'someone-else' }));
    await expectCode(
      service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.HIDE),
      ApiErrorCode.FORBIDDEN,
    );
  });

  it('missing / DELETED listing → 404', async () => {
    prisma.listing.findFirst.mockResolvedValue(null);
    await expect(
      service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.HIDE),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 3: Run the spec to verify it fails**

Run: `pnpm --filter @avino/api exec jest src/listings/owner-status.service.spec.ts`
Expected: FAIL — `service.setOwnerStatus is not a function`.

- [ ] **Step 4: Implement — extend imports + `update()` flag**

In `apps/api/src/listings/listings.service.ts`:

(a) Replace the `@nestjs/common` import block (lines 1–5) so `HttpException` and `HttpStatus` are available:

```ts
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
```

(b) Add the DTO import next to the other dto imports (after line 25 `import { UpdateListingDto } ...`):

```ts
import { OwnerListingAction } from './dto/owner-status.dto';
```

(c) In `update()`, make the existing `findFirst` (line ~427) also select `status`:

```ts
    const existing = await this.prisma.listing.findFirst({
      where: { id: listingId, status: { not: ListingStatus.DELETED } },
      select: { id: true, ownerId: true, originalLanguage: true, status: true },
    });
```

(d) In `update()`, right before the final `this.prisma.listing.update(...)` call (line ~463), mark the listing dirty if it is edited while hidden:

```ts
    // Smart-return: правка скрытого (ARCHIVED) листинга требует повторной
    // модерации при возврате в продажу.
    if (existing.status === ListingStatus.ARCHIVED) {
      data.editedSinceHidden = true;
    }

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data,
      select: LISTING_SELECT,
    });
```

- [ ] **Step 5: Implement — transition constants + `setOwnerStatus`**

In `apps/api/src/listings/listings.service.ts`, add these module-level constants near `LISTING_SELECT` (after line 102):

```ts
/** Статусы-источники, из которых владелец может СКРЫТЬ листинг (→ ARCHIVED). */
const HIDE_FROM: readonly ListingStatus[] = [
  ListingStatus.ACTIVE,
  ListingStatus.NEW,
  ListingStatus.DRAFT,
  ListingStatus.REJECTED,
];

/** Статусы-источники, из которых можно отметить ПРОДАНО/СДАНО. */
const SELL_FROM: readonly ListingStatus[] = [
  ListingStatus.ACTIVE,
  ListingStatus.ARCHIVED,
  ListingStatus.NEW,
  ListingStatus.DRAFT,
  ListingStatus.REJECTED,
];

/** Статусы-источники, из которых можно ВЕРНУТЬ листинг в продажу. */
const REACTIVATE_FROM: readonly ListingStatus[] = [
  ListingStatus.ARCHIVED,
  ListingStatus.SOLD,
  ListingStatus.RENTED,
];
```

Then add this method to the `ListingsService` class (e.g. right after `update()`, before `findOne`):

```ts
  /**
   * `PATCH /api/v1/listings/:id/status` — владельческая смена статуса
   * (скрыть / продано / сдано / вернуть). Зеркалит админский moderation-флоу,
   * но для статусов, зарезервированных за владельцем (ARCHIVED/SOLD/RENTED).
   *
   * Чужой листинг → `403`; отсутствующий/DELETED → `404`; недопустимый переход
   * или несовпадение transaction_type → `422 INVALID_STATUS_TRANSITION`.
   *
   * Smart-return (REACTIVATE из ARCHIVED): сразу `ACTIVE`, только если листинг был
   * опубликован (`published_at != null`) и не редактировался скрытым
   * (`edited_since_hidden = false`); иначе → `NEW` (повторная модерация). Из
   * SOLD/RENTED — всегда `NEW`. `published_at` при `→ ACTIVE` не сбрасывается.
   */
  async setOwnerStatus(
    ownerId: string,
    listingId: string,
    action: OwnerListingAction,
  ): Promise<ListingResponse> {
    const existing = await this.prisma.listing.findFirst({
      where: { id: listingId, status: { not: ListingStatus.DELETED } },
      select: {
        id: true,
        ownerId: true,
        status: true,
        transactionType: true,
        publishedAt: true,
        editedSinceHidden: true,
      },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }
    if (existing.ownerId !== ownerId) {
      throw new ForbiddenException({
        code: ApiErrorCode.FORBIDDEN,
        message: 'You can only change the status of your own listing',
      });
    }

    const invalid = () =>
      new HttpException(
        {
          code: ApiErrorCode.INVALID_STATUS_TRANSITION,
          message: `Cannot ${action} a listing in status ${existing.status}`,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

    const data: Prisma.ListingUpdateInput = {};

    switch (action) {
      case OwnerListingAction.HIDE: {
        if (!HIDE_FROM.includes(existing.status)) throw invalid();
        data.status = ListingStatus.ARCHIVED;
        data.editedSinceHidden = false;
        break;
      }
      case OwnerListingAction.MARK_SOLD: {
        if (
          !SELL_FROM.includes(existing.status) ||
          existing.transactionType !== TransactionType.SALE
        ) {
          throw invalid();
        }
        data.status = ListingStatus.SOLD;
        break;
      }
      case OwnerListingAction.MARK_RENTED: {
        if (
          !SELL_FROM.includes(existing.status) ||
          existing.transactionType !== TransactionType.RENT
        ) {
          throw invalid();
        }
        data.status = ListingStatus.RENTED;
        break;
      }
      case OwnerListingAction.REACTIVATE: {
        if (!REACTIVATE_FROM.includes(existing.status)) throw invalid();
        if (existing.status === ListingStatus.ARCHIVED) {
          const canGoActive =
            existing.publishedAt !== null && !existing.editedSinceHidden;
          data.status = canGoActive ? ListingStatus.ACTIVE : ListingStatus.NEW;
          data.editedSinceHidden = false;
        } else {
          // SOLD / RENTED — листинг мог устареть, всегда на повторную модерацию.
          data.status = ListingStatus.NEW;
        }
        break;
      }
    }

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data,
      select: LISTING_SELECT,
    });
    return this.toResponse(updated);
  }
```

- [ ] **Step 6: Run the spec to verify it passes**

Run: `pnpm --filter @avino/api exec jest src/listings/owner-status.service.spec.ts`
Expected: PASS — all 12 tests green.

- [ ] **Step 7: Verify the full api test suite + typecheck still pass**

Run: `pnpm --filter @avino/api test && pnpm --filter @avino/api exec tsc --noEmit`
Expected: all suites pass, tsc exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/listings/dto/owner-status.dto.ts apps/api/src/listings/owner-status.service.spec.ts apps/api/src/listings/listings.service.ts
git commit -m "feat(listings): owner setOwnerStatus state-machine (hide/sold/rented/reactivate)"
```

---

### Task A3: Expose the owner-status route on the controller

**Files:**
- Modify: `apps/api/src/listings/listings.controller.ts`

**Interfaces:**
- Consumes: `ListingsService.setOwnerStatus` (Task A2), `OwnerStatusDto` (Task A2).
- Produces: `PATCH /api/v1/listings/:id/status` (Bearer, owner-only).

- [ ] **Step 1: Add the route**

In `apps/api/src/listings/listings.controller.ts`:

(a) Extend the dto import (after line 23 `import { UpdateListingDto } ...`):

```ts
import { OwnerStatusDto } from './dto/owner-status.dto';
```

(b) Add the handler after the existing `update()` method (after line 114), inside the class:

```ts
  /**
   * `PATCH /api/v1/listings/:id/status` — владельческая смена статуса своего
   * листинга: скрыть (ARCHIVED) / продано (SOLD) / сдано (RENTED) / вернуть в
   * продажу (REACTIVATE). Только Bearer; ownership проверяет сервис.
   */
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  setStatus(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body() dto: OwnerStatusDto,
  ): Promise<ListingResponse> {
    return this.listingsService.setOwnerStatus(userId, listingId, dto.action);
  }
```

- [ ] **Step 2: Verify the api builds**

Run: `pnpm --filter @avino/api exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Live smoke (manual, optional but recommended)**

Bring the stack up, get an owner Bearer token + a listing id (see memory: `avino-local-live-verify-recipe`), then:

```bash
# expect 200 + {"status":"ARCHIVED",...}
curl -s -X PATCH "http://localhost:4000/api/v1/listings/<ID>/status" \
  -H "Authorization: Bearer <OWNER_JWT>" -H "Content-Type: application/json" \
  -d '{"action":"HIDE"}' | head
# then confirm it is gone from public search (no auth):
curl -s "http://localhost:4000/api/v1/search?limit=50" | grep -c "<ID>"   # → 0
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/listings/listings.controller.ts
git commit -m "feat(listings): add PATCH /listings/:id/status owner route"
```

---

### Task A4: Docs — ADR + API.md + DONE.md prep (same PR)

**Files:**
- Create: `docs/adr/ADR-0087-owner-listing-status.md` (next free number; latest is ADR-0086. If 0087 is already taken, bump to the next free and keep the title slug.)
- Modify: `docs/API.md` (§7 listings) — document the new route
- Modify: `docs/DONE.md` (prep entry; do NOT mark DONE until the PR is merged — CLAUDE.md §8)

> Note: `docs/` is repo-root, shared. These edits ride along in PR A because the ADR records the API decision. They do not touch `apps/web` or `apps/client`.

- [ ] **Step 1: Write the ADR**

Create `docs/adr/ADR-0087-owner-listing-status.md`:

```markdown
# ADR-0087 — Owner-controlled listing status (hide / sold / rented / reactivate)

## Status
Accepted

## Date
2026-06-18

## Context
Owners had no way to hide a listing, mark it sold/rented, or take it down when a
deal completes — `ListingsController` exposed only create / mine / detail / edit.
The `ListingStatus` enum already reserved `ARCHIVED/SOLD/RENTED` for the owner, and
moderation already refused to touch them, but no owner-facing transition existed.

## Decision
Add `PATCH /api/v1/listings/:id/status` (Bearer, owner-only) with actions
`HIDE | MARK_SOLD | MARK_RENTED | REACTIVATE`, mapped to existing statuses by a
transition state-machine in `ListingsService.setOwnerStatus`. Sold/rented are derived
from `transaction_type` (SALE→SOLD, RENT→RENTED). Reactivation is a "smart return":
`ARCHIVED → ACTIVE` only when the listing was previously published and not edited while
hidden (tracked by a new `edited_since_hidden` boolean); otherwise → `NEW`. From
SOLD/RENTED reactivation always goes to `NEW`. The public read-path is unchanged —
`status='ACTIVE'` already fully hides the other states.

## Consequences
Positive:
- Reuses existing statuses + read-path; zero changes to search/detail visibility.
- Smart return avoids needless re-moderation of unchanged, already-approved listings.

Negative / trade-offs:
- One new column + migration.
- No owner status-change audit log in v1 (status + updated_at is the record);
  promotion is not paused on hide/sold; owner permanent-delete remains absent.
  All deferred deliberately (see spec).

## Related files
- apps/api/prisma/schema.prisma (Listing.editedSinceHidden)
- apps/api/src/listings/listings.service.ts (setOwnerStatus)
- apps/api/src/listings/listings.controller.ts
- apps/api/src/listings/dto/owner-status.dto.ts

## Related task
- Owner listing status (spec: docs/superpowers/specs/2026-06-18-owner-listing-status-design.md)
```

- [ ] **Step 2: Document the route in API.md §7**

In `docs/API.md`, in the §7 listings section, add an entry describing:
`PATCH /api/v1/listings/:id/status` — Bearer owner-only; body `{ action: 'HIDE'|'MARK_SOLD'|'MARK_RENTED'|'REACTIVATE' }`; `200 ListingResponse`; errors `403 FORBIDDEN`, `404 NOT_FOUND`, `422 INVALID_STATUS_TRANSITION`. Match the surrounding formatting of existing §7 entries (mirror the `PATCH /listings/:id` block's style).

- [ ] **Step 3: Commit**

```bash
git add docs/adr/ADR-0087-owner-listing-status.md docs/API.md
git commit -m "docs(listings): ADR-0087 + API.md for owner listing status"
```

- [ ] **Step 4: Open PR A**

Push `feat/owner-listing-status-api` and open the PR (controller-owned git; base `main` or stacked per current chore state). PR body: what/why/how-to-verify + the curl smoke from Task A3.

---

# PR B — apps/client (frontend)

Branch: `feat/owner-listing-status-client`. Can be built in parallel; live e2e after PR A is deployed.

### Task B1: Pure action-model helper + unit test

**Files:**
- Create: `apps/client/src/features/account/ownerListingActions.ts`
- Test: `apps/client/src/features/account/ownerListingActions.test.ts`

**Interfaces:**
- Consumes: `ListingStatus`, `TransactionType` from `@/lib/mock/types`.
- Produces:
  - `type OwnerAction = 'HIDE' | 'MARK_SOLD' | 'MARK_RENTED' | 'REACTIVATE'`
  - `interface OwnerActionDescriptor { action: OwnerAction; labelKey: 'hide'|'markSold'|'markRented'|'reactivate'; variant: 'default'|'outline'; confirm: boolean }`
  - `function ownerActionsFor(status: ListingStatus | undefined, tx: TransactionType): OwnerActionDescriptor[]` — consumed by Task B4.

- [ ] **Step 1: Write the failing test**

Create `apps/client/src/features/account/ownerListingActions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ownerActionsFor } from './ownerListingActions';

describe('ownerActionsFor', () => {
  it('ACTIVE sale → Hide + Mark sold', () => {
    expect(ownerActionsFor('ACTIVE', 'SALE').map((a) => a.action)).toEqual([
      'HIDE',
      'MARK_SOLD',
    ]);
  });

  it('ACTIVE rent → Hide + Mark rented', () => {
    expect(ownerActionsFor('ACTIVE', 'RENT').map((a) => a.action)).toEqual([
      'HIDE',
      'MARK_RENTED',
    ]);
  });

  it('NEW/DRAFT/REJECTED also offer Hide + sell', () => {
    for (const s of ['NEW', 'DRAFT', 'REJECTED'] as const) {
      expect(ownerActionsFor(s, 'SALE').map((a) => a.action)).toEqual([
        'HIDE',
        'MARK_SOLD',
      ]);
    }
  });

  it('ARCHIVED → Reactivate + sell', () => {
    expect(ownerActionsFor('ARCHIVED', 'RENT').map((a) => a.action)).toEqual([
      'REACTIVATE',
      'MARK_RENTED',
    ]);
  });

  it('SOLD/RENTED → only Reactivate', () => {
    expect(ownerActionsFor('SOLD', 'SALE').map((a) => a.action)).toEqual([
      'REACTIVATE',
    ]);
    expect(ownerActionsFor('RENTED', 'RENT').map((a) => a.action)).toEqual([
      'REACTIVATE',
    ]);
  });

  it('sell actions require confirmation; hide/reactivate do not', () => {
    const [hide, sell] = ownerActionsFor('ACTIVE', 'SALE');
    expect(hide.confirm).toBe(false);
    expect(sell.confirm).toBe(true);
  });

  it('unknown/undefined status → no actions', () => {
    expect(ownerActionsFor(undefined, 'SALE')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @avino/client exec vitest run src/features/account/ownerListingActions.test.ts`
Expected: FAIL — cannot resolve `./ownerListingActions`.

- [ ] **Step 3: Implement the helper**

Create `apps/client/src/features/account/ownerListingActions.ts`:

```ts
/**
 * Чистая модель владельческих действий над карточкой «Мои объявления».
 * Возвращает упорядоченный список кнопок в зависимости от статуса листинга и
 * типа сделки. Маппинг действий на API — в myListingsApi.setMyListingStatus;
 * подписи кнопок — в i18n account.myListings.actions.{labelKey}.
 */
import type { ListingStatus, TransactionType } from '@/lib/mock/types';

export type OwnerAction = 'HIDE' | 'MARK_SOLD' | 'MARK_RENTED' | 'REACTIVATE';

export interface OwnerActionDescriptor {
  action: OwnerAction;
  labelKey: 'hide' | 'markSold' | 'markRented' | 'reactivate';
  variant: 'default' | 'outline';
  /** true → перед вызовом мутации спросить подтверждение (продано/сдано). */
  confirm: boolean;
}

/** «Продано» для SALE, «Сдано» для RENT (по transaction_type листинга). */
function sellAction(tx: TransactionType): OwnerActionDescriptor {
  return tx === 'SALE'
    ? { action: 'MARK_SOLD', labelKey: 'markSold', variant: 'outline', confirm: true }
    : { action: 'MARK_RENTED', labelKey: 'markRented', variant: 'outline', confirm: true };
}

const HIDE: OwnerActionDescriptor = {
  action: 'HIDE',
  labelKey: 'hide',
  variant: 'outline',
  confirm: false,
};
const REACTIVATE: OwnerActionDescriptor = {
  action: 'REACTIVATE',
  labelKey: 'reactivate',
  variant: 'default',
  confirm: false,
};

export function ownerActionsFor(
  status: ListingStatus | undefined,
  tx: TransactionType,
): OwnerActionDescriptor[] {
  switch (status) {
    case 'ACTIVE':
    case 'NEW':
    case 'DRAFT':
    case 'REJECTED':
      return [HIDE, sellAction(tx)];
    case 'ARCHIVED':
      return [REACTIVATE, sellAction(tx)];
    case 'SOLD':
    case 'RENTED':
      return [REACTIVATE];
    default:
      return [];
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @avino/client exec vitest run src/features/account/ownerListingActions.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/account/ownerListingActions.ts apps/client/src/features/account/ownerListingActions.test.ts
git commit -m "feat(account): owner listing action model helper"
```

---

### Task B2: i18n keys for owner actions (ru / uz / en)

**Files:**
- Modify: `apps/client/messages/ru.json`
- Modify: `apps/client/messages/uz.json`
- Modify: `apps/client/messages/en.json`

**Interfaces:**
- Produces: `account.myListings.actions.{hide,markSold,markRented,reactivate}` and `account.myListings.actions.confirm.{markSold,markRented}` in all three locales — consumed by Task B4.

- [ ] **Step 1: Add the `actions` object in ru.json**

In `apps/client/messages/ru.json`, inside `account.myListings` (next to the existing `status` object), add:

```json
      "actions": {
        "hide": "Скрыть",
        "reactivate": "Вернуть в продажу",
        "markSold": "Продано",
        "markRented": "Сдано",
        "confirm": {
          "markSold": "Отметить объявление как проданное? Оно скроется из поиска (можно вернуть позже).",
          "markRented": "Отметить объявление как сданное? Оно скроется из поиска (можно вернуть позже)."
        }
      },
```

- [ ] **Step 2: Add the `actions` object in uz.json**

In `apps/client/messages/uz.json`, inside `account.myListings`:

```json
      "actions": {
        "hide": "Yashirish",
        "reactivate": "Qaytarish",
        "markSold": "Sotilgan",
        "markRented": "Ijaraga berilgan",
        "confirm": {
          "markSold": "E'lon sotilgan deb belgilansinmi? U qidiruvdan yashiriladi (keyin qaytarish mumkin).",
          "markRented": "E'lon ijaraga berilgan deb belgilansinmi? U qidiruvdan yashiriladi (keyin qaytarish mumkin)."
        }
      },
```

- [ ] **Step 3: Add the `actions` object in en.json**

In `apps/client/messages/en.json`, inside `account.myListings`:

```json
      "actions": {
        "hide": "Hide",
        "reactivate": "Reactivate",
        "markSold": "Sold",
        "markRented": "Rented",
        "confirm": {
          "markSold": "Mark this listing as sold? It will be hidden from search (you can reactivate it later).",
          "markRented": "Mark this listing as rented? It will be hidden from search (you can reactivate it later)."
        }
      },
```

- [ ] **Step 4: Verify JSON is valid in all three locales**

Run: `node -e "['ru','uz','en'].forEach(l=>JSON.parse(require('fs').readFileSync('apps/client/messages/'+l+'.json','utf8')))" && echo OK`
Expected: prints `OK` (no JSON parse error).

- [ ] **Step 5: Commit**

```bash
git add apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "i18n(account): owner listing action labels + confirmations"
```

---

### Task B3: RTK Query mutation `setMyListingStatus`

**Files:**
- Modify: `apps/client/src/store/api/myListingsApi.ts`

**Interfaces:**
- Consumes: `OwnerAction` (Task B1), `baseApi` tag `'Listing'`.
- Produces: `useSetMyListingStatusMutation()` (PATCH `/listings/:id/status`, invalidates `'Listing'`) — consumed by Task B4.

- [ ] **Step 1: Add the import**

In `apps/client/src/store/api/myListingsApi.ts`, after the existing type import block (after line 26), add:

```ts
import type { OwnerAction } from '@/features/account/ownerListingActions';
```

- [ ] **Step 2: Add the mutation endpoint**

Inside `baseApi.injectEndpoints({ endpoints: (build) => ({ ... }) })`, add a sibling endpoint to `getMyListings` (after its closing `}),` at line 97):

```ts
    /** Владельческая смена статуса. PATCH /listings/:id/status. */
    setMyListingStatus: build.mutation<
      { id: string; status: ListingStatus },
      { id: string; action: OwnerAction }
    >({
      query: ({ id, action }) => ({
        url: `/listings/${id}/status`,
        method: 'PATCH',
        body: { action },
      }),
      invalidatesTags: ['Listing'],
    }),
```

- [ ] **Step 3: Export the hook**

Change the export line (line 102) to also export the mutation hook:

```ts
export const { useGetMyListingsQuery, useSetMyListingStatusMutation } = myListingsApi;
```

- [ ] **Step 4: Verify the client typechecks**

Run: `pnpm --filter @avino/client exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/store/api/myListingsApi.ts
git commit -m "feat(account): setMyListingStatus RTK mutation"
```

---

### Task B4: Wire the buttons in MyListings

**Files:**
- Modify: `apps/client/src/features/account/MyListings.tsx`

**Interfaces:**
- Consumes: `ownerActionsFor` (B1), `useSetMyListingStatusMutation` (B3), i18n keys (B2).

- [ ] **Step 1: Add imports**

In `apps/client/src/features/account/MyListings.tsx`, add to the import block (after line 28 `import { useGetMyListingsQuery } ...`):

```ts
import {
  ownerActionsFor,
  type OwnerActionDescriptor,
} from './ownerListingActions';
import { useSetMyListingStatusMutation } from '@/store/api/myListingsApi';
```

- [ ] **Step 2: Replace the stub action block in `ListingRow`**

Replace the whole `{/* Действия (заглушки) */}` block (lines 85–99) with real, status-contextual actions. The new `ListingRow` body becomes:

```tsx
/** Строка объявления в кабинете. */
function ListingRow({ l }: { l: Listing }) {
  const t = useTranslations('account');
  const tUnits = useTranslations('units');
  const [setStatus, { isLoading }] = useSetMyListingStatusMutation();
  const actions = ownerActionsFor(l.status, l.tx);

  const run = (a: OwnerActionDescriptor) => {
    if (a.confirm) {
      const key =
        a.action === 'MARK_SOLD'
          ? 'myListings.actions.confirm.markSold'
          : 'myListings.actions.confirm.markRented';
      if (!window.confirm(t(key))) return;
    }
    void setStatus({ id: l.id, action: a.action });
  };

  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-4 rounded-card border border-border/60 bg-surface p-3.5 shadow-card sm:grid-cols-[120px_1fr_auto]">
      {/* Превью */}
      <Link
        href={`/listing/${l.id}`}
        className="block h-[84px] w-[120px] overflow-hidden rounded-[10px]"
      >
        <PhotoImg src={l.photos[0]?.thumb ?? ''} alt={l.title} className="h-full w-full" />
      </Link>

      {/* Текстовая часть */}
      <div className="min-w-0">
        <div className="mb-[5px] flex items-center gap-2">
          <StatusPill s={l.status} />
          <PromoBadge promo={l.promo} />
        </div>
        <div className="truncate text-base font-bold">{l.title}</div>
        <div className="mt-[3px] text-[13.5px] text-muted-foreground">
          {formatPrice(l, tUnits)} · {l.district}
        </div>
        {/* TODO(listing-analytics): API /listings/mine не отдаёт views/leads. */}
      </div>

      {/* Действия */}
      <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1 sm:flex-col">
        <Button asChild variant="outline" size="sm">
          <Link href={`/sell/${l.id}/edit`}>{t('myListings.edit')}</Link>
        </Button>
        {/* Промо-CTA сохраняем как было (стаб вне области задачи). */}
        {l.promo === 'NORMAL' && (
          <Button size="sm" type="button">
            {t('myListings.promote')}
          </Button>
        )}
        {actions.map((a) => (
          <Button
            key={a.action}
            variant={a.variant}
            size="sm"
            type="button"
            disabled={isLoading}
            onClick={() => run(a)}
          >
            {t(`myListings.actions.${a.labelKey}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck + lint + full client test suite**

Run: `pnpm --filter @avino/client exec tsc --noEmit && pnpm --filter @avino/client lint && pnpm --filter @avino/client test`
Expected: tsc exit 0; lint clean; vitest all pass (incl. B1's helper test).

- [ ] **Step 4: Manual visual verify (Docker = baked prod image; rebuild client — see memory `avino-client-screenshot-recipe`)**

Rebuild + run client, log in as an owner with listings, open `/account/my-listings`, confirm:
- `ACTIVE` card shows **Редактировать / Скрыть / Продано|Сдано**;
- clicking **Скрыть** removes it from public `/search` and flips its pill to «В архире» on refetch;
- `ARCHIVED` card shows **Вернуть в продажу**; `SOLD/RENTED` shows **Опубликовать снова** only;
- **Продано** asks for confirmation first.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/account/MyListings.tsx
git commit -m "feat(account): wire hide/sold/rented/reactivate actions in MyListings"
```

- [ ] **Step 6: Open PR B**

Push `feat/owner-listing-status-client` and open the PR (controller-owned git). PR body: what/why/how-to-verify; note it depends on PR A's endpoint for live e2e.

---

## After both PRs merge

- Move the task to `docs/DONE.md` with both branches + PR numbers (CLAUDE.md §8: only after merge), referencing ADR-0087 and the spec.
- Future (not in this plan): owner status-change audit log, pause promotion on hide/sold, owner permanent-delete.
```