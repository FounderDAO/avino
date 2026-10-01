# ADR-0161 — Публичная видимость закрытых листингов (SOLD/RENTED)

## Status

Accepted

## Date

2026-10-01

## Context

ADR-0088 закрепил, что публичный read-path не меняется при появлении
owner-статусов `SOLD`/`RENTED`: «`status='ACTIVE'` already fully hides the
other states» — закрытые сделки были видны только владельцу и
MODERATOR/ADMIN, как `NEW`/`DRAFT`/`ARCHIVED`. ADR-0019 на этом же принципе
построил видимость карточки объявления (`GET /listings/:id`): `ACTIVE` —
публично, остальные статусы — только владельцу/привилегированным ролям,
`404` вместо `403`, чтобы не раскрывать существование скрытого листинга.

Продукт хочет обратного для закрытых (а не скрытых) объявлений: показывать
проданные/сданные объекты по желанию пользователя — прозрачность рынка,
история цен — и выделять их в админке счётчиками. Это требует точечного
отступления от гейта `status = ACTIVE`, принятого в ADR-0088/ADR-0019, но
только для `SOLD`/`RENTED`: остальные непубличные статусы
(`NEW`/`DRAFT`/`REJECTED`/`ARCHIVED`/`DELETED`) должны и дальше быть скрыты
на всех read-path без исключений.

## Decision

1. **Поиск** (`GET /api/v1/search`) получает opt-in query-параметр
   `include_closed` (boolean, default `false`). При `include_closed=true`
   гейт статусов в `SearchService.buildWhereSql` расширяется с
   `status = 'ACTIVE'` до `status IN ('ACTIVE', 'SOLD', 'RENTED')`; без
   параметра (или `false`) выдача не меняется — дефолтное поведение для
   mobile/SEO не затронуто.
2. **Сохранённые поиски принудительно игнорируют `include_closed`.**
   `SearchService.matchNewlyActiveListings` гасит поле (`{ ...query,
   include_closed: undefined }`) перед вызовом `buildWhereSql`, прежде чем
   матчить листинг против фильтров алерта — даже если пользователь сохранил
   поиск с `include_closed=true` в `filters_json`, email-алерт о «новом
   объявлении» всё равно триггерится только по `ACTIVE`-листингам.
   `include_closed` — опция просмотра текущей выдачи, а не критерий
   подписки: алерт «появилось новое объявление» для уже закрытой сделки не
   имеет смысла.
3. **Деталь и медиа объявления публичны для `SOLD`/`RENTED`.** Константа
   `PUBLIC_VIEW_STATUSES = [ACTIVE, SOLD, RENTED]` заменяет точечную
   проверку `status === ACTIVE` в `ListingsService.findOne`
   (`GET /listings/:id`, `/listings/by-ref/:reference`) и
   `ListingMediaService.assertCanView` (`GET /listings/:id/media`).
   Остальные статусы по-прежнему видят только владелец и
   `PRIVILEGED_VIEW_ROLES` (MODERATOR/ADMIN), `DELETED` — всегда `404`;
   `404`-вместо-`403` для скрытых листингов (ADR-0019) сохранён без
   изменений.
4. **Тур-заявки и создание чат-треда остаются `ACTIVE`-only.**
   `TourRequestsService` и `ChatService.createThread` не меняются —
   запись на показ или открытие диалога с владельцем по уже закрытой
   сделке остаётся недоступным, несмотря на то что сама карточка теперь
   видна.
5. **Админ-счётчики.** `AdminStatsResponse` получает `listings_sold` /
   `listings_rented` (`count` по `ListingStatus.SOLD`/`RENTED`) —
   видимость закрытых сделок в UI админки.
6. Константа `PUBLIC_VIEW_STATUSES` намеренно продублирована в
   `listings.service.ts` и `listing-media.service.ts` (а не вынесена в
   общий модуль) — по прецеденту `PRIVILEGED_VIEW_ROLES`: локальная
   константа на 3 строки не стоит кросс-модульной связности между Nest
   модулями; расхождение смягчено перекрёстным JSDoc-комментарием (без
   гарантии компилятора).

## Consequences

Positive:

- Пользователь может по желанию увидеть проданные/сданные объекты (история
  цен, прозрачность рынка); дефолтная выдача поиска (mobile/SEO) не
  меняется — `include_closed` строго opt-in.
- Email-алерты сохранённых поисков остаются точными: `include_closed`
  никак не протекает в матчинг алертов, даже если сохранён в фильтрах.
- Админка получает счётчики `listings_sold`/`listings_rented` без новых
  таблиц/миграций.

Negative / trade-offs:

- Частичное отступление от ADR-0088/ADR-0019: факт продажи/аренды (и цена
  закрытой сделки) становится публичным, хотя раньше был скрыт наравне с
  `NEW`/`DRAFT`/`ARCHIVED`. Осознанный компромисс ради прозрачности рынка.
- `PUBLIC_VIEW_STATUSES` дублируется в двух сервисах — риск расхождения
  при будущих изменениях статусной модели, ничем не защищён кроме
  комментария.
- Карточка закрытого объявления видна, но контакт с владельцем (тур/чат)
  недоступен — для зрителя это может быть не очевидно без явного UI-бейджа
  «Продано»/«Сдано» (ответственность фронтенда, вне скоупа этого ADR).

## Related files

- apps/api/src/search/dto/search-listings.dto.ts (`include_closed`)
- apps/api/src/search/search.service.ts (`buildWhereSql`,
  `matchNewlyActiveListings`)
- apps/api/src/listings/listings.service.ts (`PUBLIC_VIEW_STATUSES`,
  `findOne`)
- apps/api/src/listing-media/listing-media.service.ts
  (`PUBLIC_VIEW_STATUSES`, `assertCanView`)
- apps/api/src/admin/admin-stats.service.ts (`listings_sold`,
  `listings_rented`)
- apps/api/src/tour-requests/tour-requests.service.ts (не изменён —
  `ACTIVE`-only)
- apps/api/src/chat/chat.service.ts (не изменён — `ACTIVE`-only)
- docs/API.md §7, §10 (поиск, admin stats)
- docs/MOBILE_API_CHANGES.md §5

## Related task

- Task 4 (spec: docs/superpowers/specs/2026-10-01-sold-rented-visibility-design.md,
  plan: docs/superpowers/plans/2026-10-01-sold-rented-visibility.md,
  ветка `feat/sold-rented-visibility`)
