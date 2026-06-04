# TASKS.md — Avino

## 1. Purpose

This file is the execution task list for Claude.

Claude must complete tasks one by one.

Each task must follow:

```text
Separate branch
1–3 commits
Pull Request
No direct push to main
No unrelated changes
```

Claude must always follow:

```text
CLAUDE.md
ARCHITECTURE.md
DB_SCHEMA.md
API.md
PRD.md
ROADMAP.md
```

## Task completion workflow

After each task is completed and merged, Claude must update project tracking files.

### Rule 1 — Move completed task to DONE.md

When a task is fully completed and merged, it must be removed from docs/TASKS.md and moved to docs/DONE.md.

docs/TASKS.md must contain only:

```text
TODO
IN_PROGRESS
REVIEW
BLOCKED
```

Completed tasks must not stay in TASKS.md.

docs/DONE.md must contain completed tasks grouped by date or milestone.

DONE entry format:

```text
## YYYY-MM-DD

### TASK-XXX — Task title

Status: DONE
Branch: <branch-name>
PR: <PR link or PR number>

Files changed:
- <file-1>
- <file-2>

Summary:
- What was implemented
- Why it was needed
- Important notes

Commit messages:
- <commit message 1>
- <commit message 2>

Related ADR:
- docs/adr/ADR-XXXX-short-title.md
```

### Rule 2 — ADR is required for each completed task

Every completed task must create or update an ADR.

ADR means Architecture Decision Record.

ADR is required because Avino must have a clear history of technical and business decisions.

ADR files must be stored in:

```text
docs/adr/
```

ADR filename format:

```text
ADR-0001-short-title.md
ADR-0002-short-title.md
ADR-0003-short-title.md
```

Examples:

```text
docs/adr/ADR-0001-use-nestjs-nextjs-postgis.md
docs/adr/ADR-0002-api-versioning-v1.md
docs/adr/ADR-0003-vip-top-promotion-model.md
```

### Rule 3 — ADR format

Each ADR must use this format:

```markdown
# ADR-XXXX — Title

## Status

Accepted

## Date

YYYY-MM-DD

## Context

Describe the problem, requirement, or reason for the decision.

## Decision

Describe the decision that was made.

## Consequences

Positive:
- ...

Negative / trade-offs:
- ...

## Related files

- ...

## Related task

- TASK-XXX
```

### Rule 4 — Small tasks can share one ADR

If a task is purely mechanical and does not introduce a real decision, Claude may update an existing ADR instead of creating a new one.

Examples where new ADR is required:

```text
Choosing API versioning strategy
Choosing PostGIS for geo search
Choosing RTK Query for frontend API layer
Choosing VIP/TOP promotion model
Choosing polling before WebSocket for MVP chat
Choosing manual promotion activation before online payments
```

Examples where existing ADR can be updated:

```text
Adding a missing endpoint under already approved API strategy
Fixing formatting in docs
Adding indexes already defined in DB_SCHEMA.md
Adding DTO validation under existing API rules
```

### Rule 5 — Claude completion response must include DONE/ADR actions

When Claude finishes a task, the answer must include:

```text
A) Нужно заливать в GitHub: ДА

B) Branch name: ...

C) Files changed: ...

D) Patch: ...

E) Git steps: ...

F) Pre-merge checklist: ...

G) After merge actions:
- Move TASK-XXX from docs/TASKS.md to docs/DONE.md
- Create/update ADR: docs/adr/ADR-XXXX-short-title.md
```

### Rule 6 — Do not mark task DONE before merge

Task status rules:

```text
TODO         Task not started
IN_PROGRESS  Branch is being worked on
REVIEW       PR is open and waiting for review
DONE         PR is merged
BLOCKED      Task cannot continue because dependency or decision is missing
```

Only merged tasks can be moved to DONE.md.

### Rule 7 — DONE.md must not replace git history

DONE.md is a human-readable project log.

It does not replace:

```text
git commits
Pull Requests
ADR files
```

Claude must still provide git commands, commit messages and PR description for every task.

## 2. Task status values

Use these statuses:

```text
TODO
IN_PROGRESS
REVIEW
DONE
BLOCKED
```

## 3. Task format

Each task has:

```text
Task ID
Title
Status
Branch
Scope
Files expected
Acceptance criteria
Suggested commits
Dependencies
```

Claude must not combine multiple unrelated tasks in one PR.

## 4. M0 — Documentation tasks

### TASK-000 — Fix ROADMAP.md content

Status:

```text
TODO
```

Branch:

```text
docs/fix-roadmap-content
```

