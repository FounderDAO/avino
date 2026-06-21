# Notifications: Localized Email + Firebase Push — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.
> Steps use checkbox (`- [ ]`) syntax. Spec: `docs/superpowers/specs/2026-06-22-notifications-email-push-design.md`.

**Goal:** Add the missing delivery layer so notifications are sent by localized email and
Firebase (FCM) push, in each recipient's chosen language, extensibly.

**Architecture:** Strictly additive. Producers and the in-app read-path are untouched. A new
`NotificationDelivery` table tracks per-(notification, channel) email/push delivery. A BullMQ
repeatable `NotificationDispatcher` fans out recent notifications to channels per a routing
policy, renders localized content, and delivers via the existing `email_queue` and a new
config-gated `FcmService`. Admin kill-switches mirror the SMS toggle.

**Tech Stack:** NestJS, Prisma/PostgreSQL, BullMQ (`bullmq`), nodemailer (existing email),
`firebase-admin` (new), Next.js 15 + RTK Query (admin web), next-intl (client).

## Global Constraints

- Backend responses are **camelCase**; there is NO global snake_case transformer — do not add one.
- Migrations apply in **staging/CI** (no local `DATABASE_URL`); hand-author `migration.sql`.
- New admin route → **regenerate `openapi.internal.json`** (preview-mode, 4 dummy env) or CI drift fails.
- Subagents **never run git**; the controller owns all git and does surgical `git add`.
- Config-gated: no SMTP/FCM creds → dev logs, prod silently skips (mirror `EmailSender.deliver`).
- Language resolution: `profile.preferredLanguage ?? user.defaultLanguage`, fallback `RU`.
- i18n copy must have **RU/UZ/EN parity**; no hardcoded user-facing strings outside the catalog.
- Финансы → не трогаем; prose в доках на русском, идентификаторы/код — английский.
- Do NOT modify `SmsSendingToggle.tsx` / `TelegramNotificationsToggle.tsx` (uncommitted WIP).

---

## File Structure

**apps/api (backend):**
- `prisma/schema.prisma` — add `NotificationDelivery` model + back-relation on `Notification`.
- `prisma/migrations/20260622000000_notification_deliveries/migration.sql` — new (hand-authored).
- `src/config/configuration.ts` — `notifications` namespace, `firebase` namespace, `app.publicUrl`.
- `src/config/env.validation.ts` — optional new env.
- `.env.example` — new env block.
- `src/notifications/notification.constants.ts` — toggle keys + `resolveNotificationChannelEnabled`.
- `src/admin/admin-notification-settings.service.ts` / `.controller.ts` / `dto/update-notification-settings.dto.ts` — admin toggle.
- `src/notifications/delivery/notification-routing.ts` — type→channels policy.
- `src/notifications/delivery/notification-templates.ts` — i18n catalog + HTML wrapper + URL builder.
- `src/notifications/delivery/notification-renderer.service.ts` — render email/push per language.
- `src/notifications/delivery/fcm.service.ts` — FCM sender (config-gated).
- `src/notifications/delivery/notification-dispatcher.service.ts` — fan-out + deliver.
- `src/queues/queue.constants.ts` — dispatch queue/job constants.
- `src/notifications/delivery/notification-dispatch.queue.ts` — repeatable producer.
- `src/notifications/delivery/notification-dispatch.worker.ts` — BullMQ consumer.
- `src/notifications/notifications.module.ts` — wire new providers.
- `src/admin/admin.module.ts` — wire admin settings.
- Tests alongside each (`*.spec.ts`).

**apps/web (admin):**
- `src/components/admin/NotificationsSendingToggle.tsx` — new toggle pair.
- `src/lib/store/notificationSettingsApi.ts` (or existing api slice dir) — RTK Query slice.
- settings page (`src/app/admin/settings/page.tsx` or equivalent) — mount the toggle.

**apps/client (public):**
- `src/features/account/notificationText.ts` — add `TOUR_REQUEST_STATUS_CHANGED` case.
- `messages/{ru,uz,en}.json` — add `TOUR_REQUEST_STATUS_CHANGED` keys.

**docs:**
- `docs/ADR/ADR-0102-notification-delivery.md` (follow existing ADR naming), `docs/GUIDE_FIREBASE_PUSH_SETUP.md`,
  `docs/DONE.md` + `docs/TASKS.md` entries.

---

## Task 1 (B1): Foundation — schema, migration, config, dependency, admin toggle

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Notification back-relation + new model)
- Create: `apps/api/prisma/migrations/20260622000000_notification_deliveries/migration.sql`
- Modify: `apps/api/src/config/configuration.ts`, `apps/api/src/config/env.validation.ts`, `apps/api/.env.example`
- Create: `apps/api/src/notifications/notification.constants.ts`
- Create: `apps/api/src/admin/admin-notification-settings.service.ts`, `.controller.ts`, `apps/api/src/admin/dto/update-notification-settings.dto.ts`
- Modify: `apps/api/src/admin/admin.module.ts`
- Test: `apps/api/src/admin/admin-notification-settings.service.spec.ts`
- Add dependency: `firebase-admin`

**Interfaces produced:**
- Prisma model `NotificationDelivery { id, notificationId, channel, status, attempts, lastError?, sentAt?, createdAt, updatedAt }`, unique `(notificationId, channel)`.
- `NOTIFICATION_EMAIL_ENABLED_KEY = 'email_notifications_enabled'`, `NOTIFICATION_PUSH_ENABLED_KEY = 'push_notifications_enabled'`.
- `resolveNotificationChannelEnabled(stored: string|null|undefined, envDefault: boolean): boolean`.
- `AdminNotificationSettingsService.get(): Promise<{emailEnabled:boolean; pushEnabled:boolean}>` and `.update(adminId, dto): Promise<{emailEnabled:boolean; pushEnabled:boolean}>`.
- HTTP: `GET /api/v1/admin/notification-settings` → `{emailEnabled, pushEnabled}`; `PATCH` body `{emailEnabled?:boolean; pushEnabled?:boolean}`.
- Config: `notifications.{emailEnabled,pushEnabled,dispatchCron,dispatchLookbackMin,dispatchBatch,dispatchConcurrency,emailChatThrottleMin}`, `firebase.{projectId,clientEmail,privateKey}`, `app.publicUrl`.

- [ ] **Step 1.1** Add to `schema.prisma`: in `model Notification {}` add relation field `deliveries NotificationDelivery[]`. Add new model (mirror spec §3.1) using existing enums `NotificationChannel`/`NotificationStatus`. Keep `@db.Uuid`, `@db.Timestamptz(6)`, `@map` snake_case to match repo conventions.
- [ ] **Step 1.2** Hand-author `migration.sql`:
```sql
-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_deliveries_notification_id_channel_key" ON "notification_deliveries"("notification_id", "channel");
CREATE INDEX "notification_deliveries_status_created_at_idx" ON "notification_deliveries"("status", "created_at");
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```
  (Verify `gen_random_uuid()` vs `uuid_generate_v4()` against an existing migration; match what the repo uses.)
- [ ] **Step 1.3** Run `pnpm --filter @avino/api exec prisma generate` to regenerate the client (NOT `migrate dev` — no DB). Verify `NotificationDelivery` type appears in generated client.
- [ ] **Step 1.4** `pnpm --filter @avino/api add firebase-admin`. Verify it lands in `apps/api/package.json` dependencies and lockfile updates.
- [ ] **Step 1.5** Config: in `configuration.ts` add `registerAs('notifications', ...)` reading the env from spec §4 (with defaults); extend/add `registerAs('firebase', () => ({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') }))`; add `publicUrl: process.env.APP_PUBLIC_URL ?? 'https://avino.uz'` to the `app` namespace. Register new namespaces in the ConfigModule `load: [...]` array. Add optional validators to `env.validation.ts` and document in `.env.example`.
- [ ] **Step 1.6** Create `notification.constants.ts` mirroring `sms.constants.ts`: the two keys + `resolveNotificationChannelEnabled`.
- [ ] **Step 1.7** Admin toggle: create `UpdateNotificationSettingsDto` (`emailEnabled?:boolean @IsBoolean @IsOptional`, `pushEnabled?` same), `AdminNotificationSettingsService` (mirror `AdminSmsSettingsService`: upsert each provided key into `app_settings`, write `auditLog` action `NOTIFICATION_SETTINGS_UPDATE`, return current `{emailEnabled,pushEnabled}` resolved against env defaults), `AdminNotificationSettingsController` (`@Controller({path:'admin/notification-settings',version:'1'})`, `@Roles(ADMIN)`, GET+PATCH). Wire both into `admin.module.ts`.
- [ ] **Step 1.8** Test `admin-notification-settings.service.spec.ts` (mirror sms spec): get returns env defaults when no rows; update upserts + audits; partial update only touches provided key.
- [ ] **Step 1.9** Run `pnpm --filter @avino/api test -- admin-notification-settings` → PASS. Run `pnpm --filter @avino/api exec tsc --noEmit` (or `nest build`) → clean.

---

## Task 2 (B2): Delivery core — routing, i18n catalog, renderer, FCM

