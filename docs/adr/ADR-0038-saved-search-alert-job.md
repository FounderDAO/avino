# ADR-0038 — Saved-search alert job: polling matcher on saved_search_queue, published_at watermark, deduplicated email alerts

## Status

Accepted

## Date

2026-06-05

## Context

TASK-102 (milestone M10) добавляет фоновую джобу, которая сопоставляет
сохранённые поиски с новыми объявлениями и уведомляет пользователей (acceptance:
only ACTIVE listings trigger alerts; duplicate alerts are avoided; email
notification is queued; last_checked_at is updated).

Контекст уже заложен предыдущими задачами:

- `SavedSearch` (TASK-091, ADR-0031) хранит версионированный `filters_json`
  (`{ schemaVersion, filters }`) и nullable `last_checked_at` — поле явно
  зарезервировано под polling-матчер (комментарий модели в `schema.prisma`).
- `SearchService` (TASK-080/081/082) уже строит фильтр выдачи через
  `buildWhereSql` (обязательный `status = 'ACTIVE'` + скалярные фильтры,
  injection-safe `Prisma.sql`). Матчеру нужен ровно тот же набор фильтров.
- `Listing.published_at` (TASK-053, ADR-0021) проставляется модерацией при первой
  публикации `APPROVE → ACTIVE` и НЕ сбрасывается при повторном одобрении — это
  естественный момент «объявление стало видимым».
- BullMQ-инфраструктура отлажена на переводе (TASK-071), истечении промо
  (TASK-123, ADR-0035) и email (TASK-101, ADR-0037): продюсеры — в глобальном
  `QueuesModule`, консьюмеры (воркеры) — в доменных модулях; выделенные
  Redis-подключения; периодические sweep-джобы через `upsertJobScheduler`.
- `NotificationsService` (TASK-100/123) ставит PENDING-уведомления в транзакции
  доменной мутации; `EmailService` (TASK-101) — фасад постановки письма в
  `email_queue`.
- ARCHITECTURE §16/§17/§23 — связующие требования: очередь `saved_search_queue`,
  джоба `check_saved_searches`, MVP — polling-матчер с дедупликацией по
  `lastCheckedAt`, только ACTIVE триггерят алерты; целевая архитектура —
  reverse-matching при публикации листинга.

Открытые вопросы этой задачи:

1. **Какой timestamp считать «объявление стало новым совпадением».**
2. **Как гарантировать отсутствие дублей** между последовательными прогонами и
   при гонках/ретраях.
3. **Гранулярность email** — письмо на каждое объявление или дайджест.
4. **Как переиспользовать матчинг фильтров `/search`** без дублирования SQL.

## Decision

1. **`published_at` как watermark, полуоткрытое окно `(since, runAt]`.** Матчер
   выбирает ACTIVE-листинги, чьё `published_at` попадает в окно
   `(last_checked_at ?? created_at, runAt]`. Floor для первой проверки —
   `created_at` сохранённого поиска: не рассылаем алерты по всему бэклогу, только
   по появившимся с момента создания поиска. Окно полуоткрытое → листинг попадает
   ровно в одно окно (нет дублей, нет пропусков). `published_at` корректен,
   т.к. ставится один раз при первой публикации и не сбрасывается.

2. **Дедупликация = watermark + атомарная транзакция + optimistic-гард.** На
   каждый поиск: в одной транзакции (а) optimistic-продвижка `last_checked_at`
   (`updateMany WHERE id = … AND last_checked_at = <прочитанное>` — если
   конкурентный прогон уже сдвинул watermark, `count = 0`, откат, алерты не
   ставятся) и (б) постановка PENDING-уведомления на каждое совпадение. Watermark
   двигается ВСЕГДА (даже при нуле совпадений) — иначе окно растёт без границы.

3. **Один дайджест-email на поиск за прогон, best-effort.** Вместо письма на
   каждое объявление матчер ставит одно письмо «найдено новых объявлений: N» в
   `email_queue` (`EmailService.sendEmail`) ПОСЛЕ коммита транзакции. Постановка
   письма НЕ в транзакции (Redis нетранзакционен): источник истины — in-app
   уведомления и watermark; сбой постановки письма логируется, но не валит алерт
   и не плодит дубли (at-most-once email). Без email у владельца письмо
   пропускается, in-app-запись остаётся. In-app — по одному уведомлению
   `SAVED_SEARCH_NEW_LISTING` на объявление (гранулярность ленты TASK-100).

