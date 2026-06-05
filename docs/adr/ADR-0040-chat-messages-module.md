# ADR-0040 — Chat messages: send/list/read with NEW_CHAT_MESSAGE notification

## Status

Accepted

## Date

2026-06-05

## Context

TASK-111 (milestone M11) достраивает внутренний чат — сообщения поверх тредов
(TASK-110, ADR-0039). API.md §13 / DB_SCHEMA.md §10 / ARCHITECTURE §18:

- `GET /api/v1/chat/threads/:id/messages` — сообщения треда;
- `POST /api/v1/chat/threads/:id/messages` — отправить сообщение;
- `POST /api/v1/chat/threads/:id/read` — отметить входящие прочитанными.

Зависит от TASK-110 (треды, `ChatService`/`ChatController` уже есть) и TASK-100
(`NotificationsService`, in-app лента). Схема готова с ADR-0039: модель
`ChatMessage` (`thread_id` `ON DELETE CASCADE`, `sender_id` `ON DELETE SET NULL`,
`is_read` default false, индекс `(thread_id, created_at)`) уже в Prisma и создана
миграцией. Это application-слой поверх существующей схемы — **новых миграций
нет**. `unread_count` тредов (ADR-0039 §5) уже вычисляется через
`chatMessage.groupBy` и до этой задачи всегда возвращал `0` (сообщений не было) —
теперь заработает с реальными данными без изменений.

Расхождение карточки и контракта: TASK-111 в `docs/TASKS.md` пишет
`GET /chat/threads/:id` и `PATCH /chat/threads/:id/read`, но **API.md
авторитетен по формулировке маршрутов** (как зафиксировано в ADR-0036 для
`/notifications`). Берём маршруты из API.md §13:
`GET …/:id/messages`, `POST …/:id/messages`, `POST …/:id/read`. Отметка
прочтения — `POST` (а не `PATCH`), консистентно с `/notifications` (ADR-0036).

## Decision

1. **Маршруты на существующем `ChatController`.** Три метода добавлены в
   `ChatController` (`@Controller({ path: 'chat', version: '1' })`, под
   `JwtAuthGuard` класс-уровня — `GUEST` → `401`). `:id` валидируется
   `ParseUUIDPipe`. `POST …/read` → `@HttpCode(204)` (тело не возвращается).

2. **Контроль доступа: участник vs модератор.** Участник треда =
   `initiator_id == user` ИЛИ `owner_id == user`.
   - `GET …/messages`: участник **ИЛИ** `MODERATOR`/`ADMIN` (complaint/support-
     flow — ARCHITECTURE §18, API.md §13).
   - `POST …/messages` и `POST …/read`: **только участник**. Модератор читает для
     разбора жалоб, но не пишет и не отмекает прочтение от чужого имени.
   Порядок: тред не найден → `404 NOT_FOUND`; найден, но доступа нет →
   `403 FORBIDDEN`. `404` до `403` сознательно: случайный/несуществующий UUID не
   должен давать `403` (который подтвердил бы существование). Среди существующих
   тредов не-участник видит `403` (API.md §13 явно перечисляет `403 FORBIDDEN`).

3. **Отправка: `sender_id` из токена, не из тела.** `SendMessageDto` принимает
   только `body` (1..5000). `sender_id` всегда = текущий пользователь (Bearer) —
   слать от чужого имени нельзя. Сообщение, сдвиг `last_message_at` треда и
   постановка уведомления — в одной `prisma.$transaction` (атомарность
   сообщение↔активность↔уведомление; частичных состояний нет).

4. **`last_message_at` двигается в той же транзакции.** `created.createdAt`
   сообщения пишется в `chat_threads.last_message_at`. Это активирует порядок
   списка тредов из ADR-0039 (`last_message_at DESC NULLS LAST`): треды с
   перепиской поднимаются наверх. Из NULL-хвоста (треды без сообщений) тред
   переходит в активную секцию первым же сообщением.

5. **Слать можно везде, кроме `DELETED`; стартовать тред — только на `ACTIVE`.**
   Создание треда (ADR-0039 §3) требует `ACTIVE`. Но в **существующем** треде
   правило мягче: блокируем отправку только при `listing.status == DELETED` →
   `422 LISTING_NOT_AVAILABLE`. Объявление, ушедшее в `SOLD`/`RENTED`/`ARCHIVED`,
   не должно обрывать живой диалог («ещё актуально?» → «продано»). Это
   согласовано с ADR-0039 (превью `DELETED`-листинга не вырезается — переписку
   видно после снятия); `DELETED` — единственное «удалённое» состояние, где новые
   сообщения запрещены. `GET …/messages` и `POST …/read` статус листинга не
   проверяют: историю читают и помечают прочтённой при любом статусе.

6. **`NEW_CHAT_MESSAGE` — IN_APP, второму участнику.** Получатель — участник, не
   являющийся отправителем (`initiator → owner` и наоборот). Producer-паттерн как
   у промо/saved-search (ADR-0036/0038): новый
   `NotificationsService.queueChatMessage(tx, recipientId, …)` ставит
   **PENDING-строку** `notifications` в транзакции отправки; синхронной доставки
   в обработчике нет. Канал — **`IN_APP`** (не `EMAIL`): чат — это in-app
   уведомление (бейдж/лента TASK-100), а не email-дайджест; DB_SCHEMA §11
   гарантирует надёжную доставку `EMAIL + IN_APP` в MVP, PUSH-транспорт (FCM/APNs)
   подключится с регистрацией устройств (стаб `notification_devices`).
   `data_json` — `{ thread_id, listing_id, message_id, sender_id }` (snake_case,
   как у прочих producer'ов) для дип-линка клиента. `ChatModule` импортирует
   `NotificationsModule`.

7. **Список сообщений — keyset `created_at DESC, id DESC`.** Свежие сверху,
   `next_cursor` листает в историю — тот же предикат, что у `/notifications`
   (ADR-0036). В отличие от списка тредов, `total` не отдаётся (бесконечный скролл
   истории не требует счётчика): `meta = { limit, next_cursor }` (API.md §13).
   Polling новых сообщений (TASK-156) — перезапрос первой страницы. `limit`
   default 20 / max 100 (API.md §4). Повреждённый курсор → `400 VALIDATION_ERROR`.
   `GET` **не** помечает сообщения прочитанными — это отдельный `POST …/read`.

8. **`read` — только входящие.** `POST …/read` делает `updateMany` по
   `thread_id = :id AND sender_id != currentUser AND is_read = false → is_read =
   true`. Свои сообщения не трогаются; идемпотентно (повторный вызов меняет 0
   строк). Это ровно та выборка, что считает `unread_count` (ADR-0039 §5), —
   отметка обнуляет бейдж треда.

## Consequences

Positive:

- Полный message-flow (отправка/список/прочтение) поверх существующей схемы — без
  миграций; `unread_count` ADR-0039 заработал с реальными данными без изменений.
- Транзакция сообщение+`last_message_at`+уведомление атомарна: список тредов и
  лента уведомлений согласованы, частичных состояний нет.
- Уведомление через тот же producer-паттерн (PENDING-строка в tx) — единообразно
  с промо/saved-search; доставку подключит общий воркер.
- Доступ модератора только на чтение покрывает complaint-flow, не давая писать от
  чужого имени.
- `POST …/read` обнуляет ровно тот срез, что формирует `unread_count` — бейджи
  консистентны между списком тредов и отметкой прочтения.

Negative / trade-offs:

- `ChatModule → NotificationsModule` — ещё одна направленная связь (как
  `→ SearchModule`); цикла нет.
- Проверки доступа/статуса листинга идут до транзакции — узкое TOCTOU-окно
  (листинг успел стать `DELETED` между проверкой и `create`). Для MVP-чата
  приемлемо; жёсткой гарантии не требуется.
- `body` в `POST /chat/threads` (первое сообщение, ADR-0039 §6) по-прежнему
  принимается, но не персистится: первое сообщение шлётся отдельным
  `POST …/:id/messages`. Чтобы не ломать идемпотентность `POST /threads`
  (`200`/`201`), persist-on-create отложен; пересмотр — при запросе продукта.
- Канал `NEW_CHAT_MESSAGE` зафиксирован как `IN_APP` (не PUSH) до интеграции
  push-провайдера; in-app лента — единственный гарантированный канал доставки
  чат-уведомлений в MVP.
- Покрытие — юнит-тесты (Prisma/Search/Notifications мокаются), как у тредов;
  отдельный live-PostgreSQL int-spec для сообщений не добавлялся.

## Related files

- apps/api/src/chat/chat.controller.ts
- apps/api/src/chat/chat.service.ts
- apps/api/src/chat/chat.service.spec.ts
- apps/api/src/chat/chat.module.ts
- apps/api/src/chat/dto/send-message.dto.ts
- apps/api/src/chat/dto/list-messages.dto.ts
- apps/api/src/chat/index.ts
- apps/api/src/notifications/notifications.service.ts
- apps/api/src/notifications/notifications.service.spec.ts
- apps/api/src/notifications/index.ts
- docs/API.md (§13)

## Related task

- TASK-111

## Related ADR

- ADR-0039 (chat threads — модуль/маршруты/keyset/`unread_count`, на которые надстроено)
- ADR-0036 (notifications read endpoints — `POST` для read, API.md-авторитетность маршрутов, keyset)
- ADR-0038 (saved-search alert — producer-паттерн `queue*` в транзакции)
- ADR-0003 (chat binding initiator/owner, SALE/RENT)
- ADR-0016 (RBAC guards — `JwtAuthGuard`; роли MODERATOR/ADMIN)
- ADR-0007 (unified error envelope — `LISTING_NOT_AVAILABLE`/`NOT_FOUND`/`FORBIDDEN`)
