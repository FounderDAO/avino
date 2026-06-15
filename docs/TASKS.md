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
