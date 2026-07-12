# Real-time доставка через WebSocket (chat + notifications + tours)

**Дата:** 2026-07-08
**Статус:** Design (одобрен, ожидает implementation-план)
**Автор:** Claude + Tommy

## Проблема

Сейчас «живость» внутри клиента (`apps/client`) держится на REST-поллинге через RTK
Query, сведённом в хук `useUnreadCounts` (`apps/client/src/store/useUnreadCounts.ts`):

| Что | Где | Интервал |
|-----|-----|----------|
| Бейджи в шапке (msg + notif + tours) | `Header.tsx:101` | 20 с |
| Список тредов инбокса | `Inbox.tsx:164` | 10 с |
| Сообщения в открытом треде | `Inbox.tsx:180` | 6 с |

WebSocket в проекте отсутствует — единственное упоминание это комментарий-заглушка
в `apps/api/src/chat/chat.service.ts`: «MVP — polling, WebSocket добавляется позже
без изменения [контракта]». Задача — реализовать этот задел: перевести доставку на
push, не ломая REST-контракт.

## Цели

- Мгновенная доставка новых сообщений, уведомлений и обновлений туров (вместо задержки
  6–20 с поллинга).
- REST-эндпоинты и их DTO-сериализация остаются источником истины — контракт API не
  меняется.
- Надёжность: пропущенный за разрыв соединения ивент самозалечивается.

## Не-цели (YAGNI)

Presence/«онлайн», typing-индикаторы, реалтайм read-receipts, WebSocket-доставка для
админки (`apps/web`), замена FCM device push. Только инвалидация трёх клиентских
подсистем в `apps/client`.

## Зафиксированные решения

1. **Охват:** все три подсистемы — chat + notifications + tours.
2. **Транспорт:** socket.io + NestJS Gateway (не голый `ws`, не SSE).
   - SSE отпадает: `EventSource` не умеет ставить `Authorization`-заголовок, а токен у
     нас Bearer в redux (не cookie) — пришлось бы класть токен в query-string (течёт в
     логи Caddy) или переезжать на cookie-auth. socket.io передаёт токен в
     `handshake.auth` payload — чисто.
   - socket.io даёт из коробки reconnect, fallback-транспорт и redis-adapter поверх уже
     стоящего `ioredis`.
3. **Payload:** тонкие инвалидации. Сокет шлёт лёгкий сигнал, клиент дёргает
   `invalidateTags` → штатный REST-рефетч. Gateway не дублирует DTO-shaping.
4. **Поллинг:** остаётся как медленный (~60 с) safety-net, пока сокет жив.

## Что уже играет в пользу решения

| Фактор | Состояние | Значение |
|--------|-----------|----------|
| Redis | `ioredis` + `bullmq` уже в `apps/api/package.json` | Готовый socket.io-redis-adapter — новую инфру не тащим |
| Reverse-proxy | Caddy 2.8 (`docker-compose.prod.yml`) | WebSocket проксируется zero-config |
| Auth | JWT-гвард (`apps/api/src/common/guards/jwt-auth.guard.ts`), токен в redux + single-flight refresh (`baseQuery.ts`) | Переиспользуем `JwtService`; auth через `handshake.auth` |
| Точки эмита | `chat.service.createMessage` (стр. 417), `NotificationsService` dispatch, `TourRequestsService` create/status | 3 места «пнуть» сокет |
| Клиент | RTK Query, 3 эндпоинта в `useUnreadCounts` | Штатный `invalidateTags` — чистая интеграция без слома контракта |

## Архитектура

Одна `RealtimeGateway` (socket.io, namespace `/rt`) рядом с существующим Express-
приложением NestJS. Каждый аутентифицированный клиент джойнит персональную комнату
`user:<id>`. Доменные сервисы после успешной записи в БД публикуют **тонкий сигнал
инвалидации** в комнату получателя. Клиент по сигналу дёргает `invalidateTags` в RTK
Query → штатный REST-рефетч. Поллинг деградирует до 60 с, пока сокет жив.

Ключевой инвариант: **REST-контракт не меняется** — сокет только «звонок будильника»,
данные приходят через существующие эндпоинты.

### Payload-контракт

```ts
type RealtimeInvalidation = {
  type: 'thread' | 'thread_list' | 'notification' | 'tour';
  id?: string;
};
```

Компактный, версионируемый. `id` присутствует для точечной инвалидации (напр. конкретный
тред), отсутствует для списочной (`thread_list`).

## Backend-компоненты

- **`RealtimeModule`** — новый модуль: `@nestjs/platform-socket.io` + gateway. Импортирует
  auth (для `JwtService`) и регистрирует Redis-адаптер.
- **`RealtimeGateway`** — namespace `/rt`. При подключении `WsJwtGuard` валидирует
  `handshake.auth.token`, джойнит сокет в `user:<userId>`. Публичный метод
  `emitInvalidation(userId: string, payload: RealtimeInvalidation)`.
- **`WsJwtGuard`** — WS-аналог `jwt-auth.guard.ts`; парсит токен из handshake,
  переиспользует существующий `JwtService`. При протухшем/отсутствующем токене — дисконнект
  с кодом, чтобы клиент переподключился после ротации.
- **Redis-адаптер** — `@socket.io/redis-adapter` поверх существующего `ioredis`. Кросс-
  инстанс emit (эмит из HTTP-воркера долетает до сокета на другом инстансе) + запас на
  горизонтальное масштабирование.
- **Точки эмита (3)** — внутри существующих сервисов, после commit; никакой доменной
  логики в gateway:
  - `ChatService.createMessage` → обоим участникам треда:
    `{type:'thread', id: threadId}` + `{type:'thread_list'}`.
  - `NotificationsService` dispatch → получателю: `{type:'notification'}`.
  - `TourRequestsService` create / status-change → затронутой стороне: `{type:'tour'}`.

## Frontend-компоненты

- **`socketClient` (singleton)** — обёртка над `socket.io-client`: `connect(token)` при
  появлении auth, `disconnect()` при logout. Встраивается в single-flight refresh-mutex в
  `baseQuery.ts`: после ротации токена — переустановка соединения с новым токеном.
- **`useRealtimeBridge`** — вызывается один раз в layout (как сейчас Header). Подписывается
  на события сокета и мапит `type` → `dispatch(api.util.invalidateTags([...]))` для
  `chatApi` / `notificationsApi` / `tourRequestsApi`. Инвариант `computeUnreadCounts`
  сохраняется: рефетч обновляет полные списки, счётчик пересчитывается сам.
- **Деградация поллинга** — `useUnreadCounts` и `Inbox` берут `pollingInterval` из
  состояния «сокет жив»: живой → 60000, мёртвый → текущие значения (20000 / 10000 / 6000).
  Один флаг `socketConnected` в сторе.

## Обработка ошибок и жизненный цикл

- **Реконнект** — socket.io авто-реконнект; при событии `reconnect` клиент инвалидирует
  все три тега (gap-fill), чтобы пропущенные за разрыв ивенты подтянулись.
- **Ротация токена** — дисконнект по протухшему токену → refresh-mutex обновляет токен →
  реконнект с новым. Fallback-поллинг на 60 с прикрывает окно.
- **Скрытая вкладка** — зеркалим текущий `skipPollingIfUnfocused`: на
  `visibilitychange=hidden` — дисконнект (не держим idle-соединения), на возврат —
  реконнект + gap-fill инвалидация.
- **Мобилка** — FCM device push (`apps/api/src/notifications/dto/register-device.dto.ts`)
  остаётся каналом для мобильных/бэкграунд-уведомлений; WebSocket — только web-foreground.

## Тестирование

**Backend** (стиль существующих `*.service.spec.ts`):
- `WsJwtGuard` — валидный / протухший / отсутствующий токен.
- Эмит в 3 доменных сервисах — мокнутый gateway, проверка вызова `emitInvalidation` с
  правильной комнатой (`user:<id>`) и payload.

**Frontend** (Vitest + RTL harness уже есть):
- `useRealtimeBridge` мапит событие → правильный `invalidateTags`.
- Деградация `pollingInterval` по флагу `socketConnected`.
- Реконнект → полная инвалидация трёх тегов.

## Инфраструктура

- Caddy проксирует WebSocket zero-config — правки конфига не нужны.
- Новый env `NEXT_PUBLIC_WS_URL` (в проде = тот же хост, namespace `/rt`).
- **Prod-TODO (вне охвата первой итерации):** sticky-sessions при масштабировании api
  >1 реплики. Сейчас один инстанс; Redis-адаптер снимает часть проблемы, но socket.io на
  нескольких инстансах требует либо sticky, либо websocket-only транспорт.

## Затронутые файлы (ориентир)

**Новые (api):** `apps/api/src/realtime/realtime.module.ts`,
`realtime.gateway.ts`, `ws-jwt.guard.ts`, спеки.
**Правки (api):** `chat.service.ts`, `notifications.service.ts` (dispatch),
`tour-requests.service.ts`, `app.module.ts`, `main.ts` (WS-адаптер), `package.json`.
**Новые (client):** `store/socketClient.ts`, `store/useRealtimeBridge.ts`, флаг
`socketConnected` в сторе, спеки.
**Правки (client):** `baseQuery.ts` (реконнект при ротации), `useUnreadCounts.ts`,
`Inbox.tsx`, layout (монтирование bridge), `package.json` (`socket.io-client`).
