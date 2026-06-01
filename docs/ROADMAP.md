# ROADMAP.md — Avino

## 1. Purpose

This roadmap defines the implementation plan for Avino MVP.

It must be used together with:

text CLAUDE.md ARCHITECTURE.md DB_SCHEMA.md API.md PRD.md 

Main rule:

text Each logical improvement = separate branch + 1–3 commits + Pull Request. No direct push to main. 

## 2. Project goal

Avino MVP must deliver:

text Web platform NestJS backend API PostgreSQL + PostGIS database Admin/moderation tools Listings with translations Search and map search Internal chat Favorites Saved searches Email/in-app notifications VIP/TOP promotion architecture Manual admin VIP/TOP activation Mobile-compatible API 

Mobile app implementation is handled separately, but backend API must be ready for Flutter.

## 3. MVP principles

### 3.1 Build small

Do not build the whole platform in one large PR.

Each stage must produce working, reviewable progress.

### 3.2 Backend first

Backend contracts must be stable before frontend and mobile depend on them.

### 3.3 API versioning from day one

All API routes must use:

text /api/v1/... 

Unversioned API routes are forbidden.

### 3.4 PostGIS from day one

Geo search must be designed with PostGIS from the beginning.

Do not fake geo search with plain latitude/longitude filters only.

### 3.5 Manual monetization first

VIP/TOP promotion logic must exist in MVP.

Online payment integration is not required in MVP.

MVP promotion flow:

text Admin manually activates VIP/TOP Promotion expires automatically Expired promotion is treated as NORMAL 

## 4. Milestones overview

text M0 — Documentation and architecture M1 — Monorepo and infrastructure setup M2 — Backend foundation M3 — Database and Prisma foundation M4 — Auth and users M5 — Listings and moderation M6 — Media uploads M7 — Translation system M8 — Search, filters and PostGIS M9 — Favorites and saved searches M10 — Notifications M11 — Internal chat M12 — VIP/TOP promotions M13 — Admin panel M14 — Web frontend M15 — Mobile API guide M16 — QA, hardening and deployment M17 — Phase 1.5 preparation 

## 5. M0 — Documentation and architecture

Goal:

text Create complete planning foundation before coding. 

Required docs:

text docs/CLAUDE.md docs/ARCHITECTURE.md docs/DB_SCHEMA.md docs/API.md docs/PRD.md docs/ROADMAP.md docs/TASKS.md docs/ENV.md docs/SECURITY.md docs/MOBILE_API_GUIDE.md 

Acceptance criteria:

text Architecture is approved DB schema is approved API v1 contract is approved MVP scope is clear Claude rules are clear 

Suggested branches:

text docs/architecture docs/db-schema docs/api-contract docs/prd docs/roadmap 

## 6. M1 — Monorepo and infrastructure setup

Goal:

text Create base project structure for backend, frontend, shared packages and docs. 

Tasks:

text Create monorepo structure Create apps/api Create apps/web Create packages/shared Create packages/config Create docs folder Create root package.json Create .gitignore Create README.md Create .env.example Create docker-compose.yml 

Recommended structure:

text avino/ ├── apps/ │   ├── api/ │   └── web/ ├── packages/ │   ├── shared/ │   └── config/ ├── docs/ ├── docker-compose.yml ├── .env.example ├── README.md └── package.json 

Acceptance criteria:

text Project installs successfully Docker compose starts PostgreSQL and Redis apps/api placeholder exists apps/web placeholder exists No secrets committed 

Suggested branch:

text chore/monorepo-setup 

Suggested commit messages:

text chore(repo): initialize monorepo structure chore(env): add docker compose and env example docs(readme): add initial project overview 

## 7. M2 — Backend foundation

Goal:

text Create NestJS backend foundation with versioned API and common infrastructure. 

Tasks:

text Initialize NestJS app Add global prefix api Enable URI versioning Add config module Add validation pipe Add global exception filter Add response format standard Add request logging Add health endpoint Add CORS config 

Required API:

text GET /api/v1/health 

Acceptance criteria:

text All routes are versioned No unversioned API routes exist Validation works globally Health endpoint returns OK 

Suggested branch:

text feat/api-foundation 

Suggested commit messages:

text feat(api): initialize NestJS backend feat(api): add versioned API foundation feat(health): add health endpoint 

## 8. M3 — Database and Prisma foundation

Goal:

text Add PostgreSQL, Prisma, PostGIS and initial schema foundation. 

Tasks:

text Install Prisma Configure DATABASE_URL Create initial Prisma schema Add PostgreSQL extensions migration Add PostGIS migration Add pg_trgm migration Add base enums Add users, roles and auth-related tables Add listings core tables Add indexes Add seed script for roles 

Required extensions:

sql CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pg_trgm; 

Acceptance criteria:

text Prisma migration runs successfully PostGIS extension is enabled Roles are seeded DB schema follows DB_SCHEMA.md 

Suggested branch:

text feat/database-foundation 

Suggested commit messages:

text feat(db): add Prisma and PostgreSQL schema foundation feat(db): add PostGIS and pg_trgm extensions feat(db): seed user roles 

## 9. M4 — Auth and users

Goal:

text Implement authentication by SMS/email OTP. 

Tasks:

text Create AuthModule Create UsersModule Create RolesModule Implement request OTP endpoint Implement verify OTP endpoint Implement access token Implement refresh token rotation Implement logout Implement profile endpoint Implement role guards Implement admin role management foundation Add OTP rate limiting Add audit logs for login 

Required API:

text POST /api/v1/auth/request-otp POST /api/v1/auth/verify-otp POST /api/v1/auth/refresh POST /api/v1/auth/logout GET /api/v1/me PATCH /api/v1/me 

Acceptance criteria:

text User can login by phone OTP User can login by email OTP Refresh token rotation works OTP is hashed Refresh token is hashed Role guard works 

Suggested branch:

text feat/auth-otp 

Suggested commit messages:

text feat(auth): add OTP request flow feat(auth): add OTP verification and tokens feat(users): add profile endpoint 

## 10. M5 — Listings and moderation

Goal:

text Implement listings CRUD and moderation queue. 

Tasks:

text Create ListingsModule Create ListingModerationModule Create listing DTOs Create listing create endpoint Create listing update endpoint Create listing detail endpoint Create owner listing list endpoint Create admin moderation list endpoint Create admin status update endpoint Add moderation logs Ensure only ACTIVE listings are public 

Required API:

text POST /api/v1/listings GET /api/v1/listings/:id PATCH /api/v1/listings/:id GET /api/v1/me/listings GET /api/v1/admin/listings PATCH /api/v1/admin/listings/:id/status 

Acceptance criteria:

text Authenticated owner/agent can create listing New listing status is NEW Admin can approve listing to ACTIVE Only ACTIVE listings are public Moderation log is created 

Suggested branch:

text feat/listings-moderation 

Suggested commit messages:

text feat(listings): add listing CRUD foundation feat(moderation): add listing moderation workflow feat(admin): add moderation queue endpoints 

## 11. M6 — Media uploads

Goal:

text Implement listing photo upload to S3-compatible storage. 

Tasks:

text Create UploadsModule Create ListingMediaModule Configure S3 client Validate MIME type Validate file size Strip EXIF metadata Upload original image Generate thumbnail if possible Save listing_media records Support sort_order 

Required API:

text POST /api/v1/listings/:id/media GET /api/v1/listings/:id/media PATCH /api/v1/listings/:id/media/sort DELETE /api/v1/listings/:id/media/:mediaId 

Acceptance criteria:

text Photos are stored in S3 Only allowed MIME types accepted EXIF stripping is documented or implemented Listing media records are saved Owner cannot upload media to another user's listing 

Suggested branch:

text feat/listing-media 

Suggested commit messages:

text feat(uploads): add S3 upload service feat(media): add listing photo upload feat(media): add media sorting endpoints 

## 12. M7 — Translation system

Goal:

text Support Uzbek, Russian and English listing translations. 

Tasks:

text Create TranslationModule Create listing_translations model/service Store original listing language Create translation job Integrate Google/Yandex Translate API abstraction Translate title and description Save auto-translated rows Add retry logic for failed translation jobs 

Required behavior:

text User creates listing in one language System stores original translation row System queues translation job System creates missing translations 

Acceptance criteria:

text Listing can have uz/ru/en translations Original text is marked as user source Auto translations are marked is_auto_translated Translation provider can be changed by env 

Suggested branch:

text feat/listing-translations 

Suggested commit messages:

text feat(translations): add listing translation schema feat(translations): add translation queue feat(translations): add provider abstraction 

## 13. M8 — Search, filters and PostGIS

Goal:

text Implement public listing search with filters, promotion sorting and geo search. 

Tasks:

text Create SearchModule Implement filter DTO Implement pagination Implement sorting Implement promotion priority sorting Implement city/district filters Implement price range filter Implement property type filter Implement transaction type filter Implement map bounds search Implement radius search Implement near me search Use PostGIS for geo queries 

Required API:

text GET /api/v1/search/listings GET /api/v1/search/map GET /api/v1/search/nearby 

Default sorting:

text VIP first TOP second NORMAL third created_at desc id desc 

Acceptance criteria:

text Only ACTIVE listings returned Expired VIP/TOP treated as NORMAL Radius search uses PostGIS Map bounds search works Search pagination is stable 

Suggested branch:

text feat/search-postgis 

Suggested commit messages:

text feat(search): add listing filter search feat(search): add PostGIS radius search feat(search): add promotion priority sorting 

