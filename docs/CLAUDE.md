# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 0. Project status & architecture

**Greenfield.** На данный момент репозиторий содержит только этот файл правил — кода, сборки и тестов ещё нет. Команды build/lint/run/test будут добавлены сюда после скаффолдинга.

Целевая архитектура — **монорепо** (выводится из путей, на которые ссылаются правила ниже):

```
apps/api/     — NestJS + Prisma + PostgreSQL/PostGIS + Redis + BullMQ + S3  (backend)
apps/web/     — Next.js + TypeScript, RTK Query  (ADMIN-панель, порт 3000)
apps/client/  — Next.js + TypeScript, RTK Query  (ПУБЛИЧНЫЙ портал недвижимости, порт 3001)
packages/shared/ — общие типы/контракты между api и фронтами
```

### Границы приложений (ОБЯЗАТЕЛЬНО для каждой задачи)

Каждая задача работает **строго в одной app-папке** и не трогает чужие:

- Публичный портал (главная, поиск, карта, карточки объявлений, чат, избранное для пользователей) → **только `apps/client/`**.
- Админка / модерация / дашборды → **только `apps/web/`**.
- Backend / API → **только `apps/api/`**.
- Общие контракты → **только `packages/shared/`**.

Правила:
- Нельзя в задаче по публичному порталу редактировать файлы внутри `apps/web/` (и наоборот).
- Если задача требует изменений в нескольких app-папках — это **разные PR** (одна папка = один PR), кроме изменения общего контракта в `packages/shared/`.
- `apps/web/` остаётся за админкой; новый публичный UI пишется с нуля в `apps/client/`.

Ключевые архитектурные ограничения, требующие чтения нескольких разделов:
- **Frontend API-слой централизован** (`apps/web/src/store/api/*`) — никаких `fetch()`/`axios` внутри компонентов (см. §4).
- **Геопоиск — только PostgreSQL + PostGIS** (координаты, радиус, near-me, кластеризация); карты — Yandex Maps (см. §12).
- **Multi-language listings**: объявление создаётся на одном языке и автоматически переводится на остальные (uz/ru/en); все объявления проходят moderation queue NEW → ACTIVE/DRAFT/REJECTED/DELETED (см. §9).
- **Backend должен оставаться совместимым с будущим Flutter-приложением** — API-контракты нейтральны к клиенту (см. §3).
- **API versioning обязателен с первого дня**: все endpoints должны идти через `/api/v1/...`; unversioned routes запрещены (см. §14).
- Запреты на смену стека/ORM/PostGIS/Yandex/Eskiz и т.д. — см. §13, требуют подтверждения Team Lead.

## 1. Язык ответа

Claude всегда отвечает на русском языке.

Исключения допускаются только для:
- кода;
- названий файлов;
- названий веток;
- commit messages;
- API routes;
- enum values;
- технических терминов, которые лучше оставить на английском.

## 2. Роль Claude в проекте

Claude работает как coding agent под контролем Team Lead.

Claude не принимает архитектурные решения самостоятельно, если они меняют:
- структуру проекта;
- базовый стек;
- базу данных;
- авторизацию;
- роли пользователей;
- API-контракты;
- бизнес-логику модерации;
- хранение файлов;
- billing/monetization;
- production deployment.

В таких случаях Claude обязан сначала предложить решение и дождаться подтверждения.

## 3. Основной стек проекта

Project name: Avino

Backend:
- Node.js
- NestJS
- PostgreSQL
- PostGIS
- Redis
- BullMQ
- Prisma ORM
- S3-compatible storage

Frontend:
- Next.js
- TypeScript
- RTK Query для API-запросов, поиска, фильтров, сохранённых поисков, избранного, чата и уведомлений

Mobile:
- Flutter app будет разрабатываться отдельно
- Backend API должен быть совместим с mobile app

External services:
- Yandex Maps
- Eskiz.uz для SMS
- Google Translate API или Yandex Translate API для автоперевода
- SMTP/email provider для email-уведомлений

## 4. RTK Query rule

На frontend для работы с API использовать RTK Query.

RTK Query должен использоваться для:
- поиска объявлений;
- фильтрации объявлений;
- listing details;
- saved searches;
- favorites;
- chat messages;
- notifications;
- user profile;
- moderation/admin API;
- agent/landlord dashboard API.

Не использовать хаотичные fetch() или axios внутри компонентов, если для этого должен быть общий API layer.

API-слой должен быть централизованным:

```text
apps/web/src/store/api/
apps/web/src/store/slices/
apps/web/src/features/
```

Примерная структура:

```text
apps/web/src/store/api/baseApi.ts
apps/web/src/store/api/authApi.ts
apps/web/src/store/api/listingsApi.ts
apps/web/src/store/api/searchApi.ts
apps/web/src/store/api/favoritesApi.ts
apps/web/src/store/api/savedSearchesApi.ts
apps/web/src/store/api/chatApi.ts
apps/web/src/store/api/notificationsApi.ts
apps/web/src/store/api/adminApi.ts
```

## 5. GitHub workflow rules

Правила обязательны для каждой задачи:

- Каждое логическое улучшение = отдельная ветка + 1–3 коммита.
- В main ничего не пушить напрямую.
- Все изменения только через Pull Request.
- Один PR должен решать одну понятную задачу.
- Не смешивать refactor, feature и bugfix в одном PR без необходимости.
- Не делать крупные изменения без описания files changed и checklist.

## 6. Обязательный формат ответа Claude по каждой задаче

В каждом ответе по задаче Claude обязан указать:

A) Нужно заливать в GitHub: ДА/НЕТ

B) Branch name:
```text
feature/<short-name>
fix/<short-name>
chore/<short-name>
docs/<short-name>
refactor/<short-name>
```

C) Files changed:
```text
- path/to/file.ts
- path/to/file.tsx
- path/to/file.md
```

D) Patch:
Дать unified git diff или конкретные заменяемые блоки.

E) Git steps:
```bash
git checkout -b <branch-name>
git add <files>
git commit -m "<commit message>"
git push -u origin <branch-name>
```

Также дать:

```text
PR title:
<short PR title>

PR description:
- Что сделано
- Почему это нужно
- Как проверить
```

Пример:

```text
A) Нужно заливать в GitHub: ДА

B) Branch name:
feature/listings-search-api

C) Files changed:
- apps/api/src/listings/listings.controller.ts
- apps/api/src/listings/listings.service.ts
- apps/api/src/listings/dto/search-listings.dto.ts

D) Patch:
<unified diff>

E) Git steps:
git checkout -b feature/listings-search-api
git add apps/api/src/listings/listings.controller.ts apps/api/src/listings/listings.service.ts apps/api/src/listings/dto/search-listings.dto.ts
git commit -m "feat(listings): add search API filters"
git push -u origin feature/listings-search-api

PR title:
feat(listings): add search API filters

PR description:
- Added listing search endpoint with basic filters
- Supports city, price range, property type and rooms
- Prepared API for web and mobile clients

F) Pre-merge checklist:
- API endpoint returns filtered listings
- DTO validation works
- No direct push to main
- Tests or manual checks completed
- No unrelated files changed
```

## 7. Commit message rules

Commit messages должны быть короткими и готовыми к использованию.

Использовать стиль:

```text
feat(auth): add SMS login flow
feat(listings): create listing moderation status
fix(search): correct price range filter
chore(env): add Eskiz configuration
docs(roadmap): add MVP phases
refactor(api): move listing filters to DTO
```

Разрешённые prefixes:

```text
feat
fix
docs
chore
refactor
test
perf
style
ci
build
```

## Task tracking, DONE.md and ADR rules

Claude must maintain project tracking files after every task.

### 1. TASKS.md rule

docs/TASKS.md contains only active or future work.

Allowed statuses in TASKS.md:

text TODO IN_PROGRESS REVIEW BLOCKED 

Completed tasks must not stay in TASKS.md.

When a task is completed and PR is merged, Claude must move it from:

text docs/TASKS.md 

to:

text docs/DONE.md 

### 2. DONE.md rule

docs/DONE.md is the human-readable history of completed work.

Every completed task must be added to DONE.md.

DONE entry format:

markdown ## YYYY-MM-DD  ### TASK-XXX — Task title  Status: DONE  Branch: <branch-name>  PR: <PR link or PR number>  Files changed: - <file-1> - <file-2>  Summary: - What was implemented - Why it was needed - Important notes  Commit messages: - <commit message 1> - <commit message 2>  Related ADR: - docs/adr/ADR-XXXX-short-title.md 

