# Moderator-Controlled Translation Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the silent auto-translate-on-approve with a moderator-driven step — generate translations (synchronous Yandex), review, hand-edit, and only publish once all languages are present.

**Architecture:** A new synchronous admin endpoint triggers `ListingAutoTranslator` (refactored to protect hand-edited rows and run on `NEW`). A second admin endpoint persists a moderator's manual edit (`is_auto_translated=false`). `ModerationService` no longer enqueues translation; instead it gates `APPROVE` on full-language coverage. The now-dead `translation_queue` + worker are deleted. The web moderation page gains a translations panel with a "Generate" button, per-language editors, and a gated publish button.

**Tech Stack:** NestJS + Prisma (api), BullMQ (being removed for translation), RTK Query + Next.js (web), Jest (api tests), Yandex Cloud Translate.

## Global Constraints

- API routes are URI-versioned (`/api/v1/...`, CLAUDE.md §14); DTO keys are snake_case.
- Admin/moderation endpoints: `@Roles(UserRole.MODERATOR, UserRole.ADMIN)`.
- Supported languages: `Language = UZ | RU | EN` (Prisma enum). "All languages" = all three.
- Manual-edit marker is `is_auto_translated=false` — do NOT add a `source=MODERATOR` enum value.
- Moderator may edit only NON-original languages; editing `original_language` → `422`.
- `main` is protected: work on branch `feat/moderator-translation-review`, one commit per task, open a PR, never push to `main`.
- API tests: Jest (`apps/api`). Web: no unit harness — verify via lint + build + live Docker check.
- Money/decimal, UTC, i18n rules per repo conventions still apply.
- Bundle ADR + API.md + DONE.md into this same feature PR (project convention).

---

## File Structure

**Backend (`apps/api`):**
- Modify: `src/moderation/moderation.service.ts` — remove enqueue, gate APPROVE.
- Modify: `src/moderation/moderation.service.spec.ts` — drop queue mock, add gate tests.
- Delete: `src/queues/translation.queue.ts`, `src/queues/translation.queue.spec.ts`, `src/translations/translation.worker.ts`.
- Modify: `src/queues/queue.constants.ts` (remove translation entries), `src/queues/queues.module.ts`, `src/translations/translations.module.ts`.
- Modify: `src/config/env.validation.ts`, `src/config/configuration.ts`, `.env.example` (remove `TRANSLATE_QUEUE_*`).
- Modify: `src/translations/listing-auto-translator.service.ts` (+ `.spec.ts`) — `run` → `generateTranslations`, protect manual rows, allow NEW.
- Modify: `src/translations/translations.service.ts` (+ `.spec.ts`) — add `updateModeratorTranslation`.
- Create: `src/translations/dto/update-moderator-translation.dto.ts`.
- Modify: `src/admin/admin-listings.controller.ts`, `src/admin/admin.module.ts` — two new endpoints.

**Frontend (`apps/web`):**
- Modify: `src/store/api/adminTypes.ts` — translation types.
- Modify: `src/store/api/adminListingsApi.ts` — 3 endpoints.
- Modify: `src/app/admin/listings/[id]/page.tsx` — translations panel + gating.

**Docs:**
- Create: `docs/adr/ADR-0091-moderator-translation-review.md` (supersedes ADR-0025).
- Modify: `docs/API.md`, `docs/DONE.md`, spec status line.

---

## Task 1: Gate APPROVE on full-language coverage; remove translation enqueue

**Files:**
- Modify: `apps/api/src/moderation/moderation.service.ts`
- Test: `apps/api/src/moderation/moderation.service.spec.ts`

**Interfaces:**
- Consumes: `ModerateListingDto.action` (`ModerationAction`), `prisma.listingTranslation.findMany`.
- Produces: `ModerationService` whose constructor no longer takes `TranslationQueue`; `changeStatus` throws `422 VALIDATION_ERROR` on `APPROVE` when any of `UZ/RU/EN` lacks a translation row.

- [ ] **Step 1: Update the spec — drop the queue, add gate tests**

In `moderation.service.spec.ts`: remove the `translationQueue` mock and the two enqueue-related tests; construct the service as `new ModerationService(prisma)`. Add:

