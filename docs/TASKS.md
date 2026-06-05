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
BACKLOG
TODO
IN_PROGRESS
REVIEW
DONE
BLOCKED
```

`BACKLOG` — задача зафиксирована, но не запланирована в текущую итерацию;
лежит в секции «Backlog» и промотируется в `TODO`, когда берётся в работу.

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

_TASK-050, TASK-051, TASK-052, TASK-053 completed — see docs/DONE.md._

---

## 10. M6 — Media uploads

_TASK-060, TASK-061 completed — see docs/DONE.md._

## 11. M7 — Translations

_TASK-070, TASK-071 completed — see docs/DONE.md._

## 12. M8 — Search and PostGIS

_TASK-080, TASK-081, TASK-082, TASK-083 completed — see docs/DONE.md._

---

## 13. M9 — Favorites and saved searches

_TASK-090, TASK-091 completed — see docs/DONE.md._

---

## 14. M10 — Notifications

_TASK-100, TASK-101, TASK-102 completed — see docs/DONE.md._

## 15. M11 — Internal chat

_TASK-110 completed — see docs/DONE.md._

_TASK-111 completed — see docs/DONE.md._

## 16. M12 — VIP/TOP promotions

_TASK-120 completed — see docs/DONE.md._

_TASK-121 completed — see docs/DONE.md._

_TASK-122 completed — see docs/DONE.md._

_TASK-123 completed — see docs/DONE.md._

## 17. M13 — Admin panel backend

_TASK-130 completed — see docs/DONE.md._

_TASK-131 completed — see docs/DONE.md._

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

## Backlog (not scheduled)

Зафиксированные, но не запланированные задачи. Промотируются в нужный milestone
со статусом `TODO`, когда берутся в работу.

### TASK-BL-001 — Agency-admin visibility for listing detail

Status:

```text
BACKLOG
```

Branch:

```text
feat/listing-detail-agency-visibility
```

Scope:

```text
Расширить видимость непубличных листингов в GET /api/v1/listings/:id на agency-
admin: пользователь, входящий в агентство (listings.agency_id), должен видеть
непубличные статусы листингов своего агентства наравне с владельцем и
MODERATOR/ADMIN. Сейчас (TASK-051, ADR-0019) непубличные статусы видит только
сам владелец и MODERATOR/ADMIN — agency-видимость отложена, т.к. в схеме нет
модели членства пользователь→agency.

Предусловие: ввести связь пользователь↔agency (membership/роль внутри агентства)
— модель и миграция. Без неё определить «admin агентства» нельзя. Объём модели
членства согласовать с Team Lead (отдельное архитектурное решение).
```

Files expected:

```text
apps/api/prisma/schema.prisma
apps/api/src/listings/listings.service.ts
apps/api/src/listings/listings.service.spec.ts
docs/DB_SCHEMA.md
docs/adr/
```

Acceptance criteria:

```text
Существует связь пользователь↔agency (membership), определяющая agency-admin
Agency-admin видит непубличные листинги своего агентства (listings.agency_id)
Agency-admin НЕ видит непубличные листинги чужого агентства (404)
Гость по-прежнему видит только ACTIVE; DELETED → 404 для всех
Покрыто юнит-тестами видимости (owner / agency-admin / чужой / гость)
```

Suggested commits:

```text
feat(agency): add user-agency membership model
feat(listings): allow agency-admin to view own agency non-active listings
test(listings): cover agency-admin listing visibility
```

Dependencies:

```text
TASK-051
```

---

### TASK-BL-002 — Composite index for owner listings sort

Status:

```text
BACKLOG
```

Branch:

```text
perf/listings-owner-index
```

Scope:

```text
Добавить составной индекс под сортировку owner-списка GET /api/v1/listings/mine
(TASK-052, ADR-0020): запрос фильтрует по owner_id и сортирует по
(created_at DESC, id DESC). Сейчас индекса под этот ключ нет — на росте числа
листингов владельца/агентства OFFSET+sort деградирует.

Индекс: listings(owner_id, created_at DESC, id DESC). Согласовать с DB_SCHEMA §8
(детерминированный ключ сортировки) — тот же хвост id. Через Prisma migration
(raw SQL при необходимости для DESC-порядка колонок).
```

Files expected:

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/
docs/DB_SCHEMA.md
```

Acceptance criteria:

```text
Существует индекс listings(owner_id, created_at DESC, id DESC)
EXPLAIN ANALYZE на GET /listings/mine использует индекс (Index Scan, без Sort)
Миграция применяется чисто (up/down)
DB_SCHEMA.md обновлён
```

Suggested commits:

```text
perf(listings): add composite index for owner listings sort
```

Dependencies:

```text
TASK-052
```

---

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
