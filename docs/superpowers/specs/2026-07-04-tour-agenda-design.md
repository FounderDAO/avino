# Дизайн: «Предстоящие туры» — агенда + контекст объявления в тур-заявках

Дата: 2026-07-04
Статус: утверждён Team Lead (вариант A, без напоминаний)

## Проблема

После подтверждения тура обе стороны о нём «забывают»:

1. Заявитель (outgoing) не видит, к какому объявлению относится его тур — API отдаёт
   только голый `listingId`, строки в `/account/tours` некликабельны и показывают
   его собственные имя/телефон.
2. Владелец в списке incoming тоже не видит название объявления (только внутри модалки).
3. Нет вида «предстоящие туры»: оба списка — плоская лента всех статусов,
   отсортированная по `createdAt DESC`, а не по дате тура. Подтверждённый тур тонет.
4. API не поддерживает фильтры (`status`, «предстоящие») — только `limit`/`cursor`.
5. Владелец не может отменить уже подтверждённый тур: `DECLINE` разрешён только из
   `PENDING`, `CANCEL` — только заявителю. Тур застревает в `CONFIRMED`.

Напоминания перед туром (BullMQ, `TOUR_REMINDER`) — осознанно вне скоупа, следующий шаг.

## Решение

Два PR (одна app-папка = один PR).

### PR 1 — apps/api, branch `feat/tour-requests-listing-context`

Все изменения additive / non-breaking (API v1 остаётся).

1. **Обогащение ответов** `GET /api/v1/tour-requests/outgoing` и `/incoming`:
   - каждому item добавляется объект `listing`:
     ```json
     { "id": "<uuid>", "title": "<строка на языке ответа>", "photo_url": "<signed url | null>" }
     ```
     - `title` резолвится по `Accept-Language` через существующий
       `TranslationsService.resolveLanguage` (паттерн `listings.service.ts`);
     - `photo_url` — первое фото объявления (`media` по `sortOrder ASC`),
       sign-on-read через `resolveMediaUrl` (ADR-0086), `null` если фото нет;
   - в **outgoing** items дополнительно `owner`:
     ```json
     { "name": "<имя владельца>", "phone": "<телефон | null>" }
     ```
     `phone` отдаётся **только когда `status = CONFIRMED`** — до подтверждения контакт
     не раскрываем и не обходим счётчик звонков. В остальных статусах `phone: null`.
   - incoming уже содержит `requester_name`/`requester_phone` — без изменений.

2. **Новые опциональные query-параметры** обоих list-эндпоинтов:
   - `status=<PENDING|CONFIRMED|DECLINED|CANCELLED>` — фильтр по статусу;
   - `upcoming=true` — только туры с `requestedDate >= сегодня` (Asia/Tashkent,
     как весь тур-домен);
   - при `upcoming=true` сортировка меняется на `requestedDate ASC, windowStart ASC,
     id ASC` (агенда) и **cursor не используется** (отдаём до `limit`, предстоящих
     туров мало; `next_cursor: null`). Без `upcoming` поведение прежнее
     (`createdAt DESC, id DESC`, keyset cursor).

3. **Переход `DECLINE` из `CONFIRMED`** (только владелец): владелец может отменить
   уже подтверждённый тур. Уведомление заявителю — существующий
   `TOUR_REQUEST_STATUS_CHANGED`. Слот освобождается автоматически (partial unique
   index покрывает только PENDING/CONFIRMED).

4. Swagger DTO (query DTO + response DTO) + `pnpm openapi:export` (CI drift-check).
   Unit-тесты сервиса: фильтры, сортировка upcoming, phone-гейтинг owner, новый переход.

### PR 2 — apps/client, branch `feat/account-tours-agenda`

Переделка `/account/tours` (`features/account/Tours.tsx` + `store/api/tourRequestsApi.ts`).

1. **Блок «Предстоящие туры»** сверху страницы — единая хронологическая агенда обеих
   ролей: два запроса (`incoming` и `outgoing` с `status=CONFIRMED&upcoming=true`),
   merge на клиенте, сортировка по `requested_date, window_start`. Карточка:
   - фото + название объявления, кликабельно → `/listing/{listing.id}`;
   - дата + окно времени;
   - роль-бейдж: «Вы принимаете» (incoming) / «Вы идёте» (outgoing);
   - контрагент: владельцу — имя и `tel:`-телефон гостя; гостю — имя владельца и
     `tel:`-телефон (телефон приходит только для CONFIRMED);
   - действие «Отменить»: заявителю — action `CANCEL`, владельцу — action `DECLINE`.
   - пустое состояние: блок не рендерится, если предстоящих туров нет.
2. **Списки ниже** («Запросы ко мне» / «Мои запросы») — как сейчас, но:
   - каждая строка получает мини-фото + название объявления;
   - outgoing-строки становятся кликабельными — ссылка на `/listing/{listing.id}`;
   - история (DECLINED/CANCELLED) остаётся в этих списках с бейджами (не прячем).
3. RTK Query: параметры `status`/`upcoming` в `getOutgoingTours`/`getIncomingTours`
   (ключ кэша по аргументам), типы дополнены `listing`/`owner`.
4. i18n ru/uz/en (namespace `account`), даты — существующие форматтеры.
   Бейдж в шапке (`useUnreadCounts`) не трогаем — по-прежнему PENDING-входящие.

## Что НЕ делаем (YAGNI)

- Напоминания перед туром (воркер, email/push) — отдельная задача.
- Календарный вид.
- Отдельная страница/вкладка истории.
- Админ-вид туров в apps/web.
- Изменение бейджа в шапке.

## Ссылки

- Спеки-предшественники: `2026-06-21-property-tour-requests-design.md`,
  `2026-07-02-tour-slot-exclusivity-design.md`, `2026-07-02-incoming-tour-modal-design.md`
- ADR-0086 (sign-on-read media), ADR-0102 (notification delivery)