```ts
import { Language } from '@prisma/client';

it('rejects APPROVE when a language translation is missing (422)', async () => {
  prisma.listing.findUnique.mockResolvedValue({
    id: LISTING_ID, ownerId: OWNER_ID, status: 'NEW', publishedAt: null,
  });
  prisma.listingTranslation.findMany.mockResolvedValue([
    { language: Language.RU }, { language: Language.EN }, // UZ missing
  ]);

  await expect(
    service.changeStatus(MOD_ID, LISTING_ID, { action: 'APPROVE' } as any),
  ).rejects.toMatchObject({ status: 422 });
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('allows APPROVE when all languages are present', async () => {
  prisma.listing.findUnique.mockResolvedValue({
    id: LISTING_ID, ownerId: OWNER_ID, status: 'NEW', publishedAt: null,
  });
  prisma.listingTranslation.findMany.mockResolvedValue([
    { language: Language.RU }, { language: Language.EN }, { language: Language.UZ },
  ]);
  prisma.$transaction.mockImplementation(async (cb: any) =>
    cb({
      listing: { update: jest.fn().mockResolvedValue({ id: LISTING_ID, status: 'ACTIVE', publishedAt: new Date() }) },
      moderationLog: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      notification: { create: jest.fn() },
    }),
  );

  const res = await service.changeStatus(MOD_ID, LISTING_ID, { action: 'APPROVE' } as any);
  expect(res.status).toBe('ACTIVE');
});
```

Ensure the `prisma` mock object includes `listingTranslation: { findMany: jest.fn() }` and `$transaction: jest.fn()`. Reuse the existing `LISTING_ID`/owner/moderator constants (add `OWNER_ID`/`MOD_ID` if not present).

- [ ] **Step 2: Run the spec to verify the new tests fail**

Run: `cd apps/api && node_modules/.bin/jest src/moderation/moderation.service.spec.ts -v`
Expected: FAIL — service still requires `TranslationQueue` / no gate yet.

- [ ] **Step 3: Edit `moderation.service.ts` — remove queue, add gate**

Remove the `TranslationQueue` import and the constructor parameter:

```ts
constructor(private readonly prisma: PrismaService) {}
```

Add near the top (after imports), using the Prisma enum as the source of truth for languages:

```ts
import { Language, ModerationAction } from '@prisma/client';

/** Все языки, для которых обязателен перевод перед публикацией (ADR-0091). */
const REQUIRED_LANGUAGES: readonly Language[] = Object.values(Language);
```

In `changeStatus`, immediately after the existing not-found / invalid-transition checks and BEFORE the `$transaction`, insert:

```ts
// APPROVE требует переводов на все языки (ADR-0091): публикация без
// проверенного перевода запрещена. Остальные действия гейт не трогают.
if (dto.action === ModerationAction.APPROVE) {
  const rows = await this.prisma.listingTranslation.findMany({
    where: { listingId },
    select: { language: true },
  });
  const present = new Set(rows.map((r) => r.language));
  if (REQUIRED_LANGUAGES.some((lang) => !present.has(lang))) {
    throw new HttpException(
      {
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Translations required for all languages before publishing',
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
```

Delete the post-commit enqueue block entirely:

```ts
// DELETE THIS BLOCK:
// if (updated.status === ListingStatus.ACTIVE) {
//   try { await this.translationQueue.enqueueListingTranslation(updated.id); }
//   catch (error) { this.logger.error(...); }
// }
```

(Leave `this.logger` in place — it may be used elsewhere; if it becomes unused, remove the field too.) Update the `changeStatus` doc comment to state APPROVE now requires full translations and no longer enqueues.

- [ ] **Step 4: Run the spec to verify it passes**

Run: `cd apps/api && node_modules/.bin/jest src/moderation/moderation.service.spec.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/moderation/moderation.service.ts apps/api/src/moderation/moderation.service.spec.ts
git commit -m "feat(moderation): gate APPROVE on full-language translations; drop auto-enqueue"
```

---

## Task 2: Delete the dead translation queue and worker

**Files:**
- Delete: `apps/api/src/queues/translation.queue.ts`, `apps/api/src/queues/translation.queue.spec.ts`, `apps/api/src/translations/translation.worker.ts`
- Modify: `apps/api/src/queues/queue.constants.ts`, `apps/api/src/queues/queues.module.ts`, `apps/api/src/translations/translations.module.ts`
- Modify: `apps/api/src/config/env.validation.ts`, `apps/api/src/config/configuration.ts`, `.env.example`

**Interfaces:**
- Consumes: nothing new.
- Produces: build with no `TranslationQueue`/`TranslationWorker`/`TRANSLATION_QUEUE_NAME`/`TRANSLATE_LISTING_JOB` symbols and no `TRANSLATE_QUEUE_*` env. `ListingAutoTranslator` remains (still exposes `run`, refactored in Task 3).

- [ ] **Step 1: Delete the queue/worker files**

```bash
git rm apps/api/src/queues/translation.queue.ts \
       apps/api/src/queues/translation.queue.spec.ts \
       apps/api/src/translations/translation.worker.ts
```

- [ ] **Step 2: Remove translation entries from `queue.constants.ts`**

Delete the three translation exports (`TRANSLATION_QUEUE_NAME`, `TRANSLATE_LISTING_JOB`, and the `TranslateListingJobData` interface) and their doc comment. Leave the email/saved-search/promotion entries untouched.