**Depends on:** Task 1 (generated `NotificationDelivery` type, config namespaces, `firebase-admin`).

**Files:**
- Create: `apps/api/src/notifications/delivery/notification-routing.ts` (+ `.spec.ts`)
- Create: `apps/api/src/notifications/delivery/notification-templates.ts` (+ `.spec.ts`)
- Create: `apps/api/src/notifications/delivery/notification-renderer.service.ts` (+ `.spec.ts`)
- Create: `apps/api/src/notifications/delivery/fcm.service.ts` (+ `.spec.ts`)
- Modify: `apps/api/src/notifications/notifications.module.ts` (register `NotificationRenderer`, `FcmService`; import `EmailModule`/`PrismaModule`/`ConfigModule` as needed)

**Interfaces produced:**
- `notificationRouting: Record<NotificationType, NotificationChannel[]>` and helper `channelsFor(type): NotificationChannel[]`; `EMAIL_THROTTLED_TYPES: Set<NotificationType>` (contains `NEW_CHAT_MESSAGE`).
- `type RenderedEmail = { subject: string; html: string; text: string }`; `type RenderedPush = { title: string; body: string; data: Record<string,string> }`.
- `NotificationRenderer.renderEmail(n: NotificationContext, lang: Language): Promise<RenderedEmail | null>` and `.renderPush(n, lang): Promise<RenderedPush | null>` where `NotificationContext = { id: string; type: NotificationType; dataJson: Prisma.JsonValue }`. Returns `null` when the type has no template for that channel.
- `FcmService.isConfigured(): boolean`; `FcmService.send(tokens: string[], payload: {title:string; body:string; data:Record<string,string>}): Promise<{ successCount:number; invalidTokens:string[] }>`.

- [ ] **Step 2.1** `notification-routing.ts`: the policy map from spec §3.2 (every `NotificationType` mapped; channels = subset of `[IN_APP, EMAIL, PUSH]`). `channelsFor` returns only EMAIL/PUSH (IN_APP handled by producers, not delivered here). Export `EMAIL_THROTTLED_TYPES`.
- [ ] **Step 2.2** `notification-routing.spec.ts`: assert every enum member is a key; assert `SAVED_SEARCH_NEW_LISTING` has no EMAIL (digest dedupe), `NEW_CHAT_MESSAGE` is throttled.
- [ ] **Step 2.3** `notification-templates.ts`: catalog `Record<NotificationType, Partial<Record<Language, NotificationCopy>>>` for the active types (NEW_CHAT_MESSAGE, NEW_LEAD, TOUR_REQUEST_STATUS_CHANGED, LISTING_MODERATION_STATUS_CHANGED, SAVED_SEARCH_NEW_LISTING[push only], PROMOTION_EXPIRED). RU/UZ/EN copy mirroring `apps/client/messages/*.json` `accounts.notifications.types.*`. Add a `renderEmailHtml(brandedBody, ctaUrl, ctaLabel, lang)` wrapper (inline-styled, email-safe) and `buildDeepLink(publicUrl, type, dataJson)` → portal URL (listing `/<lang>/listing/:id`, chat `/<lang>/account/messages`, tours `/<lang>/account/tours`). Interpolation tokens documented per type (e.g. `{listingTitle}`, `{senderName}`, `{reason}`). Provide an internal `pickCopy(type, lang)` with RU fallback.
- [ ] **Step 2.4** `notification-templates.spec.ts`: for every active type × {RU,UZ,EN}: copy exists for routed channels, subject/title non-empty, no `undefined`/raw token left after interpolation with sample data.
- [ ] **Step 2.5** `notification-renderer.service.ts`: injects `PrismaService`, `ConfigService`. Resolves language for a recipient (`profile.preferredLanguage ?? user.defaultLanguage`). Loads referenced entities from `dataJson` ids (listing title, sender display name) via Prisma — tolerate missing entities (fallback copy). Builds `RenderedEmail`/`RenderedPush` using the catalog + wrapper + deep link. `data` map for push: stringify ids (`type`, `notificationId`, `listingId?`, `threadId?`).
- [ ] **Step 2.6** `notification-renderer.service.spec.ts`: NEW_LEAD email in UZ has UZ subject + listing title + CTA URL; NEW_CHAT_MESSAGE push in EN has EN title + `data.threadId`; unknown/templateless type → `null`.
- [ ] **Step 2.7** `fcm.service.ts`: lazy `firebase-admin` init guarded by `isConfigured()` (all three firebase config values present). `initApp()` uses `cert({projectId,clientEmail,privateKey})`, memoized; reuses existing app if already initialized. `send()` → `getMessaging().sendEachForMulticast({tokens, notification:{title,body}, data})`; collect tokens whose error code is `messaging/registration-token-not-registered` or `messaging/invalid-registration-token` into `invalidTokens`. Not configured → dev: `logger.warn('[DEV PUSH → …]')` returning `{successCount:0,invalidTokens:[]}`; prod: warn + same. Never throw on missing creds.
- [ ] **Step 2.8** `fcm.service.spec.ts`: `isConfigured()` false when creds absent → `send` returns zero, does not import/init firebase; with `firebase-admin` mocked, `send` maps `not-registered` responses to `invalidTokens`.
- [ ] **Step 2.9** Register `NotificationRenderer` + `FcmService` as providers in `notifications.module.ts` (export if needed). Run `pnpm --filter @avino/api test -- notifications/delivery` → PASS; `nest build` clean.

---

## Task 3 (B3): Dispatcher — fan-out + deliver, wired & scheduled

**Depends on:** Task 2.

**Files:**
- Modify: `apps/api/src/queues/queue.constants.ts` (`NOTIFICATION_DISPATCH_QUEUE_NAME='notification_dispatch_queue'`, `DISPATCH_NOTIFICATIONS_JOB='dispatch_notifications'`, payload type)
- Create: `apps/api/src/notifications/delivery/notification-dispatch.queue.ts` (mirror `SavedSearchQueue`)
- Create: `apps/api/src/notifications/delivery/notification-dispatch.worker.ts` (mirror `SavedSearchWorker`)
- Create: `apps/api/src/notifications/delivery/notification-dispatcher.service.ts` (+ `.spec.ts`)
- Modify: `apps/api/src/notifications/notifications.module.ts` (register queue, worker, dispatcher; import `EmailModule`)

**Interfaces consumed:** `channelsFor`, `EMAIL_THROTTLED_TYPES`, `NotificationRenderer`, `FcmService`, `resolveNotificationChannelEnabled` + keys, `EmailService.sendEmail`.

**Interfaces produced:** `NotificationDispatcherService.run(): Promise<void>`.

- [ ] **Step 3.1** Add queue/job constants + `type DispatchNotificationsJobData = Record<string, never>` to `queue.constants.ts`.
- [ ] **Step 3.2** `notification-dispatch.queue.ts`: `onModuleInit` `upsertJobScheduler('dispatch-notifications', {pattern: cron}, {name: DISPATCH_NOTIFICATIONS_JOB, data:{}, opts:{removeOnComplete:true, removeOnFail:100}})`; cron from `notifications.dispatchCron`. `onModuleDestroy` closes.
- [ ] **Step 3.3** `notification-dispatch.worker.ts`: `new Worker(NOTIFICATION_DISPATCH_QUEUE_NAME, () => this.dispatcher.run(), {connection, concurrency: notifications.dispatchConcurrency ?? 1})`; log failures.
- [ ] **Step 3.4** `notification-dispatcher.service.ts` `run()`:
  - **isEmailEnabled()/isPushEnabled()** helpers reading `app_settings` keys with env fallback (try/catch → env default), mirror `SmsService.isEnabled`.
  - **Fan-out:** select `notification` rows where `createdAt > now - lookbackMin` and `type` has EMAIL/PUSH channels, left-join `notification_deliveries`; for each missing (notification, channel) create a PENDING delivery. For EMAIL on a throttled type, skip creation if another EMAIL delivery exists for the same recipient+`threadId` created within `emailChatThrottleMin`. Wrap creates in try/catch to swallow unique-constraint races.
  - **Deliver:** select PENDING + (FAILED with `attempts < 3`) deliveries (limit `dispatchBatch`), join notification + recipient (`user.email`, `profile.preferredLanguage`, `defaultLanguage`, active devices). Per delivery: if channel disabled globally → leave PENDING, continue. EMAIL: `renderEmail`; if `null` or no recipient email → mark `FAILED`(`lastError`) ; else `emailService.sendEmail({to, subject, text, html})` → mark `SENT, sentAt`. PUSH: gather active device tokens; if none → `FAILED`('no devices'); render push; `fcmService.send(tokens, payload)` → on `successCount>0` `SENT` else `FAILED`; deactivate `invalidTokens` (`updateMany isActive=false`). On exception → `attempts++`, `status=FAILED`, `lastError=err.message`.
