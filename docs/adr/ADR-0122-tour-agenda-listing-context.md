# ADR-0122 — Контекст объявления и агенда в списках тур-заявок

## Status

Accepted

## Date

2026-07-04

## Context

После подтверждения тура обе стороны теряли его из вида: list-эндпоинты
tour-requests отдавали только голый listing_id, не поддерживали фильтры и
сортировались по дате создания заявки, а не по дате тура. Владелец не мог
отменить уже подтверждённый тур (DECLINE был разрешён только из PENDING).

## Decision

1. `GET /api/v1/tour-requests/outgoing|incoming` обогащены блоком
   `listing {id, title, photo_url}` (title по Accept-Language через
   `TranslationsService.resolveLanguage`, фото — sign-on-read, ADR-0086).
2. В outgoing добавлен блок `owner {name, phone}`; телефон раскрывается
   ТОЛЬКО при `status=CONFIRMED` (до подтверждения контакт не раскрываем и
   не обходим счётчик звонков).
3. Новые опциональные query-параметры `status` и `upcoming=true`; при
   upcoming сортировка `requestedDate ASC, windowStart ASC, id ASC` и
   keyset-cursor не используется (`next_cursor: null`). Невалидный `status`
   игнорируется (строгая проверка по `Object.values`, а не `in` —
   оператор `in` матчит prototype chain: `?status=toString` давал бы 500).
4. Переход DECLINE разрешён из CONFIRMED (только владелец) — владелец может
   отменить подтверждённый тур; слот освобождается автоматически (partial
   unique index покрывает только PENDING/CONFIRMED).

Изменения additive/non-breaking, остаются в API v1.

## Consequences

Positive:
- Обе стороны видят «какой тур, когда и по какому объявлению» в одном ответе.
- Клиент строит агенду «Предстоящие туры» без N+1 запросов за листингами.
- Подтверждённый тур больше не «застревает» при смене планов владельца.

Negative / trade-offs:
- list-запросы стали тяжелее (join listing/translations/media/owner);
  для incoming owner-подзапрос избыточен (данные не отдаются) — осознанный
  компромисс ради одного select.
- Смешанная семантика DECLINED (отказ и отмена владельцем) — отдельный
  статус не заводим до реальной необходимости.

## Related files

- apps/api/src/tour-requests/tour-requests.service.ts
- apps/api/src/tour-requests/tour-requests.controller.ts
- docs/superpowers/specs/2026-07-04-tour-agenda-design.md

## Related task

- Tour agenda (spec 2026-07-04), PR: pending