- [ ] **Step 3: Unregister from `queues.module.ts`**

Remove the `import { TranslationQueue } from './translation.queue';` line and remove `TranslationQueue` from both `providers` and `exports`:

```ts
import { Global, Module } from '@nestjs/common';
import { EmailQueue } from './email.queue';
import { PromotionQueue } from './promotion.queue';
import { SavedSearchQueue } from './saved-search.queue';

@Global()
@Module({
  providers: [PromotionQueue, EmailQueue, SavedSearchQueue],
  exports: [PromotionQueue, EmailQueue, SavedSearchQueue],
})
export class QueuesModule {}
```

- [ ] **Step 4: Unregister the worker from `translations.module.ts`**

Remove `import { TranslationWorker } from './translation.worker';` and remove `TranslationWorker` from `providers`. Update the module doc comment (drop the worker/queue paragraph). Keep `ListingAutoTranslator`, `TRANSLATION_PROVIDER`, `TranslationsService`.

- [ ] **Step 5: Remove `TRANSLATE_QUEUE_*` env**

In `env.validation.ts`: delete the `TRANSLATE_QUEUE_ATTEMPTS` and `TRANSLATE_QUEUE_CONCURRENCY` fields. In `configuration.ts`: from `translateConfig` delete `queueAttempts` and `queueConcurrency` (keep `provider`, `apiKey`, `folderId`). In `.env.example`: delete the two `TRANSLATE_QUEUE_*` lines (keep `TRANSLATE_PROVIDER`/`TRANSLATE_API_KEY`/`TRANSLATE_FOLDER_ID`).

- [ ] **Step 6: Verify the whole api compiles and tests pass**

Run: `cd apps/api && node_modules/.bin/jest && npm run build`
Expected: All suites PASS; `nest build` produces no errors. (If a stale import to a deleted symbol surfaces, fix it.)

- [ ] **Step 7: Commit**

```bash
git add -A apps/api/src/queues apps/api/src/translations apps/api/src/config .env.example
git commit -m "refactor(api): remove dead translation_queue + worker and queue env"
```

---

## Task 3: Refactor `ListingAutoTranslator` — protect manual edits, allow NEW

**Files:**
- Modify: `apps/api/src/translations/listing-auto-translator.service.ts`
- Test: `apps/api/src/translations/listing-auto-translator.service.spec.ts`

**Interfaces:**
- Consumes: `prisma.listing.findUnique`, `prisma.listingTranslation.upsert`, `TranslationProvider.translate`.
- Produces: `ListingAutoTranslator.generateTranslations(listingId: string): Promise<void>` — translates the author row into each non-original language, SKIPPING any target whose existing row has `is_auto_translated=false`; works for any non-`DELETED` status. The old `run` method is removed.

- [ ] **Step 1: Update the spec for the new behavior**

In `listing-auto-translator.service.spec.ts`: rename all `service.run(...)` calls to `service.generateTranslations(...)`. Add `isAutoTranslated` to each row in the `activeListing` helper's translations (author row: `isAutoTranslated: false`). Replace the "skips when not ACTIVE" test with:

```ts
it('generates translations for a NEW listing (no ACTIVE requirement)', async () => {
  prisma.listing.findUnique.mockResolvedValue(
    activeListing({ status: ListingStatus.NEW }),
  );
  await service.generateTranslations(LISTING_ID);
  expect(prisma.listingTranslation.upsert).toHaveBeenCalledTimes(2); // UZ + EN
});

it('skips DELETED listings', async () => {
  prisma.listing.findUnique.mockResolvedValue(
    activeListing({ status: ListingStatus.DELETED }),
  );
  await service.generateTranslations(LISTING_ID);
  expect(prisma.listingTranslation.upsert).not.toHaveBeenCalled();
});

it('preserves a manually-edited target language (is_auto_translated=false)', async () => {
  prisma.listing.findUnique.mockResolvedValue(
    activeListing({
      translations: [
        { language: Language.RU, title: 'Квартира', description: 'Описание', addressNote: null, featuresText: 'Лифт', isAutoTranslated: false },
        { language: Language.EN, title: 'HAND-EDITED', description: null, addressNote: null, featuresText: null, isAutoTranslated: false },
      ],
    }),
  );
  await service.generateTranslations(LISTING_ID);
  // EN is hand-edited → skipped; only UZ is (re)generated.
  expect(prisma.listingTranslation.upsert).toHaveBeenCalledTimes(1);
  expect(prisma.listingTranslation.upsert.mock.calls[0][0].where.listingId_language.language).toBe(Language.UZ);
});
```