- [ ] **Step 3.5** `notification-dispatcher.service.spec.ts` (Prisma + EmailService + FcmService mocked): (a) fan-out creates EMAIL+PUSH deliveries for NEW_LEAD; (b) re-run is idempotent (no dupes); (c) EMAIL disabled → delivery stays PENDING, sendEmail NOT called; (d) chat email throttled within window → no second EMAIL delivery; (e) PUSH with invalid token → device deactivated + delivery handled; (f) FAILED with attempts≥3 not retried.
- [ ] **Step 3.6** Wire into `notifications.module.ts`: providers `NotificationDispatcherService`, `NotificationDispatchQueue`, `NotificationDispatchWorker`; ensure `EmailModule` imported. Guard worker/queue start on `redis.url` like saved-search (throw if missing in prod path is acceptable — mirror existing).
- [ ] **Step 3.7** Run full api suite `pnpm --filter @avino/api test` → all green (≥534 + new). `nest build` clean.

---

## Task 4 (W): Admin web toggle (parallel with B2/B3)

**Depends on:** the admin endpoint CONTRACT from Task 1 (not its code).

**Files:**
- Create: `apps/web/src/components/admin/NotificationsSendingToggle.tsx`
- Create/Modify: RTK Query slice for `notification-settings` (follow the existing SMS settings slice; same dir/pattern)
- Modify: admin settings page to mount `<NotificationsSendingToggle />` near the SMS/Telegram toggles

**Interfaces consumed:** `GET /api/v1/admin/notification-settings → {emailEnabled, pushEnabled}`, `PATCH` body `{emailEnabled?, pushEnabled?}`.

- [ ] **Step 4.1** Find the existing SMS settings RTK slice + `SmsSendingToggle.tsx` (read-only, do not edit them). Mirror them.
- [ ] **Step 4.2** Create the `notificationSettingsApi` slice: `getNotificationSettings` query + `updateNotificationSettings` mutation (invalidates the query tag).
- [ ] **Step 4.3** Create `NotificationsSendingToggle.tsx`: two switches (Email / Push) bound to the query, optimistic disable while mutating, RU labels («Email-уведомления», «Push-уведомления (моб. приложение)»). Reuse the same UI primitives as `SmsSendingToggle`.
- [ ] **Step 4.4** Mount it on the settings page next to the existing toggles.
- [ ] **Step 4.5** `pnpm --filter @avino/web exec next build` (or lint+tsc) → clean.

---

## Task 5 (C): Client notification i18n parity (parallel)

**Files:**
- Modify: `apps/client/src/features/account/notificationText.ts`
- Modify: `apps/client/messages/ru.json`, `uz.json`, `en.json` (one writer — do all three in this task)

- [ ] **Step 5.1** Add a `case 'TOUR_REQUEST_STATUS_CHANGED':` to `notificationContent` reading `d.status` → status-specific body keys (mirror the LISTING_MODERATION_STATUS_CHANGED dynamic-key approach).
- [ ] **Step 5.2** Add `accounts.notifications.types.TOUR_REQUEST_STATUS_CHANGED` keys to ru/uz/en (`title`, per-status `body_*`, generic `body`). Keep parity across all three files.
- [ ] **Step 5.3** `pnpm --filter @avino/client test` (or `next build`) → clean; verify no missing-key warnings for the new namespace.

---

## Task 6 (controller): Integration, docs, OpenAPI, PR

(Performed by the controller, not a subagent.)

- [ ] **Step 6.1** `pnpm --filter @avino/api exec prisma generate` (ensure client current); full `pnpm --filter @avino/api test`; `nest build`.
- [ ] **Step 6.2** Regenerate OpenAPI: `pnpm --filter @avino/api openapi:export` with 4 dummy env (JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, etc. — match the existing export recipe); `git diff` the `openapi.internal.json` shows the new admin route only. Public doc unaffected (admin excluded).
- [ ] **Step 6.3** Build web + client.
- [ ] **Step 6.4** Write ADR-0102, `GUIDE_FIREBASE_PUSH_SETUP.md`, DONE.md/TASKS.md entries.
- [ ] **Step 6.5** Surgical `git add` of only feature files (NO pre-existing dirty files); commit logically; push branch; open PR (NOT merge — main is protected). PR body lists prod-TODO (SMTP + Firebase creds, live-verify by owner).

---

## Self-Review (spec coverage)

- Localized email ✓ (Tasks 2,3) · Firebase push + token storage ✓ (device table exists; Tasks 2,3) ·
  extensible ✓ (routing + catalog seam) · admin kill-switch ✓ (Task 1,4) · language by user choice ✓
  (renderer) · throttle anti-spam ✓ (Task 3) · config-gated ✓ · migration ✓ · OpenAPI ✓ · docs ✓.
- No placeholders: each task lists exact files, signatures, and the non-obvious code (migration SQL,
  routing, FCM dead-token handling, dispatcher branches) is spelled out; mechanical mirrors reference
  the exact existing file to copy.
