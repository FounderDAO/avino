# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 0. Project status & architecture

**Greenfield.** На данный момент репозиторий содержит только этот файл правил — кода, сборки и тестов ещё нет. Команды build/lint/run/test будут добавлены сюда после скаффолдинга.

Целевая архитектура — **монорепо** (выводится из путей, на которые ссылаются правила ниже):

```
apps/api/    — NestJS + Prisma + PostgreSQL/PostGIS + Redis + BullMQ + S3
apps/web/    — Next.js + TypeScript, API-слой строго на RTK Query
```

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
- guest
- user
- owner
- agent
- agency
- landlord
- property_manager
- moderator
- admin

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