Keep the existing "translates author row", "null optional fields", "missing listing", "missing author row" tests (with `run` → `generateTranslations` and `isAutoTranslated` added to rows; the existing machine-row re-run test's UZ row gets `isAutoTranslated: true`).

- [ ] **Step 2: Run the spec to verify it fails**

Run: `cd apps/api && node_modules/.bin/jest src/translations/listing-auto-translator.service.spec.ts -v`
Expected: FAIL — `generateTranslations` is not a function / ACTIVE guard still present.

- [ ] **Step 3: Refactor the service**

Replace the `AUTHOR_TRANSLATION_SELECT` constant and the `run` method:

```ts
const TRANSLATION_STATE_SELECT = {
  language: true,
  title: true,
  description: true,
  addressNote: true,
  featuresText: true,
  isAutoTranslated: true,
} as const;

/**
 * Сгенерировать машинный перевод объявления на остальные языки (ADR-0091).
 * Зовётся синхронно из admin-эндпоинта генерации. Работает для любого
 * НЕ-DELETED листинга (модератор триггерит на NEW). Идемпотентно (upsert).
 * Целевой язык со строкой is_auto_translated=false (ручная правка модератора /
 * авторский оригинал) НЕ перезаписывается.
 */
async generateTranslations(listingId: string): Promise<void> {
  const listing = await this.prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      status: true,
      originalLanguage: true,
      translations: { select: TRANSLATION_STATE_SELECT },
    },
  });

  if (!listing || listing.status === ListingStatus.DELETED) {
    this.logger.debug(`Skipping translation for ${listingId}: missing or DELETED`);
    return;
  }

  const author = listing.translations.find(
    (t) => t.language === listing.originalLanguage,
  );
  if (!author) {
    this.logger.warn(`Listing ${listingId} has no author translation row; skipping`);
    return;
  }

  const from = listing.originalLanguage;
  const targets = ALL_LANGUAGES.filter((lang) => lang !== from);

  for (const to of targets) {
    const existing = listing.translations.find((t) => t.language === to);
    if (existing && !existing.isAutoTranslated) {
      this.logger.debug(`Preserving manual translation ${listingId}/${to}`);
      continue;
    }

    const data = {
      title: await this.translate(author.title, from, to),
      description: await this.translateNullable(author.description, from, to),
      addressNote: await this.translateNullable(author.addressNote, from, to),
      featuresText: await this.translateNullable(author.featuresText, from, to),
    };

    await this.prisma.listingTranslation.upsert({
      where: { listingId_language: { listingId, language: to } },
      create: { listingId, language: to, source: this.provider.source, isAutoTranslated: true, ...data },
      update: { source: this.provider.source, isAutoTranslated: true, ...data },
    });
  }

  this.logger.log(`Generated translations for listing ${listingId}`);
}
```

Remove the now-unused `AuthorTranslation` export if nothing else references it (grep first; keep if referenced).

- [ ] **Step 4: Run the spec to verify it passes**

Run: `cd apps/api && node_modules/.bin/jest src/translations/listing-auto-translator.service.spec.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/translations/listing-auto-translator.service.ts apps/api/src/translations/listing-auto-translator.service.spec.ts
git commit -m "feat(translations): generateTranslations protects manual edits, runs on NEW"
```

---

## Task 4: `TranslationsService.updateModeratorTranslation` + export translator

**Files:**
- Create: `apps/api/src/translations/dto/update-moderator-translation.dto.ts`
- Modify: `apps/api/src/translations/translations.service.ts`
- Test: `apps/api/src/translations/translations.service.spec.ts`
- Modify: `apps/api/src/translations/translations.module.ts`, `apps/api/src/translations/index.ts`

**Interfaces:**
- Consumes: `ListingTranslationInput` (existing: `{ title; description?; address_note?; features_text? }`), `prisma.listing.findUnique`, `prisma.listingTranslation.upsert`.
- Produces:
  - `UpdateModeratorTranslationDto` (snake_case body).
  - `TranslationsService.updateModeratorTranslation(listingId: string, language: Language, input: ListingTranslationInput): Promise<void>` — upserts the row with `is_auto_translated=false`; throws `404` (missing/DELETED) and `422` (language === original).
  - `TranslationsModule` exports `ListingAutoTranslator` (in addition to `TranslationsService`).

- [ ] **Step 1: Create the DTO**

`apps/api/src/translations/dto/update-moderator-translation.dto.ts`:

```ts
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Тело `PATCH /api/v1/admin/listings/:id/translations/:language` (ADR-0091).
 * Ручная правка перевода модератором; ставит is_auto_translated=false.
 */
export class UpdateModeratorTranslationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  address_note?: string;

  @IsOptional()
  @IsString()
  features_text?: string;
}
```

- [ ] **Step 2: Write the failing service test**

Add to `translations.service.spec.ts` (mock `prisma.listing.findUnique` + `prisma.listingTranslation.upsert`):

```ts
describe('updateModeratorTranslation', () => {
  it('upserts a non-original language with is_auto_translated=false', async () => {
    prisma.listing.findUnique.mockResolvedValue({ originalLanguage: Language.RU, status: ListingStatus.NEW });
    await service.updateModeratorTranslation(LISTING_ID, Language.EN, { title: 'Fixed EN' });
    const arg = prisma.listingTranslation.upsert.mock.calls[0][0];
    expect(arg.where.listingId_language).toEqual({ listingId: LISTING_ID, language: Language.EN });
    expect(arg.update).toMatchObject({ isAutoTranslated: false, title: 'Fixed EN' });
    expect(arg.create).toMatchObject({ isAutoTranslated: false, source: TranslationSource.USER, title: 'Fixed EN' });
  });

  it('rejects editing the original language (422)', async () => {
    prisma.listing.findUnique.mockResolvedValue({ originalLanguage: Language.RU, status: ListingStatus.NEW });
    await expect(
      service.updateModeratorTranslation(LISTING_ID, Language.RU, { title: 'x' }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('404 when listing missing or DELETED', async () => {
    prisma.listing.findUnique.mockResolvedValue(null);
    await expect(
      service.updateModeratorTranslation(LISTING_ID, Language.EN, { title: 'x' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
```

Ensure the spec's `prisma` mock has `listing: { findUnique: jest.fn() }` and `listingTranslation: { upsert: jest.fn() }`, and that `LISTING_ID` exists.

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/api && node_modules/.bin/jest src/translations/translations.service.spec.ts -v`
Expected: FAIL — `updateModeratorTranslation` not defined.

- [ ] **Step 4: Implement the method**

Add to `translations.service.ts` (imports: `HttpException`, `HttpStatus` from `@nestjs/common`; `Language`, `ListingStatus`, `TranslationSource` from `@prisma/client` — some already imported):

```ts
async updateModeratorTranslation(
  listingId: string,
  language: Language,
  input: ListingTranslationInput,
): Promise<void> {
  const listing = await this.prisma.listing.findUnique({
    where: { id: listingId },
    select: { originalLanguage: true, status: true },
  });
  if (!listing || listing.status === ListingStatus.DELETED) {
    throw new NotFoundException({
      code: ApiErrorCode.NOT_FOUND,
      message: 'Listing not found',
    });
  }
  if (language === listing.originalLanguage) {
    throw new HttpException(
      {
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Cannot edit the original-language translation',
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  const fields = {
    title: input.title,
    description: input.description ?? null,
    addressNote: input.address_note ?? null,
    featuresText: input.features_text ?? null,
  };

  await this.prisma.listingTranslation.upsert({
    where: { listingId_language: { listingId, language } },
    create: {
      listingId,
      language,
      source: TranslationSource.USER,
      isAutoTranslated: false,
      ...fields,
    },
    update: { isAutoTranslated: false, ...fields },
  });
}
```

- [ ] **Step 5: Export the translator from the module**

In `translations.module.ts` add `ListingAutoTranslator` to `exports`:

```ts
exports: [TranslationsService, ListingAutoTranslator],
```

(Optional) re-export the DTO from `translations/index.ts` if the admin controller imports via the barrel.

- [ ] **Step 6: Run the spec to verify it passes**

Run: `cd apps/api && node_modules/.bin/jest src/translations/translations.service.spec.ts -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/translations
git commit -m "feat(translations): moderator translation edit (is_auto_translated=false) + export translator"
```

---

## Task 5: Admin endpoints — generate + edit

**Files:**
- Modify: `apps/api/src/admin/admin-listings.controller.ts`
- Modify: `apps/api/src/admin/admin.module.ts`

**Interfaces:**
- Consumes: `ListingAutoTranslator.generateTranslations`, `TranslationsService.updateModeratorTranslation` + `TranslationsService.listByListing`, `UpdateModeratorTranslationDto`, `@CurrentUser()` → `AuthenticatedUser`.
- Produces:
  - `POST /api/v1/admin/listings/:id/translations/generate` → `ListingTranslationsResponse`.
  - `PATCH /api/v1/admin/listings/:id/translations/:language` (body `UpdateModeratorTranslationDto`) → `ListingTranslationsResponse`.

- [ ] **Step 1: Wire `TranslationsModule` into `AdminModule`**

In `admin.module.ts` add `TranslationsModule` to `imports`:

```ts
import { TranslationsModule } from '../translations';
// ...
imports: [RolesModule, ModerationModule, PromotionsModule, AuditModule, ComplaintsModule, TranslationsModule],
```

- [ ] **Step 2: Add the endpoints to `admin-listings.controller.ts`**

Inject the two providers and add a `ParseEnumPipe` for the language param. Add imports: `Body`, `Post`, `ParseEnumPipe`, `BadGatewayException` from `@nestjs/common`; `Language` from `@prisma/client`; `ListingAutoTranslator` + `TranslationsService` + `ListingTranslationsResponse` from `../translations`; `UpdateModeratorTranslationDto` from `../translations/dto/update-moderator-translation.dto`; `ApiErrorCode` from `../common/dto/error-response.dto`; `AuthenticatedUser` from `../common/guards`. `CurrentUser` is already imported from `../common/decorators` in this file (the existing class uses it for `changeStatus`).

```ts
constructor(
  private readonly moderationService: ModerationService,
  private readonly translator: ListingAutoTranslator,
  private readonly translations: TranslationsService,
) {}

/** `POST /api/v1/admin/listings/:id/translations/generate` — синхронная генерация (ADR-0091). */
@Post(':id/translations/generate')
async generateTranslations(
  @Param('id', ParseUUIDPipe) listingId: string,
  @CurrentUser() viewer: AuthenticatedUser,
): Promise<ListingTranslationsResponse> {
  try {
    await this.translator.generateTranslations(listingId);
  } catch {
    // Сбой внешнего провайдера перевода (Yandex 4xx/5xx) → 502, строки
    // неудачных языков не меняются (ADR-0091, спека §7).
    throw new BadGatewayException({
      code: ApiErrorCode.INTERNAL_ERROR,
      message: 'Translation provider failed',
    });
  }
  // Отсутствующий/DELETED листинг: generateTranslations молча выходит, а
  // listByListing бросит 404 — единый путь not-found.
  return this.translations.listByListing(listingId, viewer);
}

/** `PATCH /api/v1/admin/listings/:id/translations/:language` — ручная правка (ADR-0091). */
@Patch(':id/translations/:language')
async updateTranslation(
  @Param('id', ParseUUIDPipe) listingId: string,
  @Param('language', new ParseEnumPipe(Language)) language: Language,
  @Body() dto: UpdateModeratorTranslationDto,
  @CurrentUser() viewer: AuthenticatedUser,
): Promise<ListingTranslationsResponse> {
  await this.translations.updateModeratorTranslation(listingId, language, dto);
  return this.translations.listByListing(listingId, viewer);
}
```

Note: `listByListing` authorizes owner/MODERATOR/ADMIN and returns the full `ListingTranslationsResponse`; the controller class already carries `@Roles(MODERATOR, ADMIN)`.

- [ ] **Step 3: Build + run api tests**

Run: `cd apps/api && npm run build && node_modules/.bin/jest`
Expected: build clean; all suites PASS.

- [ ] **Step 4: Live smoke (Docker) — generate + edit + gate**

With the stack up and a `NEW` listing id `LID` and an admin Bearer token (OTP dev-code from api logs):

```bash
API=http://localhost:4000/api/v1; T=<admin_token>
# gate blocks before generation:
curl -s -X PATCH "$API/admin/listings/$LID/status" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"action":"APPROVE"}'   # expect 422
# generate:
curl -s -X POST "$API/admin/listings/$LID/translations/generate" -H "Authorization: Bearer $T"   # expect 200 + EN/UZ rows
# edit EN:
curl -s -X PATCH "$API/admin/listings/$LID/translations/EN" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"title":"Hand-fixed title"}'
# now approve succeeds:
curl -s -X PATCH "$API/admin/listings/$LID/status" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"action":"APPROVE"}'   # expect 200 ACTIVE
# regenerate keeps the hand-edited EN:
curl -s -X POST "$API/admin/listings/$LID/translations/generate" -H "Authorization: Bearer $T"   # EN title stays "Hand-fixed title"
```

Expected: 422 → 200(generate) → 200(edit) → 200(approve) → EN preserved on regenerate.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin
git commit -m "feat(admin): synchronous translation generate + moderator edit endpoints"
```

---

## Task 6: Web RTK Query endpoints + types

**Files:**
- Modify: `apps/web/src/store/api/adminTypes.ts`
- Modify: `apps/web/src/store/api/adminListingsApi.ts`

**Interfaces:**
- Consumes: existing `adminApi` (`tagTypes` includes `'Admin'`).
- Produces hooks: `useGetListingTranslationsQuery(id)`, `useGenerateTranslationsMutation()`, `useUpdateTranslationMutation()`; types `ListingTranslations`, `TranslationItem`, `TranslationEditRequest`.

- [ ] **Step 1: Add types to `adminTypes.ts`**

```ts
export type TranslationLanguage = 'UZ' | 'RU' | 'EN';

export interface TranslationItem {
  language: TranslationLanguage;
  source: 'USER' | 'GOOGLE' | 'YANDEX';
  is_auto_translated: boolean;
  title: string;
  description: string | null;
  address_note: string | null;
  features_text: string | null;
}

export interface ListingTranslations {
  listing_id: string;
  original_language: TranslationLanguage;
  translations: TranslationItem[];
}

export interface TranslationEditRequest {
  title: string;
  description?: string | null;
  address_note?: string | null;
  features_text?: string | null;
}
```

- [ ] **Step 2: Add endpoints to `adminListingsApi.ts`**

Add to the `endpoints` object and to the imports/exports:

```ts
// imports:
import type { /* ...existing... */ ListingTranslations, TranslationEditRequest } from './adminTypes';

// inside endpoints: (build) => ({ ...existing,
getListingTranslations: build.query<ListingTranslations, string>({
  query: (id) => ({ url: `/listings/${id}/translations` }),
  providesTags: ['Admin'],
}),
generateTranslations: build.mutation<ListingTranslations, string>({
  query: (id) => ({ url: `/admin/listings/${id}/translations/generate`, method: 'POST' }),
  invalidatesTags: ['Admin'],
}),
updateTranslation: build.mutation<
  ListingTranslations,
  { id: string; language: string; body: TranslationEditRequest }
>({
  query: ({ id, language, body }) => ({
    url: `/admin/listings/${id}/translations/${language}`,
    method: 'PATCH',
    body,
  }),
  invalidatesTags: ['Admin'],
}),
// })

// exports:
export const {
  useListAdminListingsQuery,
  useGetAdminListingQuery,
  useListingModerationLogsQuery,
  useModerateListingMutation,
  useGetListingTranslationsQuery,
  useGenerateTranslationsMutation,
  useUpdateTranslationMutation,
} = adminListingsApi;
```

- [ ] **Step 3: Type-check / build the web app**

Run: `cd apps/web && pnpm exec tsc --noEmit` (or `pnpm --filter @avino/web build`)
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/store/api/adminTypes.ts apps/web/src/store/api/adminListingsApi.ts
git commit -m "feat(web): RTK endpoints for listing translations (get/generate/update)"
```

---

## Task 7: Web moderation page — translations panel, generate, edit, APPROVE gating

**Files:**
- Modify: `apps/web/src/app/admin/listings/[id]/page.tsx`
- Create: `apps/web/src/components/admin/TranslationRow.tsx`

**Interfaces:**
- Consumes: `useGetListingTranslationsQuery`, `useGenerateTranslationsMutation`, `useUpdateTranslationMutation`, `useGetAdminListingQuery` (existing), `useToast`; `TranslationItem` + `TranslationEditRequest` from `@/store/api/adminTypes`.
- Produces: a "Переводы" card with a generate button + per-language editors; the APPROVE button disabled until all 3 languages are present.

- [ ] **Step 1: Load translations and compute completeness**

In the component body add:

```tsx
import {
  useGetAdminListingQuery,
  useModerateListingMutation,
  useListingModerationLogsQuery,
  useGetListingTranslationsQuery,
  useGenerateTranslationsMutation,
  useUpdateTranslationMutation,
} from '@/store/api/adminListingsApi';

const REQUIRED_LANGS = ['UZ', 'RU', 'EN'] as const;
// ...
const { data: tr } = useGetListingTranslationsQuery(id);
const [generate, { isLoading: isGenerating }] = useGenerateTranslationsMutation();
const [saveTr, { isLoading: isSavingTr }] = useUpdateTranslationMutation();

const presentLangs = new Set((tr?.translations ?? []).map((t) => t.language));
const translationsComplete = REQUIRED_LANGS.every((l) => presentLangs.has(l));
```

- [ ] **Step 2: Add the "Переводы" card (left column, after Параметры)**

Insert a new `a-card` rendering: RU/original read-only, each non-original language with editable `title`/`description` textareas, a per-language "Сохранить" button, and a "Правлено вручную" badge when `!is_auto_translated`. A top-level "Сгенерировать переводы" button calls `generate(id)`:

```tsx
<div className="a-card" style={{ padding: 22 }}>
  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
    <h3 style={{ fontSize: 16 }}>Переводы</h3>
    <button className="abtn abtn-outline abtn-sm" disabled={isGenerating}
      onClick={async () => {
        try { await generate(id).unwrap(); toast('Переводы сгенерированы'); }
        catch { toast('Не удалось сгенерировать переводы'); }
      }}>
      {isGenerating ? 'Генерация…' : 'Сгенерировать переводы'}
    </button>
  </div>
  {(tr?.translations ?? []).map((t) => (
    <TranslationRow key={t.language} item={t} saving={isSavingTr}
      original={t.language === tr?.original_language}
      onSave={async (body) => {
        try { await saveTr({ id, language: t.language, body }).unwrap(); toast('Перевод сохранён'); }
        catch { toast('Не удалось сохранить'); }
      }} />
  ))}
  {!tr?.translations?.length && <p className="muted" style={{ fontSize: 13.5 }}>Переводов пока нет — нажмите «Сгенерировать переводы».</p>}
</div>
```

Create `apps/web/src/components/admin/TranslationRow.tsx` exporting a `TranslationRow` component with props `{ item: TranslationItem; original: boolean; onSave: (body: TranslationEditRequest) => void; saving?: boolean }`. It holds local `title`/`description` state seeded from `item`, renders read-only when `original`, shows a "Правлено вручную" badge when `!item.is_auto_translated`, and a "Сохранить" button disabled while `saving`. Follow existing field styles (`.a-field`). Pass `saving={isSavingTr}` from the page.

- [ ] **Step 3: Gate the APPROVE button**

Change the publish button to require `translationsComplete`:

```tsx
{status !== 'ACTIVE' && (
  <button className="abtn abtn-ok" style={{ width: '100%' }}
    disabled={isActing || !translationsComplete}
    title={translationsComplete ? undefined : 'Сначала сгенерируйте переводы на все языки'}
    onClick={() => act('APPROVE')}>
    <IC.Check size={17} /> Опубликовать
  </button>
)}
```

Also map the backend `422` from `act('APPROVE')` to a clear message in `moderationErrorMessage` (e.g. when message contains "Translations required" → «Сначала сгенерируйте переводы на все языки»).

- [ ] **Step 4: Add i18n/admin strings if the page uses a string table**

This page uses inline RU literals (no i18n table), so just keep RU literals consistent. (If a shared admin dictionary exists, add keys there instead.)

- [ ] **Step 5: Build the web app**

Run: `cd apps/web && pnpm --filter @avino/web build`
Expected: build succeeds, no type errors.

- [ ] **Step 6: Live verify in the browser/Docker**

Rebuild the web image, open `/admin/listings/<NEW id>`: the publish button is disabled; click "Сгенерировать переводы" → EN/UZ appear; edit EN + save → badge "правлено вручную"; publish becomes enabled → click → ACTIVE; reopen and regenerate → hand-edited EN preserved.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/admin/listings/[id]/page.tsx apps/web/src/components/admin/TranslationRow.tsx
git commit -m "feat(web): moderation translations panel — generate, edit, gated publish"
```

---

## Task 8: Docs — ADR, API.md, DONE.md, spec status

**Files:**
- Create: `docs/adr/ADR-0091-moderator-translation-review.md`
- Modify: `docs/adr/ADR-0025-listing-translation-queue.md` (mark superseded)
- Modify: `docs/API.md`, `docs/DONE.md`
- Modify: `docs/superpowers/specs/2026-06-18-moderator-translation-generation-design.md` (status)

**Interfaces:** none (docs only).

- [ ] **Step 1: Write ADR-0091**

Create `docs/adr/ADR-0091-moderator-translation-review.md` following the repo's ADR format: Context (silent auto-on-approve gave no review; bug-prone async), Decision (moderator-driven synchronous generate + edit; APPROVE gated on full coverage; queue removed; manual edits flagged via `is_auto_translated=false`), Consequences (admin endpoints, dead queue removed, supersedes ADR-0025), and a "Supersedes: ADR-0025" line.

- [ ] **Step 2: Mark ADR-0025 superseded**

Add a header note to `ADR-0025-listing-translation-queue.md`: `> **Superseded by ADR-0091** — translation moved from the async queue to a synchronous moderator-triggered step; the queue/worker were removed.`

- [ ] **Step 3: Update API.md (§16 admin / §7 translations)**

Document the two new endpoints (request/response shapes) and the new `APPROVE` precondition: "перевод обязан существовать на все языки (UZ/RU/EN), иначе `422 VALIDATION_ERROR`". Note that `APPROVE` no longer triggers async translation.

- [ ] **Step 4: Add a DONE.md entry**

Add a dated entry summarizing the feature (moderator-controlled translation generation + review, queue removal, gated publish), files touched, and live-verify evidence.

- [ ] **Step 5: Flip the spec status**

In the design spec change `Статус:` to `реализовано (PR <number>)` once the PR is opened.

- [ ] **Step 6: Commit**

```bash
git add docs/adr/ADR-0091-moderator-translation-review.md docs/adr/ADR-0025-listing-translation-queue.md docs/API.md docs/DONE.md docs/superpowers/specs/2026-06-18-moderator-translation-generation-design.md
git commit -m "docs: ADR-0091 moderator translation review; supersede ADR-0025; API.md + DONE.md"
```

---

## Final verification (before PR)

- [ ] `cd apps/api && node_modules/.bin/jest && npm run build` → all green.
- [ ] `cd apps/web && pnpm --filter @avino/web build` → green.
- [ ] Full live path (Docker): NEW → publish disabled/422 → generate → edit → publish ACTIVE → `GET /listings/:id?lang=ru|en|uz` returns the right locale → regenerate preserves hand-edited row.
- [ ] Open PR `feat/moderator-translation-review` → `main`; ensure CI (api build+jest, web+client lint+build, OpenAPI drift if applicable) is green; user merges.