Scope:

```text
Replace incorrect PRD content inside docs/ROADMAP.md with real roadmap content.
Use approved roadmap structure.
Do not change other docs.
```

Files expected:

```text
docs/ROADMAP.md
```

Acceptance criteria:

```text
ROADMAP.md title is "# ROADMAP.md — Avino"
ROADMAP.md contains implementation milestones
No PRD duplicated content remains
No unrelated files changed
```

Suggested commits:

```text
docs(roadmap): replace incorrect PRD content
```

Dependencies:

```text
None
```

---

### TASK-001 — Create TASKS.md

Status:

```text
TODO
```

Branch:

```text
docs/tasks
```

Scope:

```text
Create docs/TASKS.md with small implementation tasks for Claude.
```

Files expected:

```text
docs/TASKS.md
```

Acceptance criteria:

```text
Tasks are split into small PR-sized items
Each task has branch, files, criteria and dependencies
No backend code is added
```

Suggested commits:

```text
docs(tasks): add implementation task list
```

Dependencies:

```text
None
```

---

### TASK-002 — Review docs consistency

Status:

```text
TODO
```

Branch:

```text
docs/consistency-review
```

Scope:

```text
Review CLAUDE.md, ARCHITECTURE.md, DB_SCHEMA.md, API.md, PRD.md, ROADMAP.md and TASKS.md for conflicts.
Fix only small naming/format inconsistencies.
Do not change architecture without approval.
```

Files expected:

```text
docs/CLAUDE.md
docs/ARCHITECTURE.md
docs/DB_SCHEMA.md
docs/API.md
docs/PRD.md
docs/ROADMAP.md
docs/TASKS.md
```

Acceptance criteria:

```text
API versioning is consistent
VIP/TOP rules are consistent
Chat uses initiator/owner naming
PostGIS rules are consistent
No major architecture change introduced
```

Suggested commits:

```text
docs(project): align planning documents
```

Dependencies:

```text
TASK-000
TASK-001
```

## 6. M2 — Backend foundation

## 7. M3 — Database and Prisma foundation

## 8. M4 — Auth and users

_All M4 tasks completed — see docs/DONE.md (TASK-040–044)._

---

## 9. M5 — Listings and moderation

_TASK-050, TASK-051 completed — see docs/DONE.md._

---

### TASK-052 — Add owner listings endpoint

Status:

```text
TODO
```

Branch:

```text
feat/my-listings
```

Scope:

```text
Implement authenticated user's own listings endpoint.
```

Files expected:

```text
apps/api/src/listings/
```

Acceptance criteria:

```text
GET /api/v1/me/listings exists
Returns current user's listings
Supports status filter
Supports pagination
```

Suggested commits:

```text
feat(listings): add my listings endpoint
```

Dependencies:

```text
TASK-050
```

---

### TASK-053 — Add listing moderation workflow

Status:

```text
TODO
```

Branch:

```text
feat/listing-moderation
```

Scope:

```text
Implement admin/moderator listing moderation endpoints.
```

Files expected:

```text
apps/api/src/admin/
apps/api/src/listings/
apps/api/src/moderation/
```

Acceptance criteria:

```text
GET /api/v1/admin/listings?status=NEW works
PATCH /api/v1/admin/listings/:id/status works
Only admin/moderator can moderate
Moderation log is created
Status change notification job is queued
```

Suggested commits:

```text
feat(moderation): add listing moderation queue
feat(moderation): add listing status updates
```

Dependencies:

```text
TASK-050
TASK-044
```

## 10. M6 — Media uploads

### TASK-060 — Add S3 upload service

Status:

```text
TODO
```

Branch:

```text
feat/s3-upload-service
```

Scope:

```text
Implement S3-compatible upload service.
```

Files expected:

```text
apps/api/src/uploads/
.env.example
```

Acceptance criteria:

```text
S3 config is loaded from env
Upload service can upload file buffer
Service returns public or signed URL according to config
No local permanent storage is used
```

Suggested commits:

```text
feat(uploads): add S3 upload service
```

Dependencies:

```text
TASK-022
```

---

### TASK-061 — Add listing media endpoints

Status:

```text
TODO
```

Branch:

```text
feat/listing-media-endpoints
```

Scope:

```text
Implement listing media upload/list/delete/sort endpoints.
```

Files expected:

```text
apps/api/src/listing-media/
apps/api/src/uploads/
```

Acceptance criteria:

```text
POST /api/v1/listings/:id/media exists
GET /api/v1/listings/:id/media exists
DELETE /api/v1/listings/:id/media/:mediaId exists
PATCH /api/v1/listings/:id/media/sort exists
Only owner/admin can modify media
Allowed MIME types only
EXIF stripping is implemented or clearly TODO documented
```

Suggested commits:

```text
feat(media): add listing media endpoints
feat(media): validate image uploads
```

Dependencies:

```text
TASK-060
TASK-036
TASK-050
```

## 11. M7 — Translations

### TASK-070 — Add listing translation service

Status:

```text
TODO
```

Branch:

```text
feat/listing-translation-service
```

Scope:

```text
Implement listing translation storage service.
```

Files expected:

```text
apps/api/src/translations/
apps/api/src/listings/
```

Acceptance criteria:

```text
Original language row is created
Translation rows can be retrieved by language
Listing response supports language selection
Missing translation fallback is defined
```

Suggested commits:

```text
feat(translations): add listing translation service
```

Dependencies:

```text
TASK-036
TASK-050
```

---

### TASK-071 — Add translation queue and provider abstraction

Status:

```text
TODO
```

Branch:

```text
feat/translation-queue
```

Scope:

```text
Add BullMQ queue for listing auto-translation.
```

Files expected:

```text
apps/api/src/translations/
apps/api/src/queues/
.env.example
```

Acceptance criteria:

```text
translation_queue exists
Provider abstraction exists
Google/Yandex provider can be selected by env
Failed jobs can retry
No direct translation call blocks listing create request
```

Suggested commits:

```text
feat(translations): add translation queue
feat(translations): add provider abstraction
```

Dependencies:

```text
TASK-070
TASK-011
```

## 12. M8 — Search and PostGIS

### TASK-080 — Add listing search filters

Status:

```text
TODO
```

Branch:

```text
feat/search-listing-filters
```

Scope:

```text
Implement public listing search by basic filters.
```

Files expected:

```text
apps/api/src/search/
apps/api/src/listings/
```

Acceptance criteria:

```text
GET /api/v1/search/listings exists
Filters by transactionType
Filters by propertyType
Filters by price range
Filters by city/district
Only ACTIVE listings returned
Pagination works
```

Suggested commits:

```text
feat(search): add basic listing filters
```

Dependencies:

```text
TASK-050
TASK-051
```

---

### TASK-081 — Add promotion-aware sorting

Status:

```text
TODO
```

Branch:

```text
feat/search-promotion-sorting
```

Scope:

```text
Add VIP/TOP/NORMAL default sorting to public search.
```

Files expected:

```text
apps/api/src/search/
```

Acceptance criteria:

```text
VIP appears before TOP
TOP appears before NORMAL
Expired promotions are treated as NORMAL
created_at desc and id desc are final tie breakers
Sorting is stable
```

Suggested commits:

```text
feat(search): add promotion priority sorting
```

Dependencies:

```text
TASK-080
TASK-037
```

---

### TASK-082 — Add PostGIS radius and near-me search

Status:

```text
TODO
```

Branch:

```text
feat/search-postgis-radius
```

Scope:

```text
Implement radius and near-me search using PostGIS.
```

Files expected:

```text
apps/api/src/search/
```

Acceptance criteria:

```text
GET /api/v1/search/nearby exists
Radius search uses ST_DWithin
Distance sort uses ST_Distance where requested
GIST index is used
Latitude/longitude validation exists
```

Suggested commits:

```text
feat(search): add PostGIS radius search
```

Dependencies:

```text
TASK-080
TASK-035
```

---

### TASK-083 — Add map bounds search

Status:

```text
TODO
```

Branch:

```text
feat/search-map-bounds
```

Scope:

```text
Implement map bounds search for Yandex Maps frontend/mobile.
```

Files expected:

```text
apps/api/src/search/
```

Acceptance criteria:

```text
GET /api/v1/search/map exists
Supports north/south/east/west bounds
Returns listing marker data
Only ACTIVE listings returned
Promotion fields are included for marker UI
```

Suggested commits:

```text
feat(search): add map bounds search
```

Dependencies:

```text
TASK-080
TASK-035
```

## 13. M9 — Favorites and saved searches

### TASK-090 — Add favorites module

Status:

```text
TODO
```

Branch:

```text
feat/favorites
```

Scope:

```text
Implement favorite listings.
```

Files expected:

```text
apps/api/src/favorites/
```

Acceptance criteria:

```text
POST /api/v1/favorites/:listingId works
DELETE /api/v1/favorites/:listingId works
GET /api/v1/favorites works
Guest cannot use favorites
Duplicate favorites are prevented
```

