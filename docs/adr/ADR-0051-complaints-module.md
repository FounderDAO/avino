# ADR-0051 — Complaints module: table, user report route & admin triage

## Status

Accepted

## Date

2026-06-06

## Context

TASK-132 (milestone M13 — admin panel backend) реализует жалобы на объявления,
описанные в контракте (API.md §16, DB_SCHEMA.md §7), но до этого отсутствовавшие
в коде: не было ни Prisma-модели/миграции, ни модуля; `admin.module.ts` лишь
помечал complaints как «будущий флоу». Из-за этого web-страница ADMIN-10 (PR #84)
была смержена contract-only и BLOCKED — без бэкенда её нельзя ни live-verify, ни
принять по E2E.

Нужны три роута:

- `POST /api/v1/complaints` — USER жалуется на листинг;
- `GET /api/v1/admin/complaints?status&listing_id&page&limit` — список для
  модерации (MODERATOR/ADMIN);
- `PATCH /api/v1/admin/complaints/:id { status }` — смена статуса
  (MODERATOR/ADMIN), с проставлением `handled_by`/`handled_at`.

Решение опирается на уже принятые паттерны: RBAC-guards (ADR-0011), page-based
пагинацию с `PaginatedResponse`/`meta.total` (TASK-053/131, API.md §4),
snake_case-контракт и raw-SQL Prisma-миграции под PostgreSQL enum.

## Decision

1. **Схема.** Новый Postgres enum `complaint_status`
   (`NEW|IN_REVIEW|RESOLVED|REJECTED`) и таблица `complaints` (модель `Complaint`),
   миграция `20260606120000_add_complaints`. Связи по DB_SCHEMA §7:
   - `listing_id` **NOT NULL**, `ON DELETE CASCADE` — жалоба всегда про листинг и
     не переживает его физическое удаление. Единый паттерн дочерних таблиц
     листинга (`moderation_logs`/`favorites`/`listing_translations`); DB_SCHEMA §7
     поправлен с `ON DELETE CASCADE NULL` на `NOT NULL ON DELETE CASCADE`
     (исходная формулировка противоречива — `CASCADE` удаляет строку, а не зануляет FK);
   - `reporter_id` и `handled_by` → `users`, `ON DELETE SET NULL`, nullable —
     жалоба остаётся в истории даже после удаления аккаунта автора/обработавшего;
   - индексы `(status)`, `(listing_id)`.

2. **Модуль.** `ComplaintsModule` владеет бизнес-логикой (`ComplaintsService`) и
   пользовательским роутом `POST /complaints` (`ComplaintsController`, под
   `JwtAuthGuard`). Админ-разбор — `AdminComplaintsController`
   (`JwtAuthGuard`+`RolesGuard`, `@Roles(MODERATOR, ADMIN)`), который
   **регистрируется в `AdminModule`** рядом с прочими админ-роутами, а сервис
   получает через импорт `ComplaintsModule` (как `AdminListingsController`
   использует `ModerationService`).

3. **Контракт.** Создание возвращает минимальный квиток `201 { id, status }`
   (API.md §16). Админ-список/PATCH возвращают полную жалобу в snake_case;
   колонка `reporter_id` отдаётся как **`user_id`**, чтобы совпасть с уже
   смерженным FE-типом `Complaint` (apps/web/src/store/api/adminTypes.ts).
   Существование листинга при создании проверяется как в `FavoritesService`
   (DELETED → 404). Сортировка списка `created_at DESC, id DESC`; фильтры
   `status`/`listing_id` опциональны и комбинируются через AND.

## Consequences

Positive:
- Разблокирована ADMIN-10: появились реальные таблица и роуты для live-verify/E2E.
- Полное соответствие контракту API.md §16 / DB_SCHEMA §7 без расхождений с FE.
- Переиспользованы существующие паттерны (guards, `PaginatedResponse`,
  snake_case, raw-SQL enum) — минимум нового кода и когнитивной нагрузки.

Negative / trade-offs:
- `complaints.reason` ограничен `VARCHAR(120)` (DB_SCHEMA §7); более длинные
  причины должны идти в свободный `details`.
- `handled_by`/`handled_at` перезаписываются при каждой смене статуса (хранится
  только последний обработавший) — отдельного журнала истории жалоб в MVP нет.
- Миграцию необходимо применить (`prisma migrate deploy`) на dev/live перед
  live-verify — само добавление кода БД не меняет.

## Related files

- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260606120000_add_complaints/migration.sql
- apps/api/src/complaints/
- apps/api/src/admin/admin.module.ts
- apps/api/src/app.module.ts
- docs/API.md (§16), docs/DB_SCHEMA.md (§7)

## Related task

- TASK-132