## 14. M9 — Favorites and saved searches

Goal:

text Allow users to save listings and search filters. 

Tasks:

text Create FavoritesModule Create SavedSearchesModule Add favorite/unfavorite endpoints Add saved search CRUD Store filters_json with schemaVersion Prevent duplicate favorites Prepare saved search matcher 

Required API:

text POST /api/v1/favorites/:listingId DELETE /api/v1/favorites/:listingId GET /api/v1/favorites POST /api/v1/saved-searches GET /api/v1/saved-searches PATCH /api/v1/saved-searches/:id DELETE /api/v1/saved-searches/:id 

Acceptance criteria:

text Guest cannot save favorite Duplicate favorite is prevented Saved search stores versioned filters_json User can enable/disable saved search 

Suggested branch:

text feat/favorites-saved-searches 

Suggested commit messages:

text feat(favorites): add favorite listings feat(saved-searches): add saved search CRUD feat(saved-searches): add versioned filters storage 

## 15. M10 — Notifications

Goal:

text Implement in-app and email notification foundation. 

Tasks:

text Create NotificationsModule Create EmailModule Create notification records Create notification delivery records Add BullMQ email queue Add saved search alert job Add chat notification job Add moderation status notification Add promotion status notification 

Required API:

text GET /api/v1/notifications PATCH /api/v1/notifications/:id/read PATCH /api/v1/notifications/read-all 

Acceptance criteria:

text Notification records are created Email jobs are queued Saved search new listing can trigger email Chat message can trigger notification Promotion expiration can trigger notification 

Suggested branch:

text feat/notifications 

Suggested commit messages:

text feat(notifications): add notification records feat(email): add email queue foundation feat(notifications): add saved search alert job 

## 16. M11 — Internal chat

Goal:

text Implement internal chat between user and listing owner/agent. 

Tasks:

text Create ChatModule Create chat_threads Create chat_messages Create thread list endpoint Create start thread endpoint Create message send endpoint Create message read endpoint Prevent duplicate thread Validate sender belongs to thread Queue notification for new message 

Required API:

text POST /api/v1/chat/threads GET /api/v1/chat/threads GET /api/v1/chat/threads/:id POST /api/v1/chat/threads/:id/messages PATCH /api/v1/chat/threads/:id/read 

Rules:

text Use initiator_id and owner_id Do not use buyer_id and seller_id Guest cannot use chat Thread is linked to listing One thread per listing + initiator + owner 

Acceptance criteria:

text User can start chat with listing owner Duplicate thread is prevented Messages are saved New message creates notification job Polling-based MVP works 

Suggested branch:

text feat/internal-chat 

Suggested commit messages:

text feat(chat): add chat threads feat(chat): add chat messages feat(chat): add chat notifications 

## 17. M12 — VIP/TOP promotions

Goal:

text Implement manual VIP/TOP listing promotion management. 

Tasks:

text Create ListingPromotionModule Create promotion plan endpoint Create admin activate VIP/TOP endpoint Create admin cancel promotion endpoint Create admin extend promotion endpoint Update listings promotion read cache Add one active promotion per listing constraint Add promotion logs Add promotion expiration job Add promotion sorting integration with search 

Required API:

text GET /api/v1/promotions/plans GET /api/v1/admin/listings/:id/promotions POST /api/v1/admin/listings/:id/promotions PATCH /api/v1/admin/listing-promotions/:id/cancel PATCH /api/v1/admin/listing-promotions/:id/extend 

Rules:

text Promotion types: NORMAL, TOP, VIP Priority: VIP > TOP > NORMAL Periods: 7, 14, 30 days Only one ACTIVE promotion per listing Expired promotion is treated as NORMAL Online payment is not required in MVP 

Acceptance criteria:

text Admin can activate VIP/TOP Admin can cancel promotion Admin can extend promotion Promotion logs are created Expired promotion job exists Search ranks VIP above TOP above NORMAL 

Suggested branch:

text feat/listing-promotions 

Suggested commit messages:

text feat(promotions): add listing promotion model feat(promotions): add admin promotion management feat(search): rank promoted listings first 

## 18. M13 — Admin panel

Goal:

text Create admin/moderation UI. 

Tasks:

text Create admin layout Create admin auth guard Create user management page Create listing moderation page Create listing detail moderation view Create promotion management UI Create complaints page Create notification logs page Create audit logs page 

Acceptance criteria:

text Admin can review listings Admin can update listing status Admin can manually activate VIP/TOP Admin can cancel/extend promotion Admin can view users and logs 

Suggested branch:

text feat/admin-panel 

Suggested commit messages:

text feat(admin): add admin layout feat(admin): add listing moderation UI feat(admin): add promotion management UI 

## 19. M14 — Web frontend

Goal:

text Build user-facing Next.js frontend. 

Tasks:

text Create app layout Add i18n foundation Add language detection Add RTK Query base API Add homepage Add search page Add listing detail page Add map search UI Add listing create/edit flow Add auth flow Add favorites page Add saved searches page Add chat page Add notifications page Add owner/agent dashboard 

Required frontend rule:

text Use RTK Query for API access. Do not use random fetch or axios inside components. 

Acceptance criteria:

text User can browse listings User can search by filters User can view listing details User can create listing User can chat User can save favorites/searches Language switcher works 

Suggested branch examples:

text feat/web-foundation feat/web-search feat/web-listing-detail feat/web-listing-create feat/web-chat 

Suggested commit messages:

text feat(web): add app layout and i18n feat(web): add listing search page feat(web): add listing detail page 

## 20. M15 — Mobile API guide

Goal:

text Create documentation for Flutter developer. 

Tasks:

text Create docs/MOBILE_API_GUIDE.md Document auth flow Document listing search flow Document map search flow Document listing detail response Document favorites flow Document saved search flow Document chat flow Document notifications flow Document uploads flow Document promotion display fields 

Acceptance criteria:

text Flutter developer can implement mobile app from API guide All endpoints use /api/v1 Auth and refresh flow are clear Chat and notifications are clear 

Suggested branch:

text docs/mobile-api-guide 

Suggested commit messages:

text docs(mobile): add API guide for Flutter app docs(mobile): document auth and listing flows docs(mobile): document chat and notification flows 

## 21. M16 — QA, hardening and deployment

Goal:

text Prepare MVP for production launch. 

Tasks:

text Add production env validation Add rate limiting Add CORS production config Add logging Add error monitoring placeholder Add backup plan Add migration runbook Add deployment guide Test SMS provider Test email provider Test S3 upload Test Yandex Maps integration Test PostGIS search performance Test promotion expiration Test saved search alerts 

Acceptance criteria:

text Production env is documented Deployment guide exists Critical flows tested No secrets in git Health check works Basic logs exist 

Suggested branch:

text chore/production-readiness 

Suggested commit messages:

text chore(env): add production env validation docs(deploy): add deployment runbook test(mvp): add manual QA checklist 

## 22. M17 — Phase 1.5 preparation

Goal:

text Prepare next monetization and growth stage after MVP. 

Potential Phase 1.5 features:

text Online payment integration Payment transaction ledger Click/Payme/Uzum integration Automatic VIP/TOP activation after payment Agency subscriptions Trusted agency auto-publish Push notifications WebSocket chat Advanced analytics 

Not required for MVP.

## 23. Suggested implementation order

Recommended order:

text 1. M0 Documentation 2. M1 Monorepo setup 3. M2 Backend foundation 4. M3 Database foundation 5. M4 Auth and users 6. M5 Listings and moderation 7. M6 Media uploads 8. M7 Translations 9. M8 Search and PostGIS 10. M12 Promotions 11. M9 Favorites and saved searches 12. M10 Notifications 13. M11 Chat 14. M13 Admin panel 15. M14 Web frontend 16. M15 Mobile API guide 17. M16 QA and deployment 

Reason:

text Promotions should be implemented before final search/frontend because sorting depends on VIP/TOP priority. 

## 24. Definition of done per PR

Every PR must satisfy:

text Feature is scoped to one logical improvement Branch name follows CLAUDE.md 1–3 commits maximum where possible No unrelated files changed API routes are versioned DTO validation exists where needed Errors follow API.md format Security impact considered Docs updated if API/schema changes Manual checklist completed 

## 25. Claude task format

Each task sent to Claude should use:

text Текущая задача: - <specific task description> 

Claude must respond with:

text A) Нужно заливать в GitHub: ДА/НЕТ  B) Branch name: ...  C) Files changed: ...  D) Patch: ...  E) Git steps: ...  F) Pre-merge checklist: ... 

## 26. First coding task recommendation

After docs are approved, first coding task should be:

text Текущая задача: - Initialize Avino monorepo structure with apps/api, apps/web, packages/shared, packages/config, docs, root package.json, .gitignore, README.md, .env.example and docker-compose.yml. Do not implement business logic yet. 

Expected branch:

text chore/monorepo-setup 

Expected commit messages:

text chore(repo): initialize monorepo structure chore(env): add docker compose and env example docs(readme): add initial project overview 

## 27. Roadmap status tracking

Use this status format:

text TODO IN_PROGRESS REVIEW DONE BLOCKED 

Recommended tracking table:

text Milestone | Status | Branch | PR | Notes M0        | DONE   | docs/* | -  | Architecture and schema docs M1        | TODO   | -      | -  | Monorepo setup M2        | TODO   | -      | -  | Backend foundation 

This table can be maintained manually in docs/TASKS.md.