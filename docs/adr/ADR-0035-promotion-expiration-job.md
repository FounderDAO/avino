# ADR-0035 — Promotion expiration job: scheduled sweep, system-initiated expiry, search independence

## Status

Accepted

## Date

2026-06-05

## Context

TASK-123 (milestone M12) добавляет фоновую задачу истечения промо VIP/TOP
(acceptance: `promotion_queue` exists, `expire_listing_promotions` job exists,
истёкшая промо → `EXPIRED`, read-cache листинга → `NORMAL`, ставится
notification, поиск трактует истёкшую промо как `NORMAL` даже если джоба
задержана).

Промо-модель зафиксирована (ADR-0004, DB_SCHEMA §8): ledger `listing_promotions`
— источник истины, `listings.promotion_*` — read-cache. Поиск (TASK-081,
ADR-0027) уже **time-guard'ит** тир в SQL: `promotion_expires_at > now()` в
`TIER_RANK_SQL` и в `effectiveTier()` карточки. То есть корректность выдачи уже
не зависит от джобы — истёкшая промо ранжируется и отображается как `NORMAL`
немедленно. BullMQ-инфраструктура заведена для перевода (TASK-071, ADR-0025):
продюсеры в глобальном `QueuesModule`, консьюмеры — в доменных модулях.

Открытые вопросы этой задачи:

1. **Триггер джобы.** Точечная джоба на промо (как перевод) или периодический
   sweep по расписанию.
2. **Гонка с админ-действиями и ре-активацией.** Как не затереть свежую
   активацию, успевшую обновить read-cache между выборкой и транзакцией; как
   сделать флип статуса идемпотентным.
3. **Логирование системного истечения.** Писать ли `promotion_logs` (как
   делают admin cancel/extend, ADR-0034).
4. **Notification.** Что значит «notification job is queued» в Avino.

## Decision

1. **Repeatable sweep, не точечная джоба.** `PromotionQueue` (глобальный
   `QueuesModule`) на старте регистрирует repeatable job
   `expire_listing_promotions` через `upsertJobScheduler` с cron из
   `PROMOTION_EXPIRY_CRON` (дефолт `* * * * *`). `upsert` идемпотентен — рестарт
   процесса не плодит расписаний. Консьюмер `PromotionWorker` (в
   `PromotionsModule`) делегирует sweep `PromotionExpiryService.run()`, который
   выбирает все `ACTIVE`-промо с `expires_at <= now()` (батч
   `PROMOTION_EXPIRY_BATCH_SIZE`). Точечный enqueue по `expires_at` сложнее
   (требует отложенных джоб на каждую активацию/продление и их отмены при
   cancel); периодический sweep проще и устойчивее к рассинхрону.

2. **Условный флип + гард read-cache по времени.** Каждая промо истекается в
   своей транзакции: `updateMany WHERE id = X AND status = ACTIVE → EXPIRED`.
   Если `count = 0` (промо уже перехватило конкурентное cancel/extend/повторный
   sweep) — строка пропускается, уведомление и аудит не пишутся (идемпотентность).
   Сброс read-cache — `updateMany WHERE id = listing AND promotion_expires_at <=
   now()`: свежая ре-активация имеет `expires_at` в будущем и под гард не
   попадает, поэтому её кэш не затирается.

3. **Только `audit_logs`, без `promotion_logs`.** `promotion_logs` — аудит
   *админских* действий (его enum `PromotionAdminAction` не содержит `EXPIRE`, а
   `admin_id` подразумевается). Истечение инициирует система, поэтому пишем
   запись в cross-cutting `audit_logs` с `actor_id = null` (= система, ADR-0004),
   `action = 'LISTING_PROMOTION_EXPIRE'`. Это не требует миграции/нового
   enum-значения и семантически корректнее, чем мнимое «админское» действие.

4. **Notification = PENDING-строка `notifications`.** В Avino «поставить
   уведомление в очередь» означает создать строку `notifications` со `status =
   PENDING` (DB_SCHEMA §11; так же делает `ModerationService`); отдельный воркер
   отправит EMAIL/PUSH позже. Вводится `NotificationsService.queuePromotionExpired`
   (новый `NotificationsModule`), который создаёт строку
   `PROMOTION_EXPIRED / EMAIL / PENDING` в той же транзакции, что и истечение —
   атомарно с флипом статуса.

5. **Поиск не зависит от джобы (подтверждение, не изменение).** AC «search still
   treats expired promotion as NORMAL even if job is delayed» уже обеспечен
   time-guard'ом в SQL/`effectiveTier` (ADR-0027) и покрыт тестом
   `search.service.spec.ts`. Джоба — это eventual-consistency cleanup
   (ledger + read-cache + notification), а не источник истины ранжирования.

## Consequences

Positive:
- AC выполнены без новых таблиц, миграций и enum-значений: переиспользуются
  ledger, read-cache, существующие enum'ы (`PromotionStatus.EXPIRED`,
  `NotificationType.PROMOTION_EXPIRED`) и BullMQ-паттерн перевода.
- Корректность поиска гарантирована независимо от лага/простоя воркера —
  безопасно к задержкам и даунтайму очереди.
- Идемпотентность и гонко-устойчивость: условный флип + гард read-cache по
  времени не конфликтуют с admin cancel/extend и параллельными sweep'ами.
- Новый `NotificationsService` — единая точка постановки уведомлений для будущих
  доменов (модерация/чат/saved searches смогут мигрировать на него).

Negative / trade-offs:
- Periodic sweep даёт задержку до одного cron-интервала между фактическим
  `expires_at` и переходом ledger в `EXPIRED` (для выдачи неважно — там
  time-guard; для аудита/уведомления приемлемо). Минимизируется частотой cron.
- Воркер поднят в API-процессе (MVP, как перевод); вынос в отдельный процесс —
  будущая операционная задача, не входит в скоуп.
- `promotion_logs` не содержит записи об истечении (только `audit_logs`).
  Сознательно: доменный журнал зарезервирован под админ-действия. При желании
  отдельной доменной строки потребуется новое enum-значение и миграция.
- Уведомление об истечении пишется PENDING и реально не доставляется, пока
  email/push-воркер не подключён (как и у модерации) — контракт стабилен заранее.

## Related files

- apps/api/src/queues/queue.constants.ts (PROMOTION_QUEUE_NAME, EXPIRE_LISTING_PROMOTIONS_JOB)
- apps/api/src/queues/promotion.queue.ts (+ spec)
- apps/api/src/queues/queues.module.ts
- apps/api/src/promotions/promotion-expiry.service.ts (+ spec)
- apps/api/src/promotions/promotion.worker.ts
- apps/api/src/promotions/promotions.module.ts
- apps/api/src/notifications/notifications.service.ts (+ spec), notifications.module.ts
- apps/api/src/config/configuration.ts, env.validation.ts (promotion.* / PROMOTION_EXPIRY_*)
- apps/api/src/search/search.service.ts (time-guard — подтверждение, не изменение)
- docs/ENV.md / .env.example, docs/ARCHITECTURE.md §23

## Related task

- TASK-123