Suggested commits:

```text
feat(favorites): add favorite listings
```

Dependencies:

```text
TASK-038
TASK-044
TASK-051
```

---

### TASK-091 — Add saved searches module

Status:

```text
TODO
```

Branch:

```text
feat/saved-searches
```

Scope:

```text
Implement saved search CRUD.
```

Files expected:

```text
apps/api/src/saved-searches/
```

Acceptance criteria:

```text
POST /api/v1/saved-searches works
GET /api/v1/saved-searches works
PATCH /api/v1/saved-searches/:id works
DELETE /api/v1/saved-searches/:id works
filters_json includes schemaVersion
User can only manage own saved searches
```

Suggested commits:

```text
feat(saved-searches): add saved search CRUD
```

Dependencies:

```text
TASK-038
TASK-044
TASK-080
```

## 14. M10 — Notifications

### TASK-100 — Add notification records module

Status:

```text
TODO
```

Branch:

```text
feat/notifications-records
```

Scope:

```text
Implement notification storage and read endpoints.
```

Files expected:

```text
apps/api/src/notifications/
```

Acceptance criteria:

```text
GET /api/v1/notifications works
PATCH /api/v1/notifications/:id/read works
PATCH /api/v1/notifications/read-all works
User can only read own notifications
```

Suggested commits:

```text
feat(notifications): add notification records
```

Dependencies:

```text
TASK-038
TASK-044
```

---

### TASK-101 — Add email queue

Status:

```text
TODO
```

Branch:

```text
feat/email-queue
```

Scope:

```text
Implement email delivery queue foundation.
```

Files expected:

```text
apps/api/src/email/
apps/api/src/queues/
.env.example
```

Acceptance criteria:

```text
email_queue exists
SMTP config exists
Email job can be queued
Email delivery result is logged
```

Suggested commits:

```text
feat(email): add email queue foundation
```

Dependencies:

```text
TASK-011
TASK-100
```

---

### TASK-102 — Add saved search alert job

Status:

```text
TODO
```

Branch:

```text
feat/saved-search-alerts
```

Scope:

```text
Implement background job to match saved searches and notify users.
```

Files expected:

```text
apps/api/src/saved-searches/
apps/api/src/notifications/
apps/api/src/queues/
```

Acceptance criteria:

```text
Only ACTIVE listings trigger alerts
Duplicate alerts are avoided
Email notification is queued
last_checked_at is updated
```

Suggested commits:

```text
feat(saved-searches): add alert matcher job
```

Dependencies:

```text
TASK-091
TASK-101
```

## 15. M11 — Internal chat

### TASK-110 — Add chat threads

Status:

```text
TODO
```

Branch:

```text
feat/chat-threads
```

Scope:

```text
Implement chat thread creation and listing.
```

Files expected:

```text
apps/api/src/chat/
```

Acceptance criteria:

```text
POST /api/v1/chat/threads works
GET /api/v1/chat/threads works
Thread uses initiator_id and owner_id
Duplicate thread is prevented
Guest cannot create thread
Deleted listing cannot start new thread
```

Suggested commits:

```text
feat(chat): add chat threads
```

Dependencies:

```text
TASK-038
TASK-051
TASK-044
```

---

### TASK-111 — Add chat messages

Status:

```text
TODO
```

Branch:

```text
feat/chat-messages
```

Scope:

```text
Implement chat message send/read endpoints.
```

Files expected:

```text
apps/api/src/chat/
apps/api/src/notifications/
```

Acceptance criteria:

```text
GET /api/v1/chat/threads/:id works
POST /api/v1/chat/threads/:id/messages works
PATCH /api/v1/chat/threads/:id/read works
Only thread participants can access messages
Sender must be thread participant
New message queues notification
```

Suggested commits:

```text
feat(chat): add chat messages
feat(chat): add chat read status
```

Dependencies:

```text
TASK-110
TASK-100
```

## 16. M12 — VIP/TOP promotions

### TASK-120 — Add promotion plans endpoint

Status:

```text
TODO
```

Branch:

```text
feat/promotion-plans
```

Scope:

```text
Implement public endpoint for promotion plans.
```

Files expected:

```text
apps/api/src/promotions/
```

Acceptance criteria:

```text
GET /api/v1/promotions/plans works
Returns TOP and VIP options
Returns 7/14/30 day periods
Online payment is not required
```

Suggested commits:

```text
feat(promotions): add promotion plans endpoint
```

Dependencies:

```text
TASK-037
TASK-021
```

---

### TASK-121 — Add admin promotion activation

Status:

```text
TODO
```

Branch:

```text
feat/admin-promotion-activation
```

Scope:

```text
Implement manual admin activation for VIP/TOP.
```

Files expected:

```text
apps/api/src/promotions/
apps/api/src/admin/
```

Acceptance criteria:

```text
POST /api/v1/admin/listings/:id/promotions works
Admin can activate TOP
Admin can activate VIP
Period can be 7/14/30 days
listing_promotions row is created
listings promotion read cache is updated
promotion log is created
Only admin/moderator allowed if approved by role rules
```

Suggested commits:

```text
feat(promotions): add admin promotion activation
```

Dependencies:

```text
TASK-037
TASK-044
TASK-050
```

---

### TASK-122 — Add promotion cancel and extend

Status:

```text
TODO
```

Branch:

```text
feat/admin-promotion-management
```

Scope:

```text
Implement cancel and extend actions for promotions.
```

Files expected:

```text
apps/api/src/promotions/
apps/api/src/admin/
```

Acceptance criteria:

```text
PATCH /api/v1/admin/listing-promotions/:id/cancel works
PATCH /api/v1/admin/listing-promotions/:id/extend works
Promotion logs are created
Read cache updates correctly
Only one ACTIVE promotion remains
```

Suggested commits:

```text
feat(promotions): add cancel and extend actions
```

Dependencies:

```text
TASK-121
```

---

### TASK-123 — Add promotion expiration job

Status:

```text
TODO
```

Branch:

```text
feat/promotion-expiration-job
```

Scope:

```text
Implement background job to expire VIP/TOP promotions.
```

Files expected:

```text
apps/api/src/promotions/
apps/api/src/queues/
apps/api/src/notifications/
```

Acceptance criteria:

```text
promotion_queue exists
expire_listing_promotions job exists
Expired promotion becomes EXPIRED
Listing read cache returns to NORMAL
Notification job is queued
Search still treats expired promotion as NORMAL even if job is delayed
```

Suggested commits:

```text
feat(promotions): add expiration job
```

Dependencies:

```text
TASK-122
TASK-100
```

## 17. M13 — Admin panel backend

### TASK-130 — Add admin users endpoint

Status:

```text
TODO
```

Branch:

```text
feat/admin-users
```

Scope:

```text
Implement admin user listing and role management foundation.
```

Files expected:

```text
apps/api/src/admin/
apps/api/src/users/
apps/api/src/roles/
```

Acceptance criteria:

```text
GET /api/v1/admin/users works
PATCH /api/v1/admin/users/:id/roles works
Only admin can access
Role changes are audited
```

Suggested commits:

```text
feat(admin): add user management endpoints
```

Dependencies:

```text
TASK-044
TASK-040
```

---

### TASK-131 — Add admin audit and logs endpoints

Status:

```text
TODO
```

Branch:

```text
feat/admin-logs
```

Scope:

```text
Expose audit, moderation, promotion and notification logs to admin.
```

Files expected:

```text
apps/api/src/admin/
apps/api/src/audit/
```

Acceptance criteria:

```text
GET /api/v1/admin/audit-logs works
GET /api/v1/admin/moderation-logs works
GET /api/v1/admin/promotion-logs works
GET /api/v1/admin/notification-logs works
Only admin can access
Pagination works
```

Suggested commits:

```text
feat(admin): add logs endpoints
```

Dependencies:

```text
TASK-038
TASK-053
TASK-121
TASK-100
```

## 18. M14 — Web frontend foundation

### TASK-140 — Initialize Next.js web app

Status:

```text
TODO
```

Branch:

```text
feat/web-foundation
```

Scope:

```text
Initialize Next.js frontend in apps/web.
```

Files expected:

```text
apps/web/package.json
apps/web/src/app/
apps/web/src/components/
apps/web/src/lib/
```

Acceptance criteria:

```text
Next.js app starts
TypeScript works
Basic layout exists
No business pages required yet
```

Suggested commits:

```text
feat(web): initialize Next.js app
```

Dependencies:

```text
TASK-010
```

---

### TASK-141 — Add RTK Query API layer

Status:

```text
TODO
```

Branch:

```text
feat/web-rtk-query
```

Scope:

```text
Add Redux Toolkit and RTK Query foundation.
```

Files expected:

```text
apps/web/src/store/
apps/web/src/store/api/baseApi.ts
apps/web/src/store/provider.tsx
```

Acceptance criteria:

```text
RTK Query base API exists
Base URL points to /api/v1
Provider is wired into app
No random fetch/axios pattern introduced
```