If PR link is not available yet, write:

text PR: pending 

### 3. ADR rule

ADR means Architecture Decision Record.

Claude must create or update ADR records for completed tasks that introduce or confirm an important technical, architectural or business decision.

ADR files must be stored in:

text docs/adr/ 

ADR filename format:

text ADR-0001-short-title.md ADR-0002-short-title.md ADR-0003-short-title.md 

Examples:

text docs/adr/ADR-0001-use-nestjs-nextjs-postgis.md docs/adr/ADR-0002-api-versioning-v1.md docs/adr/ADR-0003-vip-top-promotion-model.md 

### 4. ADR format

Each ADR must use this format:

markdown # ADR-XXXX — Title  ## Status  Accepted  ## Date  YYYY-MM-DD  ## Context  Describe the problem, requirement, or reason for the decision.  ## Decision  Describe the decision that was made.  ## Consequences  Positive: - ...  Negative / trade-offs: - ...  ## Related files  - ...  ## Related task  - TASK-XXX 

### 5. When new ADR is required

Create a new ADR when the task introduces or confirms decisions such as:

text Choosing NestJS / Next.js / PostgreSQL / PostGIS stack Using API versioning /api/v1 Using Prisma with PostGIS raw SQL migrations Using RTK Query for frontend API layer Using VIP/TOP promotion model Using manual VIP/TOP activation before online payments Using polling chat before WebSocket Using Eskiz.uz for SMS Using Google/Yandex Translate API for MVP translation 

### 6. When existing ADR can be updated

Claude may update an existing ADR instead of creating a new one when the task is only extending an already accepted decision.

Examples:

text Adding endpoint under existing API v1 strategy Adding DB index already defined in DB_SCHEMA.md Adding DTO validation under existing API rules Adding new frontend API slice under RTK Query rule Fixing documentation formatting 

### 7. Completion response format

For every task, Claude must include this section in the response:

text G) After merge actions: - Move TASK-XXX from docs/TASKS.md to docs/DONE.md - Create/update ADR: docs/adr/ADR-XXXX-short-title.md 

Full required response format becomes:

text A) Нужно заливать в GitHub: ДА/НЕТ  B) Branch name: ...  C) Files changed: ...  D) Patch: ...  E) Git steps: ...  F) Pre-merge checklist: ...  G) After merge actions: ... 

### 8. Do not mark DONE before merge

Claude must not mark a task as DONE until the PR is merged.

Task status meaning:

text TODO         Task not started IN_PROGRESS Branch is being worked on REVIEW       PR is open and waiting for review DONE         PR is merged BLOCKED      Task cannot continue because dependency or decision is missing 

Only merged tasks can be moved to DONE.md.

### 9. DONE.md does not replace GitHub history

DONE.md is only a project log.

It does not replace:

text git commits Pull Requests ADR files 

Claude must still provide git commands, commit messages, PR title, PR description and pre-merge checklist for every task.
## 8. Текущая задача format

Когда Team Lead даёт задачу, Claude должен использовать такой шаблон:

```text
Текущая задача:
- <описание задачи>
```

После этого Claude обязан ответить строго по формату:

```text
A) Нужно заливать в GitHub: ДА/НЕТ

B) Branch name:
...

C) Files changed:
...

D) Patch:
...

E) Git steps:
...

F) Pre-merge checklist:
...
```

Не писать лишнего. Только то, что нужно, чтобы применить изменения и запушить PR.

## 9. Project-specific business rules

Avino — портал недвижимости для Узбекистана.

Основные роли:
- GUEST
- USER
- OWNER
- AGENT
- AGENCY
- LANDLORD
- PROPERTY_MANAGER
- MODERATOR
- ADMIN

Языки:
- Uzbek
- Russian
- English

Default language:
- определять по браузеру или телефону пользователя
- пользователь может переключить язык вручную

Объявления:
- пользователь создаёт объявление на одном языке
- система автоматически переводит на остальные языки
- все объявления проходят moderation queue

Listing statuses:

```text
NEW
ACTIVE
DRAFT
REJECTED
DELETED
ARCHIVED
SOLD
RENTED
```

MVP UI может сначала показывать:

```text
NEW
ACTIVE
DRAFT
DELETED
```

Moderation flow:

```text
User creates listing → NEW
Admin/moderator reviews → ACTIVE / DRAFT / REJECTED / DELETED
```

Позже можно добавить auto-publish для доверенных агентств.

## 10. Chat rules

В MVP нужен полноценный внутренний чат Avino.

Пользователь может написать создателю объявления:
- собственнику;
- агенту;
- агентству;
- landlord;
- property manager.

Чат должен быть связан с:
- listing;
- buyer/renter user;
- listing owner/agent;
- message thread.

Не делать tenant screening в MVP. Tenant screening — Phase 2.

## 11. Notifications rules

В MVP нужны:
- email alerts;
- push notification support for mobile;
- notifications for saved searches;
- notifications for new chat messages;
- notifications for listing moderation status changes.

Saved search rule:

Если в сохранённом поиске появился новый объект, пользователь получает email notification.

## 12. Maps rules

Использовать Yandex Maps.

Нужно поддержать:
- координаты объекта;
- выбор точки на карте при создании объявления;
- отображение объектов на карте;
- поиск по карте;
- поиск “near me” для mobile;
- поиск по радиусу;
- кластеризацию маркеров.

Для геопоиска использовать PostgreSQL + PostGIS.

## 13. Что нельзя делать без подтверждения

Claude не должен без подтверждения:
- менять стек;
- менять ORM;
- удалять PostGIS;
- заменять Yandex Maps;
- заменять Eskiz.uz;
- отключать moderation queue;
- убирать RTK Query;
- создавать unversioned API routes;
- пушить в main;
- создавать огромный PR на много unrelated изменений;
- добавлять платёжные системы;
- добавлять tenant screening в MVP;
- добавлять auto-publish для агентств в MVP.

## 14. API versioning rules

Backend API должен использовать URI-based versioning с первой реализации.

Обязательный формат:

```text
/api/v1/<resource>
/api/v2/<resource>
```

Для MVP реализуется только `v1`.

`v2` не создавать заранее. `v2` добавляется только при реальном breaking change или крупном redesign API.

NestJS должен включать versioning глобально в `main.ts`:

```ts
app.setGlobalPrefix('api');

app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: '1',
});
```

Все controllers должны явно объявлять version:

```ts
@Controller({
  path: 'listings',
  version: '1',
})
export class ListingsController {}
```

Примеры routes:

```text
GET /api/v1/listings
POST /api/v1/listings
GET /api/v1/listings/:id
POST /api/v1/auth/login
GET /api/v1/search
GET /api/v1/chat/threads
```

Unversioned API routes запрещены.

Breaking changes должны идти в новую API version.

Примеры breaking changes:
- удаление response fields;
- переименование response fields;
- изменение enum values;
- изменение request body structure;
- изменение auth flow;
- изменение pagination format;
- изменение error response format.

Non-breaking changes могут оставаться в текущей version.

Примеры non-breaking changes:
- добавление optional response fields;
- добавление optional filters;
- добавление новых endpoints;
- улучшение validation без поломки валидных клиентов;
- добавление новых notification types.

Frontend и mobile clients должны использовать только versioned API routes.

## 15. Model routing (выбор модели под задачу)

Claude (как контроллер) подбирает модель по типу задачи. CLAUDE.md задаёт правило;
жёсткое назначение модели — во frontmatter суб-агентов в `.claude/agents/`.

Уровни моделей Claude (других нет — никакого «fable»):
- **Opus** — самый умный/дорогой.
- **Sonnet** — рабочая лошадка, баланс цена/качество.
- **Haiku** — самый быстрый/дешёвый.

Правило маршрутизации:

```text
Opus    → планирование, архитектура, code review, отладка сложной логики,
          решения с риском (см. §13)
Sonnet  → обычная реализация фич  → суб-агент `avino-impl`
Haiku   → рутина: переименования, форматирование, поиск по коду,
          мелкие правки           → суб-агент `avino-chore`
```

Как применять:
- Тяжёлое/архитектурное Claude делает сам (сессия на Opus) или через Opus-агента.
- Реализацию фичи в одной app-папке делегировать `avino-impl` (Sonnet).
- Мелкую рутину делегировать `avino-chore` (Haiku).
- Суб-агенты пишут только код и НЕ трогают git — git/PR ведёт контроллер
  (см. [[avino-subagents-shared-workdir-git-hazard]]).