# ADR-0027 — Public search: promotion-aware (time-guarded) sorting

## Status

Accepted

## Date

2026-06-04

## Context

TASK-081 продолжает milestone M6: публичный поиск (`GET /api/v1/search`,
ADR-0026) должен ранжировать продвинутые объявления выше обычных. ADR-0004 фиксирует
модель промо (VIP > TOP > NORMAL) и два обязательных правила ранжирования:

1. **Effective tier — time-guarded в SQL.** Объявление считается `VIP`/`TOP`
   только пока `promotion_expires_at > now()`; истёкшая промо ранжируется как
   `NORMAL` **независимо** от expire-job (job — для очистки кэша/уведомлений, не
   для корректности порядка).
2. Детерминированный ключ сортировки: `(effective_tier DESC, created_at DESC,
   id DESC)`; keyset-пагинация предпочтительна.

ADR-0026 (TASK-080) намеренно оставил сортировку как хвост `created_at DESC,
id DESC` и предсказал, что TASK-081 изменит `ORDER BY` и расширит курсор тиром.
`effective_tier` уже отдавался в карточке §9 (time-guarded), поэтому форма ответа
не меняется — меняются только порядок и формат непрозрачного курсора.

Ключевое ограничение реализации: Prisma `orderBy` не выражает условный
`CASE`-ранг с гардом по времени. Сортировать по сырой колонке `promotion_type`
нельзя — истёкшая промо тогда осталась бы вверху, нарушив правило (1) и acceptance
criteria «expired promotions are treated as NORMAL».

## Decision

1. **Ранжирование, keyset и `total` — параметризованный raw-SQL** (`Prisma.sql`
   / `$queryRaw`). Time-guarded ранг тира:

   ```sql
   CASE
     WHEN promotion_type = 'VIP' AND promotion_expires_at > now() THEN 2
     WHEN promotion_type = 'TOP' AND promotion_expires_at > now() THEN 1
     ELSE 0
   END
   ```

   `ORDER BY <rank> DESC, created_at DESC, id DESC`, `LIMIT limit + 1`. Тот же
   `CASE` используется в keyset-условии (см. п.3) — поэтому совпадает с
   `effective_tier` карточки (метод `effectiveTier`, тот же time-guard).
2. **Двухшаговая гидратация.** Raw-запрос возвращает только ключи сортировки
   (`id`, `created_at`, `tier_rank`); страница затем гидратируется через
   `prisma.listing.findMany({ where: { id: { in } } })` с восстановлением порядка
   ранжирования. Это держит фильтры в одном SQL-билдере, сохраняет relation-load
   (translations/media) и маппинг карточки §9 без изменений.
3. **Keyset расширен тиром.** Курсор — base64url-JSON `{ rank, createdAt, id }`.
   Условие «строго после позиции»:
   `rank < c.rank OR (rank = c.rank AND created_at < c.createdAt)
    OR (rank = c.rank AND created_at = c.createdAt AND id < c.id)`.
   Повреждённый/структурно-невалидный (без `rank`) курсор → `400
   VALIDATION_ERROR` (не молчаливый сброс к первой странице).
4. **Фильтры — `Prisma.sql`-фрагменты** (защита от инъекций). Enum-колонки
   сравниваются через `::text` (не зависит от имени PG-типа), `city_id`/
   `district_id` — `::uuid`, цена — `::numeric` в пределах одной валюты (без FX).
   Фильтр `status = 'ACTIVE'` ставится всегда, до пользовательских фильтров.

## Consequences

Positive:

- Корректный порядок без stale top-placement: истёкшая промо немедленно падает в
  `NORMAL` в выдаче, независимо от expire-job (ADR-0004 §2).
- Форма ответа §9 не изменилась — только порядок; клиенты M6 не ломаются.
- Фильтры живут в одном SQL-билдере, переиспользуются для страницы и `count`.

Negative / trade-offs:

- Поиск переходит на raw-SQL — теряется часть типобезопасности Prisma на пути
  ранжирования; компенсируется юнит-тестами на форму SQL и явными кастами.
- Две БД-операции на страницу (raw-ранжирование + `findMany`-гидратация). Для
  MVP-объёмов приемлемо; при росте — материализованный ранг/денормализация.
- `CASE`-ранг по времени не покрывается композитным индексом
  `(status, promotion_type, created_at desc, id desc)` напрямую — глубокая
  пагинация оптимизируется отдельно (backlog M6, как и в ADR-0026).
- Формат курсора сменился (`{ created_at, id }` → `{ rank, created_at, id }`).
  Допустимо: токен непрозрачный и до релиза (предсказано ADR-0026).

## Related files

- apps/api/src/search/search.service.ts
- apps/api/src/search/search.service.spec.ts
- apps/api/src/search/search.service.int-spec.ts (live-PostgreSQL ordering/keyset)
- apps/api/jest.int.config.js
- apps/api/test/load-env.ts

## Related task

- TASK-081

## Related ADR

- ADR-0004 (VIP/TOP promotion model — time-guarded ranking)
- ADR-0026 (public search keyset & basic filters)