4. **Переиспользование `buildWhereSql` через публичный
   `SearchService.matchNewlyActiveListings`.** Метод вызывает тот же приватный
   билдер фильтров, что и `/search` (`status = 'ACTIVE'` уже включён), добавляет
   окно по `published_at` и возвращает `{ id, publishedAt }[]`, упорядоченные по
   `published_at ASC`, с лимитом. Гео-фильтры (radius/bounds/near-me) НЕ
   применяются: они привязаны к подвижной точке пользователя и в MVP не участвуют
   в saved-search алертах (ARCHITECTURE §16). `filters` берутся из `filters_json`
   толерантно к `schemaVersion`; `null`-значения отбрасываются (иначе условие
   `column = NULL` дало бы ноль совпадений).

5. **Структура продюсер / консьюмер / сервис** (как у промо и перевода):
   - `SavedSearchQueue` (продюсер, глобальный `QueuesModule`) — регистрирует
     repeatable-джобу `check_saved_searches` по cron `SAVED_SEARCH_ALERT_CRON`
     (дефолт `*/5 * * * *` — алерты не требуют минутной срочности промо).
   - `SavedSearchAlertService` (бизнес-логика, `SavedSearchesModule`) — sweep по
     активным поискам, до `SAVED_SEARCH_ALERT_BATCH_SIZE` за прогон, самые
     «протухшие» по `last_checked_at` — первыми; до `SAVED_SEARCH_ALERT_MAX_LISTINGS`
     алертов на один поиск за прогон.
   - `SavedSearchWorker` (консьюмер, `SavedSearchesModule`) — тонкий воркер
     `saved_search_queue`, делегирует `run()`. Concurrency
     `SAVED_SEARCH_ALERT_CONCURRENCY` (дефолт 1).

6. **Потолок алертов на один поиск + не-молчаливое усечение.** Широкий поиск
   ограничен `MAX_LISTINGS` (дефолт 50). При усечении watermark двигается не на
   `runAt`, а на `published_at` последнего обработанного совпадения — остаток
   подхватывает следующий прогон (без дублей и без потери алертов); факт усечения
   логируется `warn`.

## Consequences

Positive:
- Acceptance выполнены: только ACTIVE триггерят (структурно — `status = 'ACTIVE'`
  в `buildWhereSql`); дубли исключены (полуоткрытое окно + атомарный watermark);
  email ставится в `email_queue`; `last_checked_at` обновляется каждым прогоном.
- Переиспользован отлаженный BullMQ-паттерн и фильтр-билдер `/search` — никакого
  дублирования SQL и инфраструктурного кода.
- Дайджест вместо письма-на-объявление не спамит почтовый ящик.
- Чёткий путь масштабирования: reverse-matching (ARCHITECTURE §16) заменит
  polling без изменения API.

Negative / trade-offs:
- Polling-лаг: алерт приходит в пределах одного интервала cron (дефолт 5 минут).
  Приемлемо для MVP; reverse-matching убирает лаг.
- Гео-фильтры сохранённого поиска в алертах игнорируются (матч по скалярным
  фильтрам) — осознанное MVP-ограничение; гео saved searches редки и привязаны к
  подвижной точке.
- Email — at-most-once: при сбое постановки письма после коммита транзакции
  письмо теряется (in-app уведомление и watermark сохраняются). Выбор в пользу
  «лучше потерять письмо, чем продублировать».
- При усечении широкого поиска совпадения с одинаковым `published_at` на границе
  потолка могут быть пропущены (микросекундная коллизия timestamptz —
  практически невозможна); документировано.
- Воркер поднят в API-процессе (как перевод/промо/email); вынос в отдельный
  процесс — будущая операционная задача, вне скоупа.
- Уведомление `SAVED_SEARCH_NEW_LISTING` создаётся с каналом EMAIL; сводный
  notification-dispatch воркер (который читал бы PENDING-строки в `email_queue`)
  ещё не существует — поэтому матчер ставит письмо напрямую. При появлении такого
  воркера прямую постановку можно убрать.

## Related files

- apps/api/src/queues/queue.constants.ts (SAVED_SEARCH_QUEUE_NAME, CHECK_SAVED_SEARCHES_JOB, CheckSavedSearchesJobData)
- apps/api/src/queues/saved-search.queue.ts (+ spec)
- apps/api/src/queues/queues.module.ts, index.ts
- apps/api/src/saved-searches/saved-search-alert.service.ts (+ spec)
- apps/api/src/saved-searches/saved-search.worker.ts
- apps/api/src/saved-searches/saved-searches.module.ts, index.ts
- apps/api/src/search/search.service.ts (matchNewlyActiveListings, SavedSearchMatch), index.ts
- apps/api/src/notifications/notifications.service.ts (queueSavedSearchNewListing), index.ts
- apps/api/src/config/configuration.ts, env.validation.ts (savedSearch.* / SAVED_SEARCH_ALERT_*)
- .env.example, docs/ENV.md, docs/ARCHITECTURE.md §16/§17/§23

## Related task

- TASK-102
