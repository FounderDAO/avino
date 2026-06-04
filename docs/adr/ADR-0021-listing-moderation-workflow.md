# ADR-0021 — Listing moderation workflow (admin queue, status changes, moderation log)

## Status

Accepted

## Date

2026-06-04

## Context

TASK-053 закрывает moderation-часть milestone M5 поверх listings CRUD
(TASK-050/051/052) и RBAC-слоя (TASK-044, ADR-0016). По CLAUDE.md §9 каждое
объявление проходит moderation queue: создание → `NEW`, модератор/админ
переводит в `ACTIVE | DRAFT | REJECTED | DELETED`. `API.md` §16 и `DB_SCHEMA.md`
§7 фиксируют контракт:

1. `GET /api/v1/admin/listings` — очередь модерации и админ-список (фильтры
   `status`/`property_type`/`transaction_type`/`q`, пагинация). Auth —
   **MODERATOR / ADMIN**.
2. `PATCH /api/v1/admin/listings/:id/status` — действие модерации
   (`moderation_action`: `APPROVE | SEND_TO_DRAFT | REJECT | DELETE`) с маппингом
   на `listing_status`. Логируется в `moderation_logs` + `audit_logs`, владельцу
   ставится уведомление.
3. `GET /api/v1/admin/listings/:id/moderation-logs` — история модерации.

Таблицы `moderation_logs` (доменный лог) на момент задачи не существовало — она
была заявлена в `DB_SCHEMA.md` §7 и в комментариях схемы, но не материализована.
`notifications` (TASK-038) и `audit_logs` (ADR-0004) уже есть. BullMQ-воркеры
(email-транспорт, авто-перевод) ещё не подключены.

## Decision

1. **Новая таблица `moderation_logs` + enum `ModerationAction`.** Модель добавлена
   в Prisma-схему ровно по `DB_SCHEMA.md` §7 (миграция
   `20260604120000_add_moderation_logs`). `listing_id` → `listings` ON DELETE
   CASCADE; `moderator_id` → `users` ON DELETE SET NULL, nullable (null =
   система) — лог переживает удаление аккаунта модератора. Поля `old_status`/
   `new_status`/`reason` фиксируют переход. Это материализация уже принятого
   решения, а не новое архитектурное (стек/ORM/queue не меняются).
2. **Маппинг действия на статус** (в сервисе, не в БД):
   `APPROVE → ACTIVE`, `SEND_TO_DRAFT → DRAFT`, `REJECT → REJECTED`,
   `DELETE → DELETED`.
3. **Гейты переходов.** Отсутствующий или уже `DELETED` листинг → `404 NOT_FOUND`
   (DELETED исключён из read-path, единообразно с TASK-051/052). Источник вне
   множества модерируемых статусов `{NEW, ACTIVE, DRAFT, REJECTED}` (т.е.
   владельческие терминальные `ARCHIVED/SOLD/RENTED`) или переход в тот же статус
   → `422 INVALID_STATUS_TRANSITION`.
4. **`published_at`** выставляется только при первой публикации (`APPROVE →
   ACTIVE`, если `published_at` был `null`); повторное одобрение его не
   сбрасывает. Прочие действия `published_at` не трогают.
5. **Атомарность.** Смена статуса + `moderation_logs` (доменный лог) +
   `audit_logs(LISTING_STATUS_CHANGE)` (generic-аудит, ADR-0004) + постановка
   уведомления выполняются в одной интерактивной транзакции (`$transaction`) —
   лог и уведомление не расходятся со статусом.
6. **Уведомление владельцу.** Создаётся строка `notifications`
   (`type=LISTING_MODERATION_STATUS_CHANGED`, `channel=EMAIL`,
   `status=PENDING`, `data_json` со ссылками сущностей). `PENDING` = постановка
   в очередь BullMQ: воркер подберёт и отправит письмо позже (транспорт ещё не
   подключён, см. `EmailService`). Это и есть «notification job queued».
7. **Модульная структура.** Бизнес-логика — `ModerationModule`
   (`ModerationService`), HTTP-слой — `AdminModule`
   (`AdminListingsController`, роуты `admin/listings`, guard'ы класса
   `JwtAuthGuard + RolesGuard`, `@Roles(MODERATOR, ADMIN)`). `AdminModule`
   рассчитан на дальнейшие админ-роуты (complaints, audit-logs, admin/users).

### Намеренно вне scope (TASK-053)

- **Постановка `translate_listing`-джобы** при `APPROVE → ACTIVE` (ADR-005):
  enqueue подключается вместе с BullMQ-воркером авто-перевода. В коде помечено
  комментарием.
- **Реальная доставка уведомления** (EMAIL/PUSH-транспорт) — отдельная задача
  вместе с email_queue воркером.
- **Complaints** (`/complaints`, `/admin/complaints`) и `/admin/audit-logs` —
  отдельные задачи (модели/роуты вне этого PR).
- **Admin users management** (`/admin/users`, роли) — TASK-044 покрыл RBAC,
  сами админ-роуты пользователей — отдельная задача.

## Consequences

Positive:

- Moderation queue работает end-to-end: список → действие → доменный лог + аудит
  + уведомление владельцу, атомарно.
- `moderation_logs` материализована по контракту `DB_SCHEMA.md` §7 — доступна
  будущим флоу (complaints, аналитика модерации).
- `AdminModule` даёт единую точку для остальных админ-роутов M5+.
- Переходы статусов и видимость `DELETED` единообразны с listings read-path.

Negative / trade-offs:

- Page-based (OFFSET) пагинация админ-списка деградирует на глубоких страницах;
  для очереди модерации объём приемлемый (как в ADR-0020).
- Уведомление доходит до владельца только после подключения BullMQ-воркера —
  сейчас оно лишь надёжно ставится в очередь (`PENDING`).
- `q`-поиск по `translations.title` (`contains`, insensitive) без индекса —
  достаточно для MVP-объёмов; полнотекст/триграммы — позже при необходимости.

## Related files

- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260604120000_add_moderation_logs/migration.sql
- apps/api/src/moderation/moderation.service.ts
- apps/api/src/moderation/moderation.service.spec.ts
- apps/api/src/moderation/moderation.module.ts
- apps/api/src/moderation/dto/list-admin-listings.dto.ts
- apps/api/src/moderation/dto/moderate-listing.dto.ts
- apps/api/src/moderation/index.ts
- apps/api/src/admin/admin-listings.controller.ts
- apps/api/src/admin/admin.module.ts
- apps/api/src/admin/index.ts
- apps/api/src/app.module.ts

## Related task

- TASK-053
