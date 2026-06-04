# ADR-0036 — Notifications read endpoints: in-app feed, keyset pagination, read semantics

## Status

Accepted

## Date

2026-06-05

## Context

TASK-100 (milestone M10) добавляет хранение и чтение уведомлений: in-app лента
и отметки прочтения (acceptance: `GET /api/v1/notifications`,
`PATCH /api/v1/notifications/:id/read`, `PATCH /api/v1/notifications/read-all`,
пользователь видит только свои уведомления).

Инфраструктура частично существует: модель `Notification` (DB_SCHEMA §11) и
producer-сервис `NotificationsService.queuePromotionExpired` (TASK-123,
ADR-0035) уже заведены — промо-истечение ставит PENDING-строку. Не хватало
read-стороны (контроллер, лента, отметки прочтения) и регистрации модуля в
`AppModule` (раньше он импортировался только `PromotionsModule` как provider).

Открытые вопросы:

1. **HTTP-метод отметок прочтения.** Карточка TASK-100 пишет `PATCH`, а
   `API.md §14` — `POST /:id/read` и `POST /read-all` (→ `204`).
2. **Формат пагинации ленты.** `API.md §14` объявляет query `cursor` + `limit`
   и `meta` с `unread` — какой курсор и как считать `unread`.
3. **Семантика «прочитано».** Что меняется в строке и идемпотентна ли операция.
4. **Скоуп.** `API.md §14` помимо ленты описывает реестр устройств
   (`POST/DELETE /notifications/devices`, push-stub) — входит ли он в TASK-100.

## Decision

1. **`POST`, а не `PATCH` (API.md авторитетен).** Реализованы
   `POST /api/v1/notifications/:id/read` и `POST /api/v1/notifications/read-all`,
   оба → `204`. При расхождении формулировки маршрута карточка уступает `API.md`
   (тот же прецедент — ADR-0012: `auth/otp/request` вместо `request-otp`).
   Клиенты (web RTK Query, будущий Flutter) кодируются по `API.md`, поэтому
   контракт должен совпадать с ним, а не с карточкой. Функциональная суть
   acceptance («отметка прочтения работает») выполнена.

2. **Непрозрачный keyset-курсор `(created_at, id)` + глобальный `unread`.**
   Лента сортируется `created_at DESC, id DESC` с keyset-пагинацией
   (base64url-токен позиции), как `/favorites` (TASK-090) — единый паттерн,
   стабильный под вставками. Опциональные фильтры `status`/`type` сужают `data`
   и `total`. `unread` в `meta` — глобальный бейдж: `count(user_id, read_at IS
   NULL)` **независимо** от фильтров (иначе бейдж «непрочитанных» прыгал бы при
   переключении вкладок фильтра). Повреждённый `cursor` → `400 VALIDATION_ERROR`
   (не молчаливый сброс к первой странице).

3. **`read_at = now`, `status → READ`, идемпотентно.** Отметка прочтения пишет
   `status = READ` и `read_at = now()` — ровно как требует `API.md §14`.
   `read_at` — точный сигнал прочтения; `status=READ` перетирает доставочный
   статус (`SENT`/`PENDING`), что приемлемо для MVP-ленты (доставка трекается
   воркером отдельно). `markRead` идёт через `updateMany WHERE (id, user_id)`:
   `count = 0` → `404` (чужое/несуществующее не «течёт» существованием);
   повторная отметка уже прочитанного → `204` (идемпотентно). `markAllRead`
   обновляет только `read_at IS NULL` — не трогает уже прочитанные.

4. **Реестр устройств — вне скоупа TASK-100.** `POST/DELETE /notifications/
   devices` (push-stub, ADR-010) не входит в acceptance TASK-100 и относится к
   push-инфраструктуре. Чтобы PR оставался сфокусированным (CLAUDE.md §5 — один
   PR = одна задача, без unrelated-изменений), device-registration отложен в
   отдельную задачу. Лента отдаёт `IN_APP`/`EMAIL`-уведомления; `PUSH` от этого
   не зависит.

## Consequences

Positive:
- AC выполнены без миграций и новых enum'ов: переиспользуются модель
  `Notification`, существующий producer-сервис и keyset-паттерн `/favorites`.
- Контракт совпадает с `API.md §14` (метод/коды/формат `meta`), поэтому web и
  Flutter кодируются по одному источнику.
- Владение enforced на уровне запросов (`user_id`-scoping, `(id, user_id)` для
  отметки) — чужие уведомления недоступны и не утекают существованием.
- `NotificationsService` теперь и producer, и reader — единая точка для будущих
  доменов (чат TASK-111, saved-search alerts TASK-102).

Negative / trade-offs:
- `status=READ` перетирает доставочный статус строки; точная история доставки
  при необходимости должна жить в отдельном поле/журнале (не нужно для MVP).
- Метод отметок (`POST`) расходится с дословной формулировкой карточки
  (`PATCH`) — сознательно, в пользу `API.md`; зафиксировано здесь.
- Реестр push-устройств не реализован в этой задаче (отдельная задача).
- Уведомления реально не доставляются, пока email/push-воркер не подключён
  (TASK-101) — лента показывает уже поставленные строки; контракт стабилен заранее.

## Related files

- apps/api/src/notifications/notifications.controller.ts
- apps/api/src/notifications/notifications.service.ts (+ spec)
- apps/api/src/notifications/dto/list-notifications.dto.ts
- apps/api/src/notifications/notifications.module.ts (+ RolesModule, controller)
- apps/api/src/notifications/index.ts
- apps/api/src/app.module.ts (регистрация NotificationsModule)
- docs/API.md §14 (контракт — подтверждение, не изменение)

## Related task

- TASK-100