Suggested commits:

```text
feat(web): add RTK Query foundation
```

Dependencies:

```text
TASK-140
```

---

### TASK-142 — Add i18n foundation

Status:

```text
TODO
```

Branch:

```text
feat/web-i18n
```

Scope:

```text
Add language detection and language switcher foundation.
```

Files expected:

```text
apps/web/src/i18n/
apps/web/src/components/language-switcher/
```

Acceptance criteria:

```text
Supports uz/ru/en
Detects browser language
User can switch language manually
Language state persists
```

Suggested commits:

```text
feat(web): add i18n foundation
```

Dependencies:

```text
TASK-140
```

## 19. M15 — Web user features

### TASK-150 — Add web auth UI

Status:

```text
TODO
```

Branch:

```text
feat/web-auth
```

Scope:

```text
Implement SMS/email OTP login UI.
```

Files expected:

```text
apps/web/src/features/auth/
apps/web/src/store/api/authApi.ts
```

Acceptance criteria:

```text
User can request OTP
User can verify OTP
Tokens are stored according to security decision
Auth state is available to app
```

Suggested commits:

```text
feat(web): add OTP auth UI
```

Dependencies:

```text
TASK-141
TASK-042
```

---

### TASK-151 — Add web listing search page

Status:

```text
TODO
```

Branch:

```text
feat/web-listing-search
```

Scope:

```text
Implement listing search page with filters.
```

Files expected:

```text
apps/web/src/features/search/
apps/web/src/store/api/searchApi.ts
```

Acceptance criteria:

```text
Search page loads ACTIVE listings
Filters work through RTK Query
Sorting supports promotion priority
Pagination works
```

Suggested commits:

```text
feat(web): add listing search page
```

Dependencies:

```text
TASK-141
TASK-080
TASK-081
```

---

### TASK-152 — Add web map search

Status:

```text
TODO
```

Branch:

```text
feat/web-map-search
```

Scope:

```text
Implement Yandex Maps listing marker search.
```

Files expected:

```text
apps/web/src/features/map/
apps/web/src/store/api/searchApi.ts
```

Acceptance criteria:

```text
Yandex Maps loads from env key
Markers display listings
Map bounds search calls /api/v1/search/map
Marker click shows listing preview
```

Suggested commits:

```text
feat(web): add Yandex map search
```

Dependencies:

```text
TASK-151
TASK-083
```

---

### TASK-153 — Add web listing detail page

Status:

```text
TODO
```

Branch:

```text
feat/web-listing-detail
```

Scope:

```text
Implement listing detail page.
```

Files expected:

```text
apps/web/src/features/listings/
apps/web/src/store/api/listingsApi.ts
```

Acceptance criteria:

```text
Listing detail loads by id
Photos are displayed
Translations are displayed by selected language
Promotion badge displays VIP/TOP where applicable
Chat CTA exists for authenticated users
```

Suggested commits:

```text
feat(web): add listing detail page
```

Dependencies:

```text
TASK-141
TASK-051
```

---

### TASK-154 — Add web listing create flow

Status:

```text
TODO
```

Branch:

```text
feat/web-listing-create
```

Scope:

```text
Implement create listing flow.
```

Files expected:

```text
apps/web/src/features/listings/create/
apps/web/src/store/api/listingsApi.ts
```

Acceptance criteria:

```text
Authenticated owner/agent can create listing
Form includes core fields
User can select map location
Created listing becomes NEW
User sees moderation status message
```

Suggested commits:

```text
feat(web): add listing create flow
```

Dependencies:

```text
TASK-050
TASK-142
```

---

### TASK-155 — Add web favorites and saved searches

Status:

```text
TODO
```

Branch:

```text
feat/web-favorites-saved-searches
```

Scope:

```text
Implement favorites and saved searches UI.
```

Files expected:

```text
apps/web/src/features/favorites/
apps/web/src/features/saved-searches/
apps/web/src/store/api/favoritesApi.ts
apps/web/src/store/api/savedSearchesApi.ts
```

Acceptance criteria:

```text
User can favorite/unfavorite listing
User can view favorites
User can save current search
User can manage saved searches
```

Suggested commits:

```text
feat(web): add favorites UI
feat(web): add saved searches UI
```

Dependencies:

```text
TASK-090
TASK-091
TASK-151
```

---

### TASK-156 — Add web chat UI

Status:

```text
TODO
```

Branch:

```text
feat/web-chat
```

Scope:

```text
Implement internal chat UI using polling.
```

Files expected:

```text
apps/web/src/features/chat/
apps/web/src/store/api/chatApi.ts
```

Acceptance criteria:

```text
User can open thread list
User can open thread
User can send message
Polling refresh works
Only authenticated users access chat
```

Suggested commits:

```text
feat(web): add chat UI
```

Dependencies:

```text
TASK-110
TASK-111
TASK-141
```

---

### TASK-157 — Add web homepage

Status:

```text
TODO
```

Branch:

```text
feat/web-homepage
```

Scope:

```text
Implement public homepage (hero + featured listings).
```

Files expected:

```text
apps/web/src/app/page.tsx
apps/web/src/features/home/
```

Acceptance criteria:

```text
Hero with SearchBar
Featured carousel shows TOP/VIP listings first via searchApi
Links to /sale and /rent
Content is localized (uz/ru/en)
```

Suggested commits:

```text
feat(web): add homepage
```

Dependencies:

```text
TASK-142
TASK-151
```

---

### TASK-158 — Add web notifications UI

Status:

```text
TODO
```

Branch:

```text
feat/web-notifications
```

Scope:

```text
Implement notifications page and read actions.
```

Files expected:

```text
apps/web/src/features/notifications/
apps/web/src/store/api/notificationsApi.ts
```

Acceptance criteria:

```text
User can view notifications list
User can mark notification read and read-all
Unread indicator works
Polling refresh works
Only authenticated users access notifications
```

Suggested commits:

```text
feat(web): add notifications UI
```

Dependencies:

```text
TASK-100
TASK-141
```

---

### TASK-159 — Add web owner/agent dashboard

Status:

```text
TODO
```

Branch:

```text
feat/web-dashboard
```

Scope:

```text
Implement owner/agent dashboard for own listings.
```

Files expected:

```text
apps/web/src/app/account/listings/page.tsx
apps/web/src/features/dashboard/
```

Acceptance criteria:

```text
Lists own listings via GET /api/v1/listings/mine
Shows listing status and promotion type
Links to edit listing
Promotion CTA is displayed
Only authenticated owner/agent access dashboard
```

Suggested commits:

```text
feat(web): add owner/agent dashboard
```

Dependencies:

```text
TASK-052
TASK-150
```

## 20. M16 — Web admin features

### TASK-160 — Add admin layout

Status:

```text
TODO
```

Branch:

```text
feat/web-admin-layout
```

Scope:

```text
Add admin panel layout and admin route guard.
```

Files expected:

```text
apps/web/src/features/admin/
apps/web/src/app/admin/
```

Acceptance criteria:

```text
Admin layout exists
Admin guard checks user role
Non-admin cannot access admin routes
```

Suggested commits:

```text
feat(admin): add admin layout and guard
```

Dependencies:

```text
TASK-150
TASK-044
```

---

### TASK-161 — Add admin listing moderation UI

Status:

```text
TODO
```

Branch:

```text
feat/web-admin-moderation
```

Scope:

```text
Implement listing moderation screen.
```

Files expected:

```text
apps/web/src/features/admin/moderation/
apps/web/src/store/api/adminApi.ts
```

Acceptance criteria:

```text
Admin can view NEW listings
Admin can approve listing
Admin can send to DRAFT
Admin can reject listing
Admin can delete listing
Reason field is supported
```

Suggested commits:

```text
feat(admin): add listing moderation UI
```

Dependencies:

```text
TASK-160
TASK-053
```

---

### TASK-162 — Add admin promotion UI

Status:

```text
TODO
```

Branch:

```text
feat/web-admin-promotions
```

Scope:

```text
Implement manual VIP/TOP management UI.
```

Files expected:

```text
apps/web/src/features/admin/promotions/
apps/web/src/store/api/promotionsApi.ts
apps/web/src/store/api/adminApi.ts
```

Acceptance criteria:

```text
Admin can activate VIP
Admin can activate TOP
Admin can select 7/14/30 days
Admin can cancel promotion
Admin can extend promotion
Promotion status is visible
```

Suggested commits:

```text
feat(admin): add promotion management UI
```

Dependencies:

```text
TASK-160
TASK-120
TASK-121
TASK-122
```

## 21. M17 — Mobile API guide

### TASK-170 — Create mobile API guide

Status:

```text
TODO
```

Branch:

```text
docs/mobile-api-guide
```

Scope:

```text
Create docs/MOBILE_API_GUIDE.md for Flutter developer.
```

Files expected:

```text
docs/MOBILE_API_GUIDE.md
```

Acceptance criteria:

```text
Auth flow is documented
Listing search flow is documented
Map search flow is documented
Chat flow is documented
Notifications flow is documented
Upload flow is documented
All routes use /api/v1
```

Suggested commits:

```text
docs(mobile): add Flutter API guide
```

Dependencies:

```text
API.md
TASK-042
TASK-080
TASK-111
```

## 22. M18 — QA and production readiness

### TASK-180 — Add backend test foundation

Status:

```text
TODO
```

Branch:

```text
test/backend-foundation
```

Scope:

```text
Add test foundation for backend modules.
```

Files expected:

```text
apps/api/test/
apps/api/jest.config.*
```

Acceptance criteria:

```text
Test command works
Health endpoint test exists
Auth service unit test placeholder exists
Listings service test placeholder exists
```

Suggested commits:

```text
test(api): add backend test foundation
```

Dependencies:

```text
TASK-023
```

---

### TASK-181 — Add manual QA checklist

Status:

```text
TODO
```

Branch:

```text
docs/manual-qa-checklist
```

Scope:

```text
Create manual QA checklist for MVP.
```

Files expected:

```text
docs/QA_CHECKLIST.md
```

Acceptance criteria:

```text
Auth flow checklist exists
Listing moderation checklist exists
Search checklist exists
Chat checklist exists
Promotion checklist exists
Notification checklist exists
```

Suggested commits:

```text
docs(qa): add MVP manual QA checklist
```

Dependencies:

```text
PRD.md
API.md
```

---

### TASK-182 — Add deployment guide

Status:

```text
TODO
```

Branch:

```text
docs/deployment-guide
```

Scope:

```text
Create deployment guide for backend/web.
```

Files expected:

```text
docs/DEPLOYMENT.md
.env.example
```

Acceptance criteria:

```text
Environment variables are documented
Migration process is documented
Docker deployment notes exist
Health check verification exists
Rollback notes exist
```

Suggested commits:

```text
docs(deploy): add deployment guide
```

Dependencies:

```text
TASK-011
TASK-030
```

---

### TASK-183 — Add web SEO

Status:

```text
TODO
```

Branch:

```text
feat/web-seo
```

Scope:

```text
Add SEO foundation for web (metadata, JSON-LD, sitemap, robots, hreflang).
```

Files expected:

```text
apps/web/src/app/sitemap.ts
apps/web/src/app/robots.ts
apps/web/src/features/listings/
```

Acceptance criteria:

```text
generateMetadata exists per page and is locale-aware
JSON-LD RealEstateListing rendered on listing detail
sitemap.xml and robots.txt are generated
hreflang for uz/ru/en is set
Open Graph images are set
```

Suggested commits:

```text
feat(web): add SEO metadata and sitemap
```

Dependencies:

```text
TASK-151
TASK-153
```

## 23. Priority execution order

Claude should execute in this order:

```text
TASK-000 TASK-001 TASK-002
TASK-010 TASK-011 TASK-012
TASK-020 TASK-021 TASK-022 TASK-023
TASK-030 TASK-031 TASK-032 TASK-033 TASK-034 TASK-035 TASK-036 TASK-037 TASK-038
TASK-040 TASK-041 TASK-042 TASK-043 TASK-044
TASK-050 TASK-051 TASK-052 TASK-053
TASK-060 TASK-061
TASK-070 TASK-071
TASK-080 TASK-081 TASK-082 TASK-083
TASK-120 TASK-121 TASK-122 TASK-123
TASK-090 TASK-091
TASK-100 TASK-101 TASK-102
TASK-110 TASK-111
TASK-130 TASK-131
TASK-140 TASK-141 TASK-142
TASK-150 TASK-151 TASK-152 TASK-153 TASK-154 TASK-155 TASK-156 TASK-157 TASK-158 TASK-159
TASK-160 TASK-161 TASK-162
TASK-170 TASK-180 TASK-181 TASK-182 TASK-183
```

## 24. First task prompt for Claude

Use this first:

```text
Текущая задача:
- Fix docs/ROADMAP.md because it currently contains PRD content. Replace it with the approved ROADMAP.md structure. Do not change any other file.
```

Expected branch:

```text
docs/fix-roadmap-content
```

Expected commit:

```text
docs(roadmap): replace incorrect PRD content
```

## 25. Second task prompt for Claude

Then use:

```text
Текущая задача:
- Create docs/TASKS.md using the approved task breakdown. Do not write backend/frontend code. Do not change any other file.
```

Expected branch:

```text
docs/tasks
```

Expected commit:

```text
docs(tasks): add implementation task list
```
