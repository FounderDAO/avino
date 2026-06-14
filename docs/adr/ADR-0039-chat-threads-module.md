# ADR-0039 — Chat threads module: idempotent initiator/owner threads with keyset list

## Status

Accepted

## Date

2026-06-05 (updated 2026-06-14 — `counterparty` / `last_message` list extension)

## Context

TASK-110 (milestone M11) добавляет внутренний чат — треды (API.md §13,
CLAUDE.md §10, DB_SCHEMA.md §10):

- `POST /api/v1/chat/threads` — создать/получить тред с создателем листинга;
- `GET /api/v1/chat/threads` — треды текущего пользователя.

Схема уже готова: модели `ChatThread`
(`UNIQUE (listing_id, initiator_id, owner_id)`, индексы по
`listing_id`/`initiator_id`/`owner_id`/`last_message_at`, все FK
`ON DELETE CASCADE`) и `ChatMessage` (`thread_id` CASCADE, `sender_id`
`ON DELETE SET NULL`) уже в схеме Prisma и созданы миграцией. Код ошибки
`LISTING_NOT_AVAILABLE` (422) уже есть в каталоге (`ApiErrorCode`, API.md §17),
но до этой задачи нигде не использовался. Эта задача — application-слой поверх
существующей схемы; новых миграций нет.

Привязка чата (ADR-0003 / ARCHITECTURE §18): поля — **`initiator_id` /
`owner_id`**, НЕ `buyer/seller` (листинг может быть SALE или RENT). Тред
уникален по `(listing_id, initiator_id, owner_id)`: один тред на пару +
объявление. MVP — polling (DB_SCHEMA.md §10): WebSocket добавляется позже без
изменения схемы.

Границы M11: TASK-110 — только треды (создание + список). Сообщения
(`GET/POST /chat/threads/:id/messages`, read-status) и уведомление
`NEW_CHAT_MESSAGE` — TASK-111 (зависит от TASK-110 и TASK-100). API.md §13
документирует у `POST /chat/threads` необязательное тело `body` (текст первого
сообщения).

## Decision

1. **Модуль/маршруты (API versioning, CLAUDE.md §14).** Новый `ChatModule` с
   `ChatController` (`@Controller({ path: 'chat', version: '1' })`,
   `/api/v1/chat/threads`). Весь контроллер под `JwtAuthGuard` (класс-уровень) —
   `GUEST` без Bearer → `401` (acceptance «Guest cannot create thread»; API.md
   §13). `RolesGuard` не нужен: чат доступен любому аутентифицированному
   пользователю.

2. **Создание — идемпотентно по unique-ключу.** `POST /chat/threads` выводит
   `owner_id` из `listing.owner_id`, `initiator_id` = текущий пользователь.
   Порядок проверок: листинг не найден → `404 NOT_FOUND`; листинг не `ACTIVE`
   (включая `DELETED`) → `422 LISTING_NOT_AVAILABLE` (acceptance «Deleted listing
   cannot start new thread»); `owner_id == initiator` → `403 FORBIDDEN` (нельзя
   писать самому себе). Затем `findUnique` по составному ключу
   `listingId_initiatorId_ownerId`: если тред есть — возврат с `200`; иначе
   `create` с `201`. Гонка параллельных `POST` ловится по `P2002` → перечитываем
   и возвращаем существующий тред (`200`). Так «Duplicate thread is prevented»
   выполняется и логически, и атомарно на уровне БД.

3. **Только публичные листинги стартуют тред.** Новый тред разрешён лишь на
   `ACTIVE`-листинге — единственном публично видимом статусе (см. видимость в
   `ListingsService.findOne`: непубличные статусы видны только владельцу/админу).
   Непубличный/`DELETED` листинг → `422 LISTING_NOT_AVAILABLE`. Существующие
   треды это правило не затрагивает: переписку видно и после снятия объявления.

4. **Список — keyset по последней активности.** `GET /chat/threads` отдаёт треды,
   где пользователь — `initiator` ИЛИ `owner` (`OR`-фильтр), сортировка
   `last_message_at DESC NULLS LAST, created_at DESC, id DESC`. Keyset-курсор —
   `{ last_message_at, created_at, id }` (base64url JSON) с двухветочным
   предикатом: курсор в секции с `last_message_at` либо в NULL-хвосте (треды без
   сообщений). В TASK-110 сообщений ещё нет, поэтому `last_message_at` у всех
   тредов `NULL` и порядок фактически по `created_at DESC` — корректно сейчас и
   совместимо с TASK-111, где активные треды поднимутся наверх. Повреждённый
   курсор → `400 VALIDATION_ERROR` (как в `/search`, `/favorites`). К
   `{ limit, total }` из API.md §13 добавлен `next_cursor` (non-breaking, §4).

5. **`unread_count` и `listing_preview`.** `unread_count` — `chatMessage.groupBy`
   по `threadId` с `is_read = false AND sender_id != currentUser` (одним запросом
   на страницу, без N+1); в TASK-110 даёт `0` для всех (сообщений нет), логика
   готова заранее. `listing_preview` (title/thumbnail_url/price/currency/status) —
   подмножество карточки `/search`: гидратация делегируется
   `SearchService.cardsByIds` (язык перевода + cover-медиа не дублируются, как в
   favorites — ADR-0030). `DELETED`-листинг в превью не вырезается (переписка
   остаётся видимой; `status` отражает текущее состояние). `ChatModule`
   импортирует `SearchModule` ради `cardsByIds`.

   **Расширение (2026-06-14, доделка чата).** Элемент списка дополнен optional
   non-breaking-полями (§14), чтобы список выглядел как мессенджер: `counterparty`
   (профиль второго участника — `id`, `name` = `display_name` → «first last» →
   `null`, `avatar_url`) и `last_message` (превью свежайшей реплики треда: `id`,
   `sender_id`, `body`, `is_read`, `created_at`). Профили — одним `user.findMany`
   на страницу; последние реплики — одним `chatMessage.findMany` с
   `distinct(['threadId'])` (порядок `threadId, created_at DESC, id DESC`, индекс
   `chat_messages_thread_id_created_at_idx`), без N+1 и без миграции. Клиент
   (`apps/client`) толерантен к отсутствию полей (старый бэк) — фолбэк на
   заголовок/цену объявления.

6. **`body` принимается, но не персистится (граница TASK-110/111).** DTO
   `CreateThreadDto` объявляет `body?` (опционально, 1..5000), чтобы глобальный
   `ValidationPipe` (`forbidNonWhitelisted`) не возвращал `400` на
   задокументированное в API.md §13 поле. Персистенция первого сообщения и
   уведомление `NEW_CHAT_MESSAGE` — TASK-111: смешивать message-логику в тред-PR
   нельзя (CLAUDE.md §5). В TASK-110 `body` игнорируется; тред создаётся пустым.

## Consequences

Positive:

- Полный thread-flow (создание + список) поверх существующей схемы — без миграций.
- Идемпотентность атомарна (unique-индекс/`P2002`), без гонки `findFirst`+`create`.
- `listing_preview` идентичен карточке `/search` (§9): единый формат для web (RTK
  Query) и будущего Flutter-клиента; язык/медиа не переписаны заново.
- `unread_count` через `groupBy` — без N+1; готов к TASK-111 без изменений.
- Привязка `initiator_id/owner_id` нейтральна к SALE/RENT (ADR-0003).
- `counterparty`/`last_message` (расширение 2026-06-14) дают мессенджер-вид списка
  (имя собеседника + превью реплики) без миграции и без N+1; non-breaking (§14),
  старые клиенты не ломаются (поля optional).

Negative / trade-offs:

- `ChatModule → SearchModule` — направленная связь ради `cardsByIds` (как
  favorites→search); цикла нет.
- `body` в `POST /chat/threads` в TASK-110 принимается, но молча не сохраняется до
  TASK-111 — задокументированный временный разрыв ради совместимости контракта.
- Покрытие — юнит-тесты (Prisma/SearchService мокаются), как у favorites; live-
  PostgreSQL int-spec для чата не добавлялся (keyset/nulls и обе ветки курсора
  проверены на моках; отдельные int-тесты — backlog при необходимости).
- `200` vs `201` различается через `@Res({ passthrough: true })` — единственное
  место в API, где статус выставляется императивно (идемпотентный POST требует
  динамики, недостижимой статичным `@HttpCode`).

## Related files

- apps/api/src/chat/chat.controller.ts
- apps/api/src/chat/chat.service.ts
- apps/api/src/chat/chat.module.ts
- apps/api/src/chat/chat.service.spec.ts
- apps/api/src/chat/dto/create-thread.dto.ts
- apps/api/src/chat/dto/list-threads.dto.ts
- apps/api/src/chat/index.ts
- apps/api/src/app.module.ts
- docs/API.md (§13)

## Related task

- TASK-110

## Related ADR

- ADR-0003 (chat binding initiator/owner, SALE/RENT — поля треда)
- ADR-0030 (favorites — переиспользование `SearchService.cardsByIds`)
- ADR-0026/0027 (public search keyset + §9 card — reused via `cardsByIds`)
- ADR-0016 (RBAC guards — `JwtAuthGuard` gates GUEST)
- ADR-0007 (unified error envelope — `LISTING_NOT_AVAILABLE`/`NOT_FOUND`/`FORBIDDEN`)
