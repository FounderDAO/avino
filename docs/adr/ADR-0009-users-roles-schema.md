# ADR-0009 — Identity schema: users, profiles, roles

## Status

Accepted

## Date

2026-06-03

## Context

TASK-033 вводит первые предметные таблицы Avino — ядро identity:
`users`, `user_profiles`, `roles`, `user_roles` (DB_SCHEMA.md §4). Это первая
табличная миграция поверх baseline-миграции расширений (TASK-031), и она же
снимает временную placeholder-модель `HealthCheck` (TASK-030).

Реализация упирается в три ограничения Prisma, которые нужно зафиксировать как
решение, а не как разовый хак:

1. **Уникальность контакта только среди не-удалённых аккаунтов.** Бизнес-правило
   (Variant A, ARCHITECTURE §28 / DB_SCHEMA §14–15): soft-deleted аккаунт должен
   освобождать `phone`/`email` для повторной регистрации, сохраняя исходное
   значение на удалённой строке для истории/аудита. Это **частичный** уникальный
   индекс (`WHERE status <> 'DELETED'`), который Prisma выразить не умеет.
2. **CHECK-ограничения.** «Хотя бы один контакт обязателен» и «`deleted_at`
   выставлен тогда и только тогда, когда `status = DELETED`» (DB_SCHEMA §15) —
   Prisma их не поддерживает декларативно.
3. **Тип времени.** Дефолт Prisma для `DateTime` — `timestamp(3)` (без таймзоны),
   тогда как DB_SCHEMA §2 требует `timestamptz` в UTC для всех временных полей.

## Decision

1. **Четыре модели в `schema.prisma`** строго по DB_SCHEMA §4: `User`,
   `UserProfile` (1:1, `user_id UNIQUE`, `ON DELETE CASCADE`), `Role`
   (справочник, `code` UNIQUE), `UserRole` (M:N, `@@unique([userId, roleId])`,
   индексы по `userId` и `roleId`). Placeholder `HealthCheck` удалён.
2. **`phone`/`email` НЕ помечены `@unique`** в Prisma-модели. Частичные
   уникальные индексы `uniq_users_phone_active` / `uniq_users_email_active`
   (`WHERE status <> 'DELETED' AND <col> IS NOT NULL`) создаются сырым SQL,
   дописанным в конец сгенерированной миграции — тот же паттерн, что и будущий
   GIST-индекс PostGIS (ADR-0003).
3. **Два CHECK-ограничения** (`users_contact_present_check`,
   `users_deleted_at_consistency_check`) добавляются тем же сырым SQL.
4. **Все временные поля используют `@db.Timestamptz(6)`** (`created_at`,
   `updated_at`, `last_login_at`, `deleted_at`), чтобы соблюсти DB_SCHEMA §2.
   `updated_at` поддерживается приложением через `@updatedAt` (без DB-дефолта —
   это ожидаемо: сырой `INSERT` обязан задавать `updated_at` явно).
5. **Миграция не пересоздаёт расширения** (pgcrypto/postgis/pg_trgm) — ими
   владеет baseline-миграция. Но как первая табличная миграция она создаёт **все
   объявленные enum-типы** (включая ещё не используемые `ListingStatus`,
   `PromotionType`, `Currency`), чтобы схема и история миграций не расходились;
   `listings` (TASK-035) их переиспользует.
6. **`granted_by` — `ON DELETE SET NULL`**: назначение роли переживает удаление
   назначавшего администратора; `role_id` — `ON DELETE RESTRICT` (нельзя удалить
   роль, пока она кому-то назначена).
7. **Сид ролей** (`prisma/seed.ts`, идемпотентный `upsert` по `code`) заполняет
   8 ролей из DB_SCHEMA §3: USER, OWNER, AGENT, AGENCY, LANDLORD,
   PROPERTY_MANAGER, MODERATOR, ADMIN. `GUEST` намеренно НЕ сидируется (ADR-0008).
   Коды берутся из общего `UserRole` (@avino/shared), чтобы исключить рассинхрон.
   Сид подключён через `prisma.seed` в `apps/api/package.json` (`ts-node`).

## Consequences

Positive:

- Soft-delete освобождает контакт для повторной регистрации, не теряя историю
  (Variant A) — проверено смоук-тестом: дубликат активного телефона отвергается,
  после soft-delete тот же телефон регистрируется заново.
- Целостность гарантируется на уровне БД (CHECK + частичные индексы), а не только
  в коде приложения.
- Все таймстемпы — `timestamptz` в UTC; нет наивного локального времени.
- Роли расширяются без миграции (справочник + M:N), enum-типы созданы заранее.

Negative / trade-offs:

- Часть ограничений живёт в сыром SQL, дописанном в миграцию вручную, а не в
  декларативной схеме Prisma; их нужно сопровождать отдельно (тот же компромисс,
  что и для PostGIS-индексов — ADR-0003).
- Сырые `INSERT` в обход Prisma обязаны явно задавать `updated_at` (нет
  DB-дефолта), что важно помнить в будущих сырых SQL-запросах и тестах.
- Enum-типы, ещё не используемые ни одной моделью, уже материализованы в БД —
  небольшой «забег вперёд» ради синхронности схемы и истории миграций.

## Related files

- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260603130000_add_users_and_roles/migration.sql
- apps/api/prisma/seed.ts
- apps/api/package.json
- docs/DB_SCHEMA.md

## Related task

- TASK-033
