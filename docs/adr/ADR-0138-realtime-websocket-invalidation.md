# ADR-0138 — Real-time доставка через WebSocket: тонкие инвалидации поверх socket.io

## Status

Accepted

## Date

2026-07-12

## Context

«Живость» клиента (`apps/client`) держалась на REST-поллинге RTK Query: бейджи шапки — 20 с,
список тредов — 10 с, открытый тред — 6 с. Задержка доставки сообщений/уведомлений/туров
6–20 с; заглушка в `chat.service.ts` обещала «WebSocket добавляется позже без изменения
контракта». Спека и план: `docs/superpowers/specs/2026-07-08-realtime-websocket-delivery-design.md`,
`docs/superpowers/plans/2026-07-08-realtime-websocket-delivery.md`.

## Decision

1. **Транспорт** — socket.io + NestJS Gateway (`@nestjs/websockets` + `@nestjs/platform-socket.io`,
   пины `^10` под Nest 10), namespace `/rt`. Не SSE (EventSource не умеет Authorization-заголовок,
   Bearer-токен в redux) и не голый `ws` (нужны reconnect/fallback/redis-adapter из коробки).
2. **Auth на этапе connection** — `WsAuthenticator` верифицирует `handshake.auth.token` тем же
   секретом (`jwt.accessSecret`) и схемой, что `JwtAuthGuard`; невалидный токен → disconnect.
   Nest ws-guards не перехватывают lifecycle подключения, поэтому проверка в `handleConnection`.
3. **Комнаты** — каждый сокет джойнит персональную `user:<userId>`.
4. **Payload — тонкая инвалидация**, не данные:
   `{ type: 'thread' | 'thread_list' | 'notification' | 'tour'; id?: string }`, событие
   `'invalidate'`. Клиент по сигналу дёргает RTK `invalidateTags` → штатный REST-рефетч.
   REST-контракт и DTO-сериализация остаются единственным источником истины.
5. **Redis-adapter** — `@socket.io/redis-adapter` поверх существующего `ioredis`
   (`RedisIoAdapter` в `main.ts`): emit из любого HTTP-воркера долетает до сокетов всех инстансов.
6. **Точки эмита (3)** — в доменных сервисах, строго ПОСЛЕ commit Prisma-транзакции, только
   получателю (не отправителю — его RTK-мутация сама инвалидирует кэш):
   - `ChatService.createMessage` → `{thread,id}`, `{thread_list}`, `{notification}`;
   - `TourRequestsService.create` → владельцу `{tour}`, `{notification}`;
   - `TourRequestsService.setStatus` → второй стороне `{tour}`, `{notification}`.
   `RealtimeEmitter` — no-op до инициализации gateway (юнит-тесты сервисов и bootstrap не падают).
7. **Клиент** — singleton `socketClient` (socket.io-client, `transports: ['websocket']`),
   `useRealtimeBridge` в layout: токен→connect, событие→`invalidateTags`, reconnect→gap-fill
   всех realtime-тегов; флаг `socketConnected` в сторе; поллинг деградирует до 60 с safety-net,
   пока сокет жив. Env: `NEXT_PUBLIC_WS_URL`.

## Consequences

Positive:
- Доставка чата/уведомлений/туров становится мгновенной вместо 6–20 с.
- Нулевой риск рассинхронизации данных: сокет — только «будильник», данные всегда из REST.
- Gateway не дублирует DTO-shaping; мобилка (FCM) и админка не затронуты.
- Разрыв соединения самозалечивается: reconnect + полная инвалидация + 60 с поллинг-страховка.

Negative / trade-offs:
- Отправитель с двумя вкладками не получит push во вторую вкладку (эмит только получателю).
- При масштабировании api >1 реплики нужны sticky-sessions на Caddy либо websocket-only
  транспорт + подтверждённый redis-adapter (сейчас один инстанс — не блокер).
- +2 постоянных redis-соединения (pub/sub пара адаптера).
- Явного дисконнекта по `visibilitychange` нет (осознанно вне охвата: idle-WS дёшев).

## Related files

- apps/api/src/realtime/* (types, emitter, ws-authenticator, gateway, redis-io.adapter, module)
- apps/api/src/main.ts, apps/api/src/app.module.ts
- apps/api/src/chat/chat.service.ts, apps/api/src/tour-requests/tour-requests.service.ts
- apps/client/src/store/{socketClient,useRealtimeBridge,realtimeInvalidation,realtimeSlice}.ts
- apps/client/src/store/useUnreadCounts.ts, apps/client/src/features/account/Inbox.tsx

## Related task

- Spec/plan: PR feat/realtime-websocket-spec; реализация: PR feat/realtime-api-gateway (Phase A),
  PR feat/realtime-client-bridge (Phase B)
