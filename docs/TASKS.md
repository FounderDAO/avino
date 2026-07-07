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

_TASK-024 completed — see docs/DONE.md._

## 7. M3 — Database and Prisma foundation

## 8. M4 — Auth and users

_TASK-040–045 completed — see docs/DONE.md._

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

_TASK-132 completed — see docs/DONE.md._

## 18. M14 — Web frontend foundation

> Решение Team Lead (ADR-0057): публичный пользовательский фронтенд живёт в
> **`apps/client`** (`@avino/client`, порт 3001), `apps/web` остаётся админкой.
> Все пути `apps/web/...` в задачах M14–M15 относятся к `apps/client`.
> TASK-140 — DONE (см. docs/DONE.md).

_TASK-142 completed — see docs/DONE.md._

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

_TASK-190 completed — see docs/DONE.md (PR #107)._

---

### TASK-192 — Client "Homes For You" listing sections

Status:

```text
TODO
```

Branch:

```text
feat/client-home-listings
```

Scope:

```text
Секции главной по референсу Zillow: карусели карточек объявлений ("Homes For You")
и блоки Купить / Аренда / Продать. Карточка: фото, цена, спальни/санузлы/площадь, адрес,
статус. Данные через RTK Query listingsApi (GET /api/v1/listings).
БЕЗ ипотечных блоков. Только apps/client.
```

Files expected:

```text
apps/client/src/features/listings/ListingCard.tsx
apps/client/src/features/listings/ListingsCarousel.tsx
apps/client/src/features/home/ActionTiles.tsx
apps/client/src/store/api/listingsApi.ts
apps/client/src/app/page.tsx
```

Acceptance criteria:

```text
Карусель карточек объявлений на главной
listingsApi вызывает GET /api/v1/listings
Карточка показывает цену, beds/baths/area, адрес, статус
Блоки Купить/Аренда/Продать с CTA
Только apps/client
```

Suggested commits:

```text
feat(client): add homes-for-you listing sections
```

Dependencies:

```text
TASK-190
TASK-191
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

> Note: машиночитаемый контракт (Swagger/OpenAPI, два gated-документа + codegen-экспорт)
> доставлен отдельно как **TASK-219** (PR #171, ADR-0081, см. `docs/DONE.md`). Эта
> задача (TASK-170) — человекочитаемый `MOBILE_API_GUIDE.md`, остаётся TODO.

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

### TASK-BL-008 — Дефолтный гео-фильтр «Ташкент» на /search (список + карта консистентны)

Status:

```text
BACKLOG
```

Branch:

```text
feat/client-default-tashkent-search
```

Scope:

```text
Сделано сейчас (fix 2026-07-08, ветка отдельная, ещё не мёржена):
Карта /search больше НЕ разъезжается на весь Узбекистан при пустом заходе.
autoFit (подгон вида под маркеры) теперь включается ТОЛЬКО когда пользователь
задал локацию — район/регион или текстовый запрос (hasLocationIntent). В «чистом»
дефолте карта остаётся на дефолт-центре Ташкента (MapView, zoom 12).
Файл: apps/client/src/features/search/SearchResults.tsx.

Остаётся рассинхрон (сознательно отложен, эта задача):
SSR-выдача по умолчанию НЕ имеет гео-фильтра — список показывает объявления по
всей стране, а заголовок «· Ташкент» (defaultLocation) косметический. Т.е. сейчас
«карта = Ташкент», но «список = по стране с лейблом Ташкент».

Если заказчика не устроит этот рассинхрон — вернуться и сделать дефолтный
гео-фильтр «Ташкент» на SSR: когда в URL нет district_id/region_id/bbox,
searchListingsPage фильтрует по региону Ташкент, чтобы список И карта строго
показывали Ташкент по умолчанию.
```

Files expected:

```text
apps/client/src/app/[locale]/search/page.tsx
apps/client/src/features/search/SearchResults.tsx
docs/adr/
```

Acceptance criteria:

```text
Пустой заход /search → список только Ташкент И карта Ташкент (консистентно)
Явный выбор другого района/региона/запроса работает без регресса
SEO canonical (ADR-0104) не ломается; viewport-режим панорамирования работает
FilterBar «сброс фильтров» и длиннохвостые URL учтены
```

Suggested commits:

```text
feat(client): default search geo-filter to Tashkent when no location in URL
```

Dependencies:

```text
ADR-0113 (Region→District), ADR-0124 (viewport /search)
```

---

## 22a. UI/UX audit follow-ups — client live audit (2026-06-13)

Источник: живой UI/UX-разбор публичного портала `apps/client` (главная desktop+mobile,
`/search`, карточка объекта) против референса Zillow. Каждая задача — отдельный PR в
ОДНОЙ app-папке (CLAUDE.md §0). Приоритеты: P0 = ломает доверие/функцию, P1 = заметная
UX-боль, P2 = полировка/a11y. Часть P0 на стороне `apps/api` (контролы-обманки).

### TASK-201 — Защитное форматирование адреса/района + пустой контакт

Status:

```text
TODO
```

Branch:

```text
fix/client-empty-state-formatting
```

Scope:

```text
При пустых данных строка локации собирается как «, р-н, Ташкент» (висящая запятая,
голое «р-н» без названия), а контакт на детальной показывает «—»/«—». Сделать
форматирование/пустые состояния устойчивыми к null. Только apps/client.
```

Files expected:

```text
apps/client/src/lib/format.ts (хелпер локации/адреса)
apps/client/src/features/detail/Detail.tsx
apps/client/src/features/detail/ContactCard.tsx
apps/client/src/features/search/PropertyCard.tsx
```

Acceptance criteria:

```text
Пустые district/address не дают висящих запятых и «р-н» без имени (показываем только то, что есть; иначе город).
ContactCard при отсутствии имени/телефона показывает осмысленный плейсхолдер (не «—»/«—»), кнопка контакта корректно отключена/скрыта.
Покрыто юнит-тестом форматтера на null-кейсы.
Изменения только внутри apps/client.
```

Suggested commits:

```text
fix(client): defensive location/address and empty-contact states
```

Note:

```text
Независим от TASK-210: это graceful-degradation, пока бэк не отдаёт контакт/район.
После TASK-209/210 реальные данные просто займут место плейсхолдеров.
```

Dependencies:

```text
TASK-190
```

---

### TASK-203 — Интерим: честные контролы (скрыть sort/q пока бэк их игнорирует)

Status:

```text
TODO
```

Branch:

```text
fix/client-honest-controls-interim
```

Scope:

```text
Бэкенд /search игнорирует sort/q/rooms (см. TASK-207/208) — контролы «врут».
ВРЕМЕННАЯ мера до этих задач: скрыть/задизейблить сортировку и свободный текст q
(гео-подсказка с радиусом работает — её оставить). Снимается после TASK-207/208.
Только apps/client.
```

Files expected:

```text
apps/client/src/features/search/FilterBar.tsx
apps/client/src/features/search/SearchAutocomplete.tsx
```

Acceptance criteria:

```text
Сортировка и свободный текст q скрыты/задизейблены (или помечены «скоро»), пока бэк их не применяет.
Гео-подсказка (район/адрес → circle/radius) продолжает работать.
Поведение под фиче-флагом/легко откатывается одной правкой после TASK-207/208.
Изменения только внутри apps/client.
```

Note:

```text
Опционально. Если TASK-207/208 берутся сразу — этот таск можно пропустить.
```

Suggested commits:

```text
fix(client): hide non-functional sort/query controls (interim)
```

Dependencies:

```text
TASK-191
```

---

### TASK-211 — Реальный Google OAuth Client ID + live-verify входа через Google

Status:

```text
TODO
```

Branch:

```text
chore/client-google-oauth-client-id
```

Scope:

```text
Кнопка Google в LoginModal сейчас рендерится с плейсхолдером
`your-google-client-id.apps.googleusercontent.com` (apps/client/.env.local),
поэтому реальный вход через Google не работает. Получить реальный OAuth Client ID
в Google Cloud Console (Authorized JS origins: http://localhost:3001 + prod-домен
клиента), прописать в apps/client/.env.local (NEXT_PUBLIC_GOOGLE_CLIENT_ID) и в
.env для бэкенда (GOOGLE_CLIENT_ID), live-проверить flow GIS → POST /api/v1/auth/google.
Только конфиг (apps/client + .env), без правок кода.
```

Files expected:

```text
apps/client/.env.local
.env
docs/ENV.md
```

Acceptance criteria:

```text
Кнопка Google рендерится с реальным Client ID, без ошибок GIS в консоли.
Вход через Google проходит end-to-end: ID-token → /api/v1/auth/google → сессия.
prod-домен клиента добавлен в Authorized JavaScript origins.
ENV.md обновлён.
```

Suggested commits:

```text
chore(env): add real Google OAuth client id for client + api
```

Dependencies:

```text
TASK-195
```

---

### TASK-212 — CORS_ORIGINS должен включать prod-домен публичного клиента

Status:

```text
TODO
```

Branch:

```text
chore/api-cors-client-prod-origin
```

Scope:

```text
В dev CORS_ORIGINS уже включает http://localhost:3001 (фикс 2026-06-13). Проверить,
что в docker-compose.prod.yml CORS_ORIGINS реально содержит домен публичного клиента
(${DOMAIN_CLIENT}), а не только админки, и что DOMAIN_CLIENT задан в prod-окружении.
Без этого вход с публичного портала в проде блокируется браузером (как было в dev).
Live-проверить preflight на стейдже. Только инфра-конфиг.
```

Files expected:

```text
docker-compose.prod.yml
.env.example
docs/ENV.md
```

Acceptance criteria:

```text
prod CORS_ORIGINS включает домены и админки, и клиента.
preflight на стейдже отдаёт Access-Control-Allow-Origin для домена клиента.
DOMAIN_CLIENT документирован в .env.example/ENV.md.
```

Suggested commits:

```text
chore(api): ensure prod CORS allows public client origin
```

Dependencies:

```text
—
```

---

### Backlog — требует подтверждения Team Lead (CLAUDE.md §13)

Эти пункты меняют scope/бизнес-логику MVP и НЕ берутся без подтверждения:

```text
TASK-BL-003 — Кнопка «Написать в Telegram» на карточке объекта (привычка UZ-аудитории).
              Решение: внешний контакт-канал vs внутренний чат MVP (CLAUDE.md §10).

TASK-BL-004 — Калькулятор ипотеки. КОНФЛИКТУЕТ с TASK-190 «БЕЗ ипотеки / Home Loans»
              (нет billing в MVP). Только информационный калькулятор и только после подтверждения.

TASK-BL-005 — Структурированные features[] на детальной (модель M5 ещё не реализована;
              сейчас удобства приходят только free-text features_text). Бэкенд apps/api.

TASK-BL-006 — Сигналы доверия: бейдж «проверенное объявление» + «обновлено N дней назад»
              (борьба с фейками — боль рынка vs OLX). Меняет moderation/трастовую логику.

TASK-BL-007 — Адрес объявления на 3 языках (uz/ru/en) из reverse-геокодинга.
              Контекст (2026-07-04): точка на карте в визарде обратно геокодится
              Yandex-ом только на языке загруженного SDK (uz-локаль → ru_RU).
              «3 языка сразу» напрямую невозможно: JS API — один lang на страницу;
              HTTP Геокодер умеет lang per-request (ru_RU, en_US, en_RU, uk_UA,
              be_BY, tr_TR), но УЗБЕКСКОГО НЕ ПОДДЕРЖИВАЕТ.
              Меняет схему БД и API-контракт → решение Team Lead, вариант не выбран.

              Вариант A (рекомендация Claude): серверный endpoint
              GET /api/v1/geo/reverse-geocode?lat=&lng= — бэкенд делает 2 запроса
              к HTTP Геокодеру (lang=ru_RU + en_US; ключ тот же — продукт
              «JavaScript API и HTTP Геокодер»), uz получает переводом ru-строки
              через уже подключённый translate-сервис (флоу ADR-0091).
              Визард при выборе точки сохраняет 3 строки; хранение — address
              per-language (перенос/дублирование address в ListingTranslation
              рядом с addressNote; миграция). Объём: apps/api + apps/client, 2 PR.

              Вариант B (дешёвый MVP): геокодинг не трогаем — address остаётся
              одной строкой как ввёл пользователь; перевод адреса на 3 языка
              добавить в существующую модераторскую кнопку «Сгенерировать
              переводы» (расширить на address). Минус: машинный перевод топонимов
              без нормализации Яндекса. Объём: apps/api (+ немного apps/web).
```

---

## 22b. Заявки мобильного клиента (2026-07-04)

Источник: BACKEND-REQUESTS.md от мобильного разработчика (04.07.2026), 4 заявки.
Пункты 2 и 4 заявок уже покрыты существующим API и в задачи не превращаются:

```text
Пункт 2 (полигон в живом поиске) → уже есть GET /api/v1/search/polygon:
        принимает points ("lat,lng;lat,lng;…") и наследует ВСЕ фильтры
        SearchListingsQueryDto (search.controller.ts, geo-search.dto.ts).
Пункт 4 (FX ценового фильтра)   → уже реализовано: параметр currency,
        price_min/price_max трактуются в нём, цены FX-нормализуются по курсу
        ЦБУ во всех эндпоинтах включая bounds/polygon (fxRateForFilter).
        Мобильному клиенту нужно просто передавать currency в запросе.
```

Ниже — оставшиеся 2 заявки (пункты 1 и 3).

_TASK-225 (PR #324) и TASK-226 (PR #323) completed — see docs/DONE.md._

---

## 22c. M19 — DevOps production readiness (аудит 2026-07-05)

Источник: DevOps-аудит `DevOps.md` (корень репо), раздел «P0 — критично до прода».
Серверные задачи (crontab, daemon.json на VPS, внешние аккаунты) не решаются из
репозитория — помечены BLOCKED с готовыми командами для Team Lead.

### TASK-227 — SMTP-провайдер для EMAIL-OTP в production

Status:

```text
BLOCKED (нужен выбор провайдера и аккаунт — решение Team Lead)
```

Branch:

```text
chore/env-smtp-provider
```

Scope:

```text
В NODE_ENV=production EMAIL-OTP не отправляется и не логируется → вход в чистом
проде невозможен. Выбрать транзакционного провайдера (SES / Resend / Postmark —
порт 25 у хостера обычно закрыт, нужен 465/587), завести аккаунт, заполнить
SMTP_* в .env на сервере, проверить доставку OTP-письма на staging с
NODE_ENV=production у api.
```

Files expected:

```text
.env (на сервере, не в git)
docs/ENV.md
```

Acceptance criteria:

```text
OTP-письмо доставляется при NODE_ENV=production
SMTP_* документированы в deploy/prod.env.example / docs/ENV.md
Прод-деплой ./deploy/deploy.sh проходит health-wait
```

Dependencies:

```text
Решение Team Lead по провайдеру
```

---

### TASK-228 — Верифицировать бэкапы: cron + off-site R2 + restore-тест

Status:

```text
BLOCKED (нужен доступ к VPS; изменения на сервере, не в репо)
```

Scope:

```text
deploy/backup.sh готов, но на VPS не подтверждены: (а) crontab с двухслойной
схемой из deploy/README.md §Бэкапы (часовые 2 суток + суточные 30 суток);
(б) BACKUP_S3_BUCKET → off-site в R2 (README называет его обязательным для
прода); (в) restore ни разу не прогонялся. Настроить cron, задать
BACKUP_S3_BUCKET, однократно прогнать restore-процедуру на staging и
зафиксировать результат в docs/LOG.md.
```

Acceptance criteria:

```text
crontab -l на VPS содержит оба слоя бэкапов
В R2-бакете появляются свежие дампы
Restore из дампа на staging прогнан один раз, результат записан в docs/LOG.md
```

Dependencies:

```text
SSH-доступ к VPS 75.119.159.168
```

---

_TASK-229 completed (PR #331) — see docs/DONE.md._

---

### TASK-230 — Внешний uptime-мониторинг + алерты в Telegram

Status:

```text
BLOCKED (нужен аккаунт UptimeRobot/Better Stack — Team Lead)
```

Scope:

```text
Повесить внешний монитор (бесплатного тарифа достаточно) на
https://api.avino.uz/api/v1/health, https://avino.uz, https://admin.avino.uz
(+ test.avino.uz по желанию) с алертом в Telegram. Это единственный способ
узнавать о падении раньше пользователей.
```

Acceptance criteria:

```text
3 монитора активны, интервал ≤ 5 мин
Алерт приходит в Telegram при падении (проверить тестовым стопом на staging)
```

Dependencies:

```text
TASK-231 (health должен реально проверять зависимости)
Аккаунт мониторинг-сервиса
```

---

_TASK-231 completed (PR #332) — see docs/DONE.md._

---

_TASK-232 completed (PR #333 api + #334 client + #335 web) — see docs/DONE.md._
_Активация: 3 Sentry-проекта → SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN_CLIENT /
NEXT_PUBLIC_SENTRY_DSN_WEB в .env на сервере + redeploy с пересборкой._

---

## 22d. M19 — DevOps P1 (аудит 2026-07-05, «важно»)

Источник: `DevOps.md` §«P1 — важно» (пункты 7–13 аудита).

### TASK-233 — Multi-stage Dockerfile'ы + non-root (api, web, client)

Status:

```text
TODO
```

Branch:

```text
chore/api-docker-multistage, chore/web-docker-multistage,
chore/client-docker-multistage (3 PR — по одной app-папке)
```

Scope:

```text
Сейчас все три образа single-stage на node:20-slim под root: COPY всего
workspace + devDeps + исходники остаются в рантайме. Переделать:
- api: стадия build → рантайм только dist + prod-deps (pnpm deploy --prod
  или prune --prod); CMD node dist/main.js (уже так).
- web/client: next.config → output: 'standalone', рантайм = node server.js
  (убрать прослойку pnpm start).
- Во все три: USER node, HEALTHCHECK (зеркально compose-healthcheck).
Эффект: образы в разы меньше, деплой/откат быстрее, root убран.
Начать с api (самый простой); web/client требуют проверки standalone-режима
с next-intl и NEXT_PUBLIC-инлайном.
```

Files expected:

```text
apps/api/Dockerfile
apps/web/Dockerfile + apps/web/next.config.mjs
apps/client/Dockerfile + apps/client/next.config.mjs
```

Acceptance criteria:

```text
docker build всех трёх образов проходит; размер образа заметно меньше (замерить до/после)
Контейнеры работают под пользователем node (docker exec whoami)
Полный стек поднимается: docker compose --profile app up + healthy у всех
Staging live-verify: главная, /search, вход, фото (R2), карта
```

Suggested commits:

```text
chore(api): multi-stage docker image with non-root user
chore(web): standalone multi-stage docker image
chore(client): standalone multi-stage docker image
```

Dependencies:

```text
None
```

---

### TASK-234 — CI: client-тесты, гейт миграций, int-spec с живым PG

Status:

```text
TODO
```

Branch:

```text
ci/close-test-gaps
```

Scope:

```text
Закрыть дыры .github/workflows/ci.yml:
(а) job client-тестов: pnpm --filter @avino/client test (Vitest).
    ⚠️ ПРЕДУСЛОВИЕ: починить 2 предсущ. фейла LoginModal.test.tsx
    (useAppleLoginMutation не замокан — известный долг), иначе job красный
    с первого дня.
(б) job с service-контейнером postgis/postgis:16-3.4: prisma migrate deploy
    на чистой БД (гейт на битые миграции).
(в) там же прогон *.int-spec.ts — ПО ОДНОМУ ФАЙЛУ (cross-file контаминация
    гео-фикстур — известная гоча int-spec'ов).
```

Files expected:

```text
.github/workflows/ci.yml
apps/client/src/components/layout/LoginModal.test.tsx (фикс мока)
```

Acceptance criteria:

```text
CI гоняет client-тесты, job зелёный
Битая миграция валит CI (проверить временной порчей в ветке)
int-spec'ы зелёные в CI по одному файлу
Время пайплайна выросло разумно (кеш pnpm сохранён)
```

Suggested commits:

```text
fix(client): mock apple login mutation in LoginModal test
ci: add client tests, migration gate and api int-specs
```

Dependencies:

```text
None
```

---

### TASK-235 — CD-минимум: образы в GHCR + деплой по git-тегу

Status:

```text
TODO
```

Branch:

```text
ci/ghcr-deploy-by-tag
```

Scope:

```text
Workflow на тег v*: build+push трёх образов в GHCR (docker/build-push-action,
cache-from gha) → SSH-step (appleboy/ssh-action) → на сервере
docker compose pull && up -d (без --build). Деплой-скрипты дополнить режимом
pull-образов. Даёт: сборку не на VPS (нет конкуренции за CPU с живым
трафиком), откат за секунды (pull предыдущего тега), воспроизводимость.
```

Files expected:

```text
.github/workflows/release.yml
docker-compose.prod.yml (image: ghcr.io/... + тег)
deploy/deploy.sh, deploy/deploy-staging.sh (режим pull)
docs/adr/
```

Acceptance criteria:

```text
git tag v* → 3 образа в GHCR с тегом версии
Деплой на staging из готовых образов проходит health-wait
Откат = деплой предыдущего тега без пересборки (проверить)
Секреты SSH_KEY/SSH_HOST заведены в GitHub (Team Lead)
```

Suggested commits:

```text
ci: build and push images to GHCR on version tags
chore(deploy): pull prebuilt images instead of building on VPS
```

Dependencies:

```text
TASK-233 (желательно — пуш уже лёгких образов)
GitHub secrets от Team Lead
```

---

### TASK-236 — Лимиты ресурсов в prod-compose

Status:

```text
TODO
```

Branch:

```text
chore/compose-resource-limits
```

Scope:

```text
mem_limit/cpus для client/web/api в docker-compose.prod.yml, чтобы Next.js
SSR не выдавил postgres на одной машине. Ориентиры docs/SERVER_TO_PROD.md §4:
client 3–4 GB, api 2 GB, web 0.7 GB (подогнать под фактический VPS).
```

Files expected:

```text
docker-compose.prod.yml
```

Acceptance criteria:

```text
docker compose config валиден; лимиты видны в docker stats на staging
Стек живёт под нагрузкой смоук-прогона без OOM-kill
```

Suggested commits:

```text
chore(deploy): add memory/cpu limits to prod services
```

Dependencies:

```text
None
```

---

### TASK-237 — dependabot + закрепление версий базовых образов

Status:

```text
TODO
```

Branch:

```text
chore/dependabot
```

Scope:

```text
.github/dependabot.yml: экосистемы npm (корень), github-actions, docker.
Закрепить плавающие теги образов минимум до минора: redis:7.x-alpine,
caddy:2.x-alpine (postgis уже 16-3.4). Интервал weekly, лимит открытых PR.
```

Files expected:

```text
.github/dependabot.yml
docker-compose.yml, docker-compose.prod.yml (теги образов)
```

Acceptance criteria:

```text
Dependabot открывает PR по трём экосистемам
Теги образов закреплены до минора
```

Suggested commits:

```text
chore: add dependabot config and pin base image tags
```

Dependencies:

```text
None
```

---

### TASK-238 — Firewall/SSH-hardening runbook для VPS

Status:

```text
TODO (правки в репо) + серверная часть за Team Lead
```

Branch:

```text
docs/server-hardening-runbook
```

Scope:

```text
Дополнить deploy/README.md (или install-docker.sh) блоком:
ufw default deny incoming; allow 22,80,443/tcp; enable + отключение
password-auth в sshd. ЯВНО задокументировать: docker publish ОБХОДИТ ufw —
поэтому на сервере нельзя поднимать base-compose без prod-overlay (dev-порты
postgres/redis торчат на 0.0.0.0). Затем применить на VPS.
```

Files expected:

```text
deploy/README.md
deploy/install-docker.sh (опционально — идемпотентный ufw-блок)
```

Acceptance criteria:

```text
Runbook в README; предупреждение про docker publish + base-compose
На VPS: ufw active (22/80/443), PasswordAuthentication no
```

Suggested commits:

```text
docs(deploy): add firewall and ssh hardening runbook
```

Dependencies:

```text
SSH-доступ к VPS для применения
```

---

### TASK-239 — Актуализировать deploy/README.md

Status:

```text
TODO
```

Branch:

```text
docs/deploy-readme-refresh
```

Scope:

```text
Убрать выполненные пункты «На заметку»: trust proxy уже в
apps/api/src/main.ts:17; NEXT_PUBLIC_YANDEX_MAPS_API_KEY для client уже
прокинут (ARG+compose). При необходимости добавить аналогичный ARG для web.
Сверить остальной текст README с фактическим состоянием deploy/*.
```

Files expected:

```text
deploy/README.md
apps/web/Dockerfile + docker-compose.yml (если добавляем Yandex-ARG для web)
```

Acceptance criteria:

```text
В «На заметку» нет уже выполненных пунктов
Описание скриптов/восстановления соответствует текущим файлам
```

Suggested commits:

```text
docs(deploy): refresh README, drop completed notes
```

Dependencies:

```text
None
```

---

## 22e. M19 — DevOps P2 (аудит 2026-07-05, «желательно» — backlog)

Источник: `DevOps.md` §«P2 — желательно» (пункты 14–20). Статус BACKLOG —
промотируются в TODO, когда берутся в работу.

### TASK-240 — Zero-downtime deploy

Status:

```text
BACKLOG
```

Scope:

```text
После перехода на registry-образы (TASK-235): либо два экземпляра api/client
за Caddy с поочерёдным рестартом (docker rollout), либо минимум — порядок
«собрать/спуллить заранее → up -d без --build», чтобы окно даунтайма сжалось
до рестарта контейнеров.
```

Dependencies:

```text
TASK-235
```

---

### TASK-241 — Метрики хоста и контейнеров

Status:

```text
BACKLOG
```

Scope:

```text
node-exporter + cAdvisor + Grafana Cloud (free tier) или netdata — чтобы
сигналы «пора масштабироваться» из docs/SERVER_TO_PROD.md §7 (p95, load
average, cache hit ratio PG) было чем измерять.
```

---

### TASK-242 — Тюнинг производительности по мере роста (SERVER_TO_PROD §6)

Status:

```text
BACKLOG
```

Scope:

```text
PgBouncer, shared_buffers/effective_cache_size, ISR/Redis-кэш горячих
страниц, вынос BullMQ-воркеров в отдельный контейнер. Брать по одному при
появлении соответствующих сигналов из мониторинга (TASK-241).
```

Dependencies:

```text
TASK-241 (сначала измерить)
```

---

### TASK-243 — e2e-смоук (Playwright) на staging после деплоя

Status:

```text
BACKLOG
```

Scope:

```text
Смоук-набор: главная, /search, вход по OTP (staging-режим позволяет — код в
логах/Telegram). Запуск вручную или шагом после deploy-staging.sh.
```

---

### TASK-244 — Rate-limit на Caddy для /api/v1/auth/*

Status:

```text
BACKLOG
```

Scope:

```text
Плагин rate_limit для Caddy (кастомная сборка xcaddy) или fail2ban по логам
Caddy — гасить флуд до Node/Throttler.
```

---

### TASK-245 — Гигиена репо: CODEOWNERS, PR-template, .nvmrc

Status:

```text
BACKLOG
```

Scope:

```text
.github/CODEOWNERS, .github/pull_request_template.md (чеклист из CLAUDE.md §6),
.nvmrc (20) для единообразия с engines/CI.
```

---

### TASK-246 — Бэкап серверного .env в защищённое место

Status:

```text
BACKLOG
```

Scope:

```text
Сейчас потеря VPS = потеря всех прод-секретов, включая JWT (инвалидация всех
сессий). Зашифрованная копия .env в менеджере секретов / password manager +
пункт в runbook о ротации после инцидента. backup.sh БД не трогает .env.
```

---

## 22f. Заявки мобильного клиента (2026-07-06)

Источник: `BACKEND-REQUESTS (3).md` от мобильного разработчика (06.07.2026),
7 пунктов (0–6). Сверено построчно с кодом `apps/api` 06.07.2026.
Три пункта в задачи НЕ превращаются — уже покрыты или это действие на сервере:

```text
Пункт 0 (env Google/Apple + FCM) → КОДА НЕ ТРЕБУЕТ. CSV-audience уже парсится
        (configuration.ts:248/258 → google.clientIds/apple.clientIds;
        google-auth.service.ts:147, apple-auth.service.ts:78). Миграция
        20260622000000_notification_deliveries уже в репо. Нужно только выставить
        GOOGLE_CLIENT_ID (CSV из заявки), APPLE_CLIENT_ID=uz.avino.app, залить
        Firebase service-account (FIREBASE_*) и прогнать migrate deploy на сервере
        → действие Team Lead. 401/503 = отсутствующие env, не баг.
Пункт 1 (кластеры карты)          → уже реализовано: GET /api/v1/search/clusters
        (ADR-0126, PR #323/#324). Форма ответа clusters.dto.ts:27-39
        (latitude/longitude/count/min_price/avg_price) совпадает с запросом 1:1,
        min/avg_price FX-нормализованы. Мобилке — просто использовать эндпоинт.
Пункт 4 (FX ценового фильтра)     → уже реализовано (search.service.ts:1187-1201,
        ADR-0117). Конверсия включается ТОЛЬКО если клиент шлёт currency вместе
        с price_min/price_max; без currency код падает в else и сравнивает сырую
        цену (:1202-1208) — это и есть их симптом. Фикс на стороне клиента:
        добавить currency=USD|UZS к ценовым фильтрам. Backend не трогаем.
```

TASK-247/248/249 выполнены и смёржены (PR #359, деплой staging 06.07, smoke зелёный
на test-api.avino.uz) → перенесены в docs/DONE.md. Остаётся TASK-250 (аудит показал:
уже починено в main коммитом 9a1c685 — кода не требуется, оставлен для истории).

### TASK-250 — Баг: бокс «весь мир» возвращает пусто (пункт 3)

Status:

```text
TODO (low-pri — на реальных зумах не мешает, оценка мобилки)
```

Branch:

```text
fix/search-bounds-full-extent
```

Scope:

```text
GET /search/bounds?sw_lat=-85&sw_lng=-180&ne_lat=85&ne_lng=180 → total 0,
хотя более узкий бокс отдаёт данные. boundsPrefilterSql уже чанкует широкий bbox
≤90° geography (search.service.ts:908-924), но финальный
ST_Within(location::geometry, envelope) в searchBounds (:596) использует ПОЛНЫЙ
ST_MakeEnvelope(-180,-85,180,85) — вырождение на полном экстенте. Repro на
staging, подрезать/чанковать финальный ST_Within (или снять его на полном
экстенте, оставив чанкованный &&).
```

Files expected:

```text
apps/api/src/search/search.service.ts  (envelopeSql / searchBounds)
apps/api/src/search/*.spec.ts           (регресс на полный экстент)
```

Acceptance criteria:

```text
GET /search/bounds sw=-85,-180 ne=85,180 → total > 0 (все объявления)
Узкие боксы продолжают работать (без регресса)
```

Dependencies:

```text
нет
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
TASK-190 TASK-191 TASK-192
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
