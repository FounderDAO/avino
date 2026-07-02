# ADR-0119 — Счётчик звонков по объявлению (`calls_count`)

## Status

Accepted

## Date

2026-07-03

## Context

Владелец объявления и админ видят счётчик просмотров (`views_count`), но не видят,
сколько раз потенциальные покупатели проявили намерение позвонить. Нужна метрика
интереса «звонки по объявлению» — в первую очередь для мобильного приложения
(`docs/superpowers/specs/2026-07-03-calls-counter-design.md`).

Вопросы, требовавшие решения:
1. **Что считать** — факт состоявшегося звонка или намерение (клик по номеру)?
2. **Дедуплицировать ли** клики (уникальные пользователи vs каждый тап)?
3. **Модель данных и транспорт** — как хранить и как инкрементить.

## Decision

**Считаем намерение позвонить = клик по раскрытой `tel:`-ссылке.** Факт дозвона из
браузера/мобилки узнать нельзя — ограничение принято осознанно, так работают все
доски объявлений. Раскрытие номера («Показать телефон») НЕ считаем — считаем только
клик по самой ссылке (состояния в UI уже разделены, искусственный guard не нужен).

**Без дедупликации:** каждый тап = +1, как у просмотров. Это метрика интереса,
а не уникальных пользователей.

**Полное зеркало паттерна просмотров** (`viewsCount` / `POST /listings/:id/view`):
- поле `Listing.callsCount Int @default(0) @map("calls_count")` + миграция
  `20260703000000_add_listing_calls_count`;
- метод `registerCall(listingId)` — копия `registerView`:
  `UPDATE listings SET calls_count = calls_count + 1 WHERE id = ...::uuid
  AND status = 'ACTIVE'`; 0 строк → `NotFoundException` (инкремент только для `ACTIVE`);
- `POST /api/v1/listings/:id/call` → `204`, без тела, без авторизации (копия `registerView`);
- `calls_count` отдаётся в detail/list-ответах.

Клиент шлёт `POST /listings/:id/call` fire-and-forget при клике по `tel:` (без `await`,
без `preventDefault` — набор номера не блокируется; ошибки молча глотаются, как в
`ViewTracker`). Владелец своего объявления кнопку телефона не видит → самонакрутки нет.

## Consequences

Positive:
- Единообразие с `views_count` на всех слоях (schema, service, ответы, клиент) —
  минимум нового кода и когнитивной нагрузки.
- Эндпоинт без авторизации и без тела — совместим с web и будущим Flutter-клиентом
  (CLAUDE.md §3); non-breaking (новый endpoint + optional поле ответа, §14).
- Инкремент только для `ACTIVE` отсекает накрутку по чужим/снятым объявлениям.

Negative / trade-offs:
- Считается намерение (клик), а не факт звонка — метрика завышена относительно
  реальных дозвонов (осознанно).
- Порядок «клик 1 = показать номер, клик 2 = засчитать» держится на локальном
  `phoneShown`, сбрасываемом при перезаходе. Для метрики интереса приемлемо:
  каждый визит с намерением звонка = +1.
- Нет дедупликации → значение отражает клики, не уникальных пользователей.

## Related files

- `apps/api/prisma/schema.prisma` (модель `Listing`),
  `apps/api/prisma/migrations/20260703000000_add_listing_calls_count/migration.sql`
- `apps/api/src/listings/listings.service.ts` (`registerCall`, select'ы, маппинги),
  `apps/api/src/listings/listings.controller.ts` (`@Post(':id/call')`)
- `apps/api/openapi.{public,internal}.json`, `docs/openapi.json`
- Клиент/админка (в отдельном PR): `apps/client/src/features/detail/ContactCard.tsx`,
  `apps/client/src/features/account/MyListings.tsx`,
  `apps/web/src/app/admin/listings/[id]/page.tsx`

## Related task

- Счётчик звонков по объявлению. PR #293 (API). Spec:
  `docs/superpowers/specs/2026-07-03-calls-counter-design.md`.
