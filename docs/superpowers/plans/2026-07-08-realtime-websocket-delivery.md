# Real-time WebSocket Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить REST-поллинг чата/уведомлений/туров на push через socket.io: сервер после записи в БД шлёт тонкий сигнал инвалидации, клиент дёргает `invalidateTags` RTK Query → штатный REST-рефетч.

**Architecture:** Одна `RealtimeGateway` (socket.io, namespace `/rt`) рядом с Express-приложением NestJS. Клиент джойнит комнату `user:<id>`. Три доменные точки (`ChatService.createMessage`, `TourRequestsService.create`, `TourRequestsService.setStatus`) после commit транзакции публикуют инвалидацию получателю. REST-контракт не меняется; поллинг деградирует до 60с safety-net, пока сокет жив.

**Tech Stack:** NestJS 10 + `@nestjs/platform-socket.io` + `socket.io`, `@socket.io/redis-adapter` поверх существующего `ioredis`; Next.js 15 + RTK Query + `socket.io-client`; Vitest+RTL (client), Jest (api).

## Global Constraints

- **Спек:** `docs/superpowers/specs/2026-07-08-realtime-websocket-delivery-design.md` — источник истины.
- **Охват:** только `apps/api` и `apps/client`. `apps/web` (админка) и мобилка (FCM) НЕ трогаются.
- **REST-контракт неизменен:** сокет шлёт только сигнал, данные приходят через существующие эндпоинты. Payload: `{ type: 'thread' | 'thread_list' | 'notification' | 'tour'; id?: string }`.
- **Эмит только ПОСЛЕ commit** Prisma-транзакции — никогда внутри `$transaction(async (tx) => …)`.
- **Финансы `Numeric`, UTC `datetime.now(timezone.utc)`, i18n через `t()`, никаких дефолтов секретов** (стандарт проекта; в этой фиче финансов/дат-полей нет).
- **Git:** каждая фаза — своя ветка от `main` → PR (main защищён, мёржит юзер). НЕ работать в `apps/web`.
- **Event name сокета:** `'invalidate'` (сервер `.emit('invalidate', payload)`, клиент `.on('invalidate', …)`).
- **Комната:** строго `user:${userId}` на обеих сторонах.
- **RTK-теги (существующие, из `apps/client/src/store/api/baseApi.ts`):** `'Chat'`, `'Notification'`, `'TourRequest'`. Константы: список тредов `{type:'Chat', id:'LIST'}`; лента треда `{type:'Chat', id:threadId}`; уведомления `'Notification'`; туры `{type:'TourRequest', id:'INCOMING'}` и `{type:'TourRequest', id:'OUTGOING'}`.

---

## File Structure

**Backend (новые):**
- `apps/api/src/realtime/realtime.types.ts` — тип `RealtimeInvalidation`.
- `apps/api/src/realtime/realtime.emitter.ts` — `RealtimeEmitter` (держит `Server`, метод `emit`).
- `apps/api/src/realtime/ws-authenticator.ts` — `WsAuthenticator` (verify токена → `{userId}` | null).
- `apps/api/src/realtime/realtime.gateway.ts` — `RealtimeGateway` (connection-auth + join room).
- `apps/api/src/realtime/redis-io.adapter.ts` — `RedisIoAdapter` (socket.io redis-adapter).
- `apps/api/src/realtime/realtime.module.ts` — модуль, экспортирует `RealtimeEmitter`.
- `apps/api/src/realtime/index.ts` — barrel.
- Спеки: `realtime.emitter.spec.ts`, `ws-authenticator.spec.ts`, `realtime.gateway.spec.ts`.

**Backend (правки):**
- `apps/api/package.json` — deps.
- `apps/api/src/app.module.ts` — импорт `RealtimeModule`.
- `apps/api/src/main.ts` — `app.useWebSocketAdapter(new RedisIoAdapter(app))`.
- `apps/api/src/chat/chat.service.ts` — эмит в `createMessage` (после tx).
- `apps/api/src/chat/chat.module.ts` — импорт `RealtimeModule`.
- `apps/api/src/tour-requests/tour-requests.service.ts` — эмит в `create` и `setStatus`.
- `apps/api/src/tour-requests/tour-requests.module.ts` — импорт `RealtimeModule`.

**Frontend (новые):**
- `apps/client/src/store/realtimeSlice.ts` — флаг `socketConnected` + селектор.
- `apps/client/src/store/socketClient.ts` — singleton socket.io-client.
- `apps/client/src/store/realtimeInvalidation.ts` — чистая `invalidationTagsFor(payload)`.
- `apps/client/src/store/useRealtimeBridge.ts` — хук: токен→connect, событие→invalidate.
- Спеки: `realtimeSlice.test.ts`, `realtimeInvalidation.test.ts`, `useRealtimeBridge.test.ts`.

**Frontend (правки):**
- `apps/client/package.json` — `socket.io-client`.
- `apps/client/src/store/store.ts` — регистрация `realtimeReducer`.
- `apps/client/src/store/useUnreadCounts.ts` — деградация интервала.
- `apps/client/src/features/account/Inbox.tsx` — деградация интервалов.
- layout, где сейчас монтируется Header (`apps/client/src/app/[locale]/layout.tsx` или общий client-компонент) — монтирование `useRealtimeBridge`.

---

## PHASE A — Backend

### Task 1: Тип инвалидации + RealtimeEmitter

**Files:**
- Create: `apps/api/src/realtime/realtime.types.ts`
- Create: `apps/api/src/realtime/realtime.emitter.ts`
- Test: `apps/api/src/realtime/realtime.emitter.spec.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Produces:
  - `type RealtimeInvalidation = { type: 'thread' | 'thread_list' | 'notification' | 'tour'; id?: string }`
  - `class RealtimeEmitter { setServer(server: Server): void; emit(userId: string, payload: RealtimeInvalidation): void }`

- [ ] **Step 1: Добавить зависимости**

Run:
```bash
cd apps/api
pnpm add @nestjs/platform-socket.io socket.io @socket.io/redis-adapter
```
Expected: пакеты в `dependencies`, `pnpm-lock.yaml` обновлён.

- [ ] **Step 2: Написать тип**

`apps/api/src/realtime/realtime.types.ts`:
```ts
/**
 * Тонкий сигнал инвалидации, который сервер пушит клиенту по сокету. Не несёт
 * данных сущности — клиент по нему дёргает RTK invalidateTags и рефетчит через
 * существующий REST (spec 2026-07-08). `id` — для точечной инвалидации (тред).
 */
export type RealtimeInvalidation = {
  type: 'thread' | 'thread_list' | 'notification' | 'tour';
  id?: string;
};

/** Имя события сокета. */
export const REALTIME_EVENT = 'invalidate';

/** Комната пользователя. */
export const userRoom = (userId: string): string => `user:${userId}`;
```

- [ ] **Step 3: Написать падающий тест эмиттера**

`apps/api/src/realtime/realtime.emitter.spec.ts`:
```ts
import { RealtimeEmitter } from './realtime.emitter';
import { REALTIME_EVENT, userRoom } from './realtime.types';

describe('RealtimeEmitter', () => {
  it('no-op пока server не установлен (не бросает)', () => {
    const emitter = new RealtimeEmitter();
    expect(() => emitter.emit('u1', { type: 'notification' })).not.toThrow();
  });

  it('шлёт событие в комнату пользователя', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const emitter = new RealtimeEmitter();
    emitter.setServer({ to } as never);

    emitter.emit('u1', { type: 'thread', id: 't42' });

    expect(to).toHaveBeenCalledWith(userRoom('u1'));
    expect(emit).toHaveBeenCalledWith(REALTIME_EVENT, { type: 'thread', id: 't42' });
  });
});
```

- [ ] **Step 4: Запустить — упадёт**

Run: `cd apps/api && pnpm test -- realtime.emitter`
Expected: FAIL — `Cannot find module './realtime.emitter'`.

- [ ] **Step 5: Реализовать эмиттер**

`apps/api/src/realtime/realtime.emitter.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { REALTIME_EVENT, RealtimeInvalidation, userRoom } from './realtime.types';

/**
 * Тонкая обёртка над socket.io Server для доменных сервисов. Держит ссылку на
 * server (её ставит {@link RealtimeGateway} на afterInit). До инициализации —
 * no-op, чтобы юнит-тесты сервисов и bootstrap не падали. С redis-adapter
 * `server.to(room).emit` долетает и до сокетов на других инстансах.
 */
@Injectable()
export class RealtimeEmitter {
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  emit(userId: string, payload: RealtimeInvalidation): void {
    this.server?.to(userRoom(userId)).emit(REALTIME_EVENT, payload);
  }
}
```

- [ ] **Step 6: Запустить — пройдёт**

Run: `cd apps/api && pnpm test -- realtime.emitter`
Expected: PASS (2 теста).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/realtime/realtime.types.ts apps/api/src/realtime/realtime.emitter.ts apps/api/src/realtime/realtime.emitter.spec.ts apps/api/package.json apps/api/../../pnpm-lock.yaml
git commit -m "feat(api): realtime emitter + invalidation type"
```

---

### Task 2: WsAuthenticator (connection-time JWT)

**Files:**
- Create: `apps/api/src/realtime/ws-authenticator.ts`
- Test: `apps/api/src/realtime/ws-authenticator.spec.ts`

**Interfaces:**
- Consumes: `JwtService` (`@nestjs/jwt`), `ConfigService` (ключ `jwt.accessSecret`) — тот же паттерн, что `apps/api/src/common/guards/jwt-auth.guard.ts`.
- Produces: `class WsAuthenticator { verify(token: string | undefined): Promise<{ userId: string } | null> }`

- [ ] **Step 1: Написать падающий тест**

`apps/api/src/realtime/ws-authenticator.spec.ts`:
```ts
import { WsAuthenticator } from './ws-authenticator';

const config = { get: (k: string) => (k === 'jwt.accessSecret' ? 'secret' : undefined) };

describe('WsAuthenticator', () => {
  it('возвращает null без токена', async () => {
    const jwt = { verifyAsync: jest.fn() };
    const auth = new WsAuthenticator(jwt as never, config as never);
    expect(await auth.verify(undefined)).toBeNull();
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('возвращает null на невалидном токене', async () => {
    const jwt = { verifyAsync: jest.fn().mockRejectedValue(new Error('bad')) };
    const auth = new WsAuthenticator(jwt as never, config as never);
    expect(await auth.verify('x')).toBeNull();
  });

  it('возвращает userId из sub', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1' }) };
    const auth = new WsAuthenticator(jwt as never, config as never);
    expect(await auth.verify('good')).toEqual({ userId: 'u1' });
    expect(jwt.verifyAsync).toHaveBeenCalledWith('good', { secret: 'secret' });
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `cd apps/api && pnpm test -- ws-authenticator`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать**

`apps/api/src/realtime/ws-authenticator.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

interface AccessPayload {
  sub: string;
}

/**
 * Верификация access-JWT на этапе socket-handshake. Тот же секрет и та же схема,
 * что у {@link JwtAuthGuard} (ADR-0010). Возвращает null на любой ошибке —
 * gateway по null дисконнектит соединение.
 */
@Injectable()
export class WsAuthenticator {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async verify(token: string | undefined): Promise<{ userId: string } | null> {
    if (!token) {
      return null;
    }
    const secret = this.config.get<string>('jwt.accessSecret')!;
    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token, { secret });
      return { userId: payload.sub };
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `cd apps/api && pnpm test -- ws-authenticator`
Expected: PASS (3 теста).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/realtime/ws-authenticator.ts apps/api/src/realtime/ws-authenticator.spec.ts
git commit -m "feat(api): ws connection-time jwt authenticator"
```

---

### Task 3: RealtimeGateway

**Files:**
- Create: `apps/api/src/realtime/realtime.gateway.ts`
- Test: `apps/api/src/realtime/realtime.gateway.spec.ts`

**Interfaces:**
- Consumes: `WsAuthenticator.verify`, `RealtimeEmitter.setServer`.
- Produces: `class RealtimeGateway { afterInit(server: Server): void; handleConnection(client: Socket): Promise<void> }`. `handleConnection` читает `client.handshake.auth.token`, при null от authenticator → `client.disconnect()`, иначе `client.join(userRoom(userId))`.

- [ ] **Step 1: Написать падающий тест (fake socket)**

`apps/api/src/realtime/realtime.gateway.spec.ts`:
```ts
import { RealtimeGateway } from './realtime.gateway';
import { userRoom } from './realtime.types';

function makeGateway(verifyResult: { userId: string } | null) {
  const authenticator = { verify: jest.fn().mockResolvedValue(verifyResult) };
  const emitter = { setServer: jest.fn() };
  const gateway = new RealtimeGateway(authenticator as never, emitter as never);
  return { gateway, authenticator, emitter };
}

function fakeSocket(token: string | undefined) {
  return { handshake: { auth: { token } }, join: jest.fn(), disconnect: jest.fn() };
}

describe('RealtimeGateway', () => {
  it('afterInit прокидывает server в эмиттер', () => {
    const { gateway, emitter } = makeGateway({ userId: 'u1' });
    const server = { to: jest.fn() };
    gateway.afterInit(server as never);
    expect(emitter.setServer).toHaveBeenCalledWith(server);
  });

  it('валидный токен → join в комнату пользователя', async () => {
    const { gateway } = makeGateway({ userId: 'u1' });
    const socket = fakeSocket('good');
    await gateway.handleConnection(socket as never);
    expect(socket.join).toHaveBeenCalledWith(userRoom('u1'));
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('невалидный токен → disconnect, без join', async () => {
    const { gateway } = makeGateway(null);
    const socket = fakeSocket(undefined);
    await gateway.handleConnection(socket as never);
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `cd apps/api && pnpm test -- realtime.gateway`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать gateway**

`apps/api/src/realtime/realtime.gateway.ts`:
```ts
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { RealtimeEmitter } from './realtime.emitter';
import { WsAuthenticator } from './ws-authenticator';
import { userRoom } from './realtime.types';

/**
 * Socket.io-шлюз (namespace `/rt`). Аутентификация — на этапе connection:
 * NestJS ws-guards не перехватывают lifecycle подключения, поэтому проверяем
 * токен в handleConnection. Успех → сокет джойнит `user:<id>` и получает
 * инвалидации; провал → дисконнект (клиент переподключится после ротации).
 */
@WebSocketGateway({ namespace: '/rt' })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  constructor(
    private readonly authenticator: WsAuthenticator,
    private readonly emitter: RealtimeEmitter,
  ) {}

  afterInit(server: Server): void {
    this.emitter.setServer(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    const auth = await this.authenticator.verify(token);
    if (!auth) {
      client.disconnect();
      return;
    }
    await client.join(userRoom(auth.userId));
  }
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `cd apps/api && pnpm test -- realtime.gateway`
Expected: PASS (3 теста).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/realtime/realtime.gateway.ts apps/api/src/realtime/realtime.gateway.spec.ts
git commit -m "feat(api): realtime gateway with connection auth"
```

---

### Task 4: RedisIoAdapter + модуль + wiring

**Files:**
- Create: `apps/api/src/realtime/redis-io.adapter.ts`
- Create: `apps/api/src/realtime/realtime.module.ts`
- Create: `apps/api/src/realtime/index.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`

**Interfaces:**
- Consumes: `ConfigService` (ключ redis-URL — тот же, что использует существующий `RedisModule`; проверить имя ключа в `apps/api/src/**/redis*.ts`, напр. `redis.url`).
- Produces:
  - `class RealtimeModule` — provides+exports `RealtimeEmitter`; provides `RealtimeGateway`, `WsAuthenticator`; импортирует `JwtModule`/`ConfigModule` для `JwtService`.
  - `class RedisIoAdapter extends IoAdapter { connectToRedis(): Promise<void>; createIOServer(port, options): unknown }`

- [ ] **Step 1: Подтвердить имя ключа redis-URL**

Run: `cd apps/api && rtk grep -rn "redis.url\|REDIS_URL\|createClient\|new Redis" src/config src/redis 2>/dev/null | head`
Использовать найденный ключ конфигурации в адаптере (ниже — плейсхолдер `redis.url`, заменить на фактический).

- [ ] **Step 2: Реализовать адаптер**

`apps/api/src/realtime/redis-io.adapter.ts`:
```ts
import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { ServerOptions } from 'socket.io';

/**
 * IoAdapter с redis-adapter: pub/sub-пара ioredis, чтобы emit из любого
 * HTTP-воркера долетал до сокетов на всех инстансах (spec — кросс-инстанс emit).
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const config = this.app.get(ConfigService);
    const url = config.get<string>('redis.url')!; // заменить ключ по Step 1
    const pubClient = new Redis(url);
    const subClient = pubClient.duplicate();
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      (server as { adapter: (a: unknown) => void }).adapter(this.adapterConstructor);
    }
    return server;
  }
}
```

- [ ] **Step 3: Написать модуль**

`apps/api/src/realtime/realtime.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeEmitter } from './realtime.emitter';
import { RealtimeGateway } from './realtime.gateway';
import { WsAuthenticator } from './ws-authenticator';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [RealtimeGateway, RealtimeEmitter, WsAuthenticator],
  exports: [RealtimeEmitter],
})
export class RealtimeModule {}
```

`apps/api/src/realtime/index.ts`:
```ts
export { RealtimeModule } from './realtime.module';
export { RealtimeEmitter } from './realtime.emitter';
export { RedisIoAdapter } from './redis-io.adapter';
export type { RealtimeInvalidation } from './realtime.types';
```

- [ ] **Step 4: Зарегистрировать модуль в app.module.ts**

В `apps/api/src/app.module.ts` добавить в массив `imports` (рядом с прочими доменными модулями, после `AuthModule`):
```ts
import { RealtimeModule } from './realtime';
// ...
    RealtimeModule,
```

- [ ] **Step 5: Подключить WS-адаптер в main.ts**

В `apps/api/src/main.ts` после `const app = await NestFactory.create...` и до `await app.listen(port)`:
```ts
import { RedisIoAdapter } from './realtime';
// ...
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);
```

- [ ] **Step 6: Собрать API — компилируется**

Run: `cd apps/api && pnpm exec tsc --noEmit -p tsconfig.build.json`
Expected: без ошибок.

- [ ] **Step 7: Прогнать существующие тесты api (регрессия bootstrap)**

Run: `cd apps/api && pnpm test`
Expected: все прежние + новые realtime-спеки — PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/realtime/redis-io.adapter.ts apps/api/src/realtime/realtime.module.ts apps/api/src/realtime/index.ts apps/api/src/app.module.ts apps/api/src/main.ts
git commit -m "feat(api): wire realtime module + redis io adapter"
```

---

### Task 5: Эмит в ChatService.createMessage

**Files:**
- Modify: `apps/api/src/chat/chat.service.ts` (метод `createMessage`, ~стр. 411-457)
- Modify: `apps/api/src/chat/chat.module.ts`
- Test: `apps/api/src/chat/chat.service.spec.ts` (добавить кейс)

**Interfaces:**
- Consumes: `RealtimeEmitter.emit(userId, { type, id? })`. `recipientId` уже вычислен в методе (const до транзакции).

- [ ] **Step 1: Импортировать RealtimeModule в chat.module.ts**

В `apps/api/src/chat/chat.module.ts` добавить `RealtimeModule` в `imports`:
```ts
import { RealtimeModule } from '../realtime';
// ... imports: [ ..., RealtimeModule ],
```

- [ ] **Step 2: Внедрить эмиттер и добавить эмит после транзакции**

В `apps/api/src/chat/chat.service.ts` в конструктор добавить:
```ts
    private readonly realtime: RealtimeEmitter,
```
(и `import { RealtimeEmitter } from '../realtime';`).

В `createMessage`, между `const message = await this.prisma.$transaction(...)` и `return this.toMessageResponse(message);`, вставить:
```ts
    // Push получателю: новая реплика в треде, сдвиг списка диалогов и новое
    // IN_APP-уведомление (NEW_CHAT_MESSAGE). Только после commit (spec).
    this.realtime.emit(recipientId, { type: 'thread', id: threadId });
    this.realtime.emit(recipientId, { type: 'thread_list' });
    this.realtime.emit(recipientId, { type: 'notification' });
```

- [ ] **Step 3: Написать тест эмита**

В `apps/api/src/chat/chat.service.spec.ts` — в setup замокать `RealtimeEmitter` (`{ emit: jest.fn() }`) и передать в конструктор `ChatService`. Добавить тест:
```ts
it('createMessage эмитит инвалидации получателю после коммита', async () => {
  // ...arrange: тред, где recipient = ownerId, sender = initiator...
  await service.createMessage(initiatorUser, threadId, 'hi');
  expect(realtime.emit).toHaveBeenCalledWith(ownerId, { type: 'thread', id: threadId });
  expect(realtime.emit).toHaveBeenCalledWith(ownerId, { type: 'thread_list' });
  expect(realtime.emit).toHaveBeenCalledWith(ownerId, { type: 'notification' });
});
```
(Использовать существующие в спеке моки prisma/notifications; следовать текущему стилю arrange.)

- [ ] **Step 4: Запустить — пройдёт**

Run: `cd apps/api && pnpm test -- chat.service`
Expected: PASS (существующие + новый).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/chat/chat.service.ts apps/api/src/chat/chat.module.ts apps/api/src/chat/chat.service.spec.ts
git commit -m "feat(api): emit realtime invalidation on chat message"
```

---

### Task 6: Эмит в TourRequestsService (create + setStatus)

**Files:**
- Modify: `apps/api/src/tour-requests/tour-requests.service.ts` (`create` ~стр.192, `setStatus` ~стр.289)
- Modify: `apps/api/src/tour-requests/tour-requests.module.ts`
- Test: `apps/api/src/tour-requests/tour-requests.service.spec.ts` (добавить кейсы)

**Interfaces:**
- Consumes: `RealtimeEmitter.emit`. `create` → получатель `listing.ownerId`; `setStatus` → получатель `notifyUserId` (уже вычислен, стр. 259/269).

- [ ] **Step 1: Импортировать RealtimeModule в tour-requests.module.ts**

Добавить `RealtimeModule` в `imports` (аналогично Task 5 Step 1).

- [ ] **Step 2: Внедрить эмиттер**

В конструктор `TourRequestsService` добавить `private readonly realtime: RealtimeEmitter,` + импорт.

- [ ] **Step 3: Эмит в `create` после транзакции**

Перед `return this.toResponse(created);` (стр. ~192):
```ts
    this.realtime.emit(listing.ownerId, { type: 'tour' });
    this.realtime.emit(listing.ownerId, { type: 'notification' });
```

- [ ] **Step 4: Эмит в `setStatus` после транзакции**

Перед `return this.toResponse(updated);` (стр. ~289):
```ts
    this.realtime.emit(notifyUserId, { type: 'tour' });
    this.realtime.emit(notifyUserId, { type: 'notification' });
```

- [ ] **Step 5: Написать тесты эмита**

В `apps/api/src/tour-requests/tour-requests.service.spec.ts` замокать `RealtimeEmitter`. Добавить:
```ts
it('create эмитит tour+notification владельцу', async () => {
  await service.create(requesterId, dto);
  expect(realtime.emit).toHaveBeenCalledWith(ownerId, { type: 'tour' });
  expect(realtime.emit).toHaveBeenCalledWith(ownerId, { type: 'notification' });
});

it('setStatus эмитит второй стороне', async () => {
  await service.setStatus(ownerId, tourId, TourRequestAction.CONFIRM);
  expect(realtime.emit).toHaveBeenCalledWith(requesterId, { type: 'tour' });
  expect(realtime.emit).toHaveBeenCalledWith(requesterId, { type: 'notification' });
});
```

- [ ] **Step 6: Запустить — пройдёт**

Run: `cd apps/api && pnpm test -- tour-requests.service`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/tour-requests/tour-requests.service.ts apps/api/src/tour-requests/tour-requests.module.ts apps/api/src/tour-requests/tour-requests.service.spec.ts
git commit -m "feat(api): emit realtime invalidation on tour create/status"
```

> **Конец PHASE A.** Открыть PR `feat/realtime-api-gateway` → `main`.

---

## PHASE B — Frontend

### Task 7: realtimeSlice (флаг socketConnected)

**Files:**
- Create: `apps/client/src/store/realtimeSlice.ts`
- Test: `apps/client/src/store/realtimeSlice.test.ts`
- Modify: `apps/client/src/store/store.ts`

**Interfaces:**
- Produces:
  - `default export realtimeReducer`
  - `setSocketConnected(payload: boolean)` action
  - `selectSocketConnected(state: RootState): boolean`

- [ ] **Step 1: Написать падающий тест**

`apps/client/src/store/realtimeSlice.test.ts`:
```ts
import realtimeReducer, { setSocketConnected } from './realtimeSlice';

describe('realtimeSlice', () => {
  it('дефолт — отключено', () => {
    expect(realtimeReducer(undefined, { type: '@@init' })).toEqual({ socketConnected: false });
  });
  it('setSocketConnected(true) поднимает флаг', () => {
    const s = realtimeReducer(undefined, setSocketConnected(true));
    expect(s.socketConnected).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `cd apps/client && pnpm test -- realtimeSlice`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать slice**

`apps/client/src/store/realtimeSlice.ts`:
```ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';

interface RealtimeState {
  socketConnected: boolean;
}

const initialState: RealtimeState = { socketConnected: false };

const realtimeSlice = createSlice({
  name: 'realtime',
  initialState,
  reducers: {
    setSocketConnected: (state, action: PayloadAction<boolean>) => {
      state.socketConnected = action.payload;
    },
  },
});

export const { setSocketConnected } = realtimeSlice.actions;
export const selectSocketConnected = (state: RootState): boolean =>
  state.realtime.socketConnected;
export default realtimeSlice.reducer;
```

- [ ] **Step 4: Зарегистрировать в store.ts**

В `apps/client/src/store/store.ts`: `import realtimeReducer from './realtimeSlice';` и добавить `realtime: realtimeReducer,` в `reducer`.

- [ ] **Step 5: Запустить — пройдёт**

Run: `cd apps/client && pnpm test -- realtimeSlice`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/store/realtimeSlice.ts apps/client/src/store/realtimeSlice.test.ts apps/client/src/store/store.ts
git commit -m "feat(client): realtime socketConnected slice"
```

---

### Task 8: Чистая функция маппинга invalidationTagsFor

**Files:**
- Create: `apps/client/src/store/realtimeInvalidation.ts`
- Test: `apps/client/src/store/realtimeInvalidation.test.ts`

**Interfaces:**
- Consumes: тип payload (зеркало backend `RealtimeInvalidation`).
- Produces: `invalidationTagsFor(payload): TagDescription<'Chat' | 'Notification' | 'TourRequest'>[]` и `ALL_REALTIME_TAGS` (для gap-fill при reconnect).

- [ ] **Step 1: Написать падающий тест**

`apps/client/src/store/realtimeInvalidation.test.ts`:
```ts
import { invalidationTagsFor, ALL_REALTIME_TAGS } from './realtimeInvalidation';

describe('invalidationTagsFor', () => {
  it('thread → лента конкретного треда', () => {
    expect(invalidationTagsFor({ type: 'thread', id: 't1' })).toEqual([
      { type: 'Chat', id: 't1' },
    ]);
  });
  it('thread_list → список диалогов', () => {
    expect(invalidationTagsFor({ type: 'thread_list' })).toEqual([
      { type: 'Chat', id: 'LIST' },
    ]);
  });
  it('notification → тег уведомлений', () => {
    expect(invalidationTagsFor({ type: 'notification' })).toEqual(['Notification']);
  });
  it('tour → обе стороны списков туров', () => {
    expect(invalidationTagsFor({ type: 'tour' })).toEqual([
      { type: 'TourRequest', id: 'INCOMING' },
      { type: 'TourRequest', id: 'OUTGOING' },
    ]);
  });
  it('ALL_REALTIME_TAGS покрывает все подсистемы', () => {
    expect(ALL_REALTIME_TAGS).toEqual([
      { type: 'Chat', id: 'LIST' },
      'Notification',
      { type: 'TourRequest', id: 'INCOMING' },
      { type: 'TourRequest', id: 'OUTGOING' },
    ]);
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `cd apps/client && pnpm test -- realtimeInvalidation`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать**

`apps/client/src/store/realtimeInvalidation.ts`:
```ts
import type { TagDescription } from '@reduxjs/toolkit/query';

/** Зеркало backend RealtimeInvalidation (apps/api/src/realtime/realtime.types.ts). */
export type RealtimeInvalidation = {
  type: 'thread' | 'thread_list' | 'notification' | 'tour';
  id?: string;
};

type RealtimeTag = TagDescription<'Chat' | 'Notification' | 'TourRequest'>;

/** Все теги realtime-подсистем — для полной инвалидации при reconnect (gap-fill). */
export const ALL_REALTIME_TAGS: RealtimeTag[] = [
  { type: 'Chat', id: 'LIST' },
  'Notification',
  { type: 'TourRequest', id: 'INCOMING' },
  { type: 'TourRequest', id: 'OUTGOING' },
];

/** Сигнал сокета → RTK-теги для invalidateTags. */
export function invalidationTagsFor(payload: RealtimeInvalidation): RealtimeTag[] {
  switch (payload.type) {
    case 'thread':
      return [{ type: 'Chat', id: payload.id ?? 'LIST' }];
    case 'thread_list':
      return [{ type: 'Chat', id: 'LIST' }];
    case 'notification':
      return ['Notification'];
    case 'tour':
      return [
        { type: 'TourRequest', id: 'INCOMING' },
        { type: 'TourRequest', id: 'OUTGOING' },
      ];
  }
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `cd apps/client && pnpm test -- realtimeInvalidation`
Expected: PASS (5 тестов).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/store/realtimeInvalidation.ts apps/client/src/store/realtimeInvalidation.test.ts
git commit -m "feat(client): realtime signal -> RTK tag mapping"
```

---

### Task 9: socketClient singleton

**Files:**
- Create: `apps/client/src/store/socketClient.ts`
- Modify: `apps/client/package.json` (`socket.io-client`)

**Interfaces:**
- Produces:
  - `connectSocket(url: string, token: string, handlers: { onInvalidate: (p: RealtimeInvalidation) => void; onConnect: () => void; onDisconnect: () => void }): void`
  - `disconnectSocket(): void`
  - namespace путь `/rt`, событие `'invalidate'`, `auth: { token }`.

*Примечание:* singleton с сокет-стейтом сложно юнит-тестировать без мока socket.io-client; поведение подключения покрывается в Task 10 через мок этого модуля. Здесь тестов нет — только реализация и type-check.

- [ ] **Step 1: Добавить зависимость**

Run: `cd apps/client && pnpm add socket.io-client`
Expected: пакет в `dependencies`.

- [ ] **Step 2: Реализовать singleton**

`apps/client/src/store/socketClient.ts`:
```ts
import { io, type Socket } from 'socket.io-client';
import type { RealtimeInvalidation } from './realtimeInvalidation';

interface SocketHandlers {
  onInvalidate: (payload: RealtimeInvalidation) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

let socket: Socket | null = null;

/**
 * Единый сокет портала. Namespace `/rt`, токен в handshake.auth. Повторный вызов
 * (ротация токена) закрывает прежнее соединение и открывает новое с новым токеном.
 */
export function connectSocket(url: string, token: string, handlers: SocketHandlers): void {
  disconnectSocket();
  socket = io(`${url}/rt`, {
    auth: { token },
    transports: ['websocket'],
  });
  socket.on('connect', handlers.onConnect);
  socket.on('disconnect', handlers.onDisconnect);
  socket.on('invalidate', handlers.onInvalidate);
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/client && pnpm exec tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/store/socketClient.ts apps/client/package.json apps/client/../../pnpm-lock.yaml
git commit -m "feat(client): socket.io singleton client"
```

---

### Task 10: useRealtimeBridge (токен→connect, событие→invalidate)

**Files:**
- Create: `apps/client/src/store/useRealtimeBridge.ts`
- Test: `apps/client/src/store/useRealtimeBridge.test.ts`
- Modify: layout-компонент, где монтируется Header (найти: `rtk grep -rln "useUnreadCounts({ pollingInterval" apps/client/src` → тот же клиентский layout).

**Interfaces:**
- Consumes: `selectAccessToken` (`./slices/authSlice`), `connectSocket`/`disconnectSocket` (Task 9), `invalidationTagsFor`/`ALL_REALTIME_TAGS` (Task 8), `setSocketConnected` (Task 7), `baseApi.util.invalidateTags` (`./api/baseApi`).
- Produces: `useRealtimeBridge(): void` — сайд-эффект, монтируется один раз.

- [ ] **Step 1: Написать падающий тест (мок socketClient)**

`apps/client/src/store/useRealtimeBridge.test.ts`:
```ts
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { makeStore } from './store';
import { setCredentials } from './slices/authSlice';
import { useRealtimeBridge } from './useRealtimeBridge';
import * as client from './socketClient';

jest.mock('./socketClient');

function wrapper(store: ReturnType<typeof makeStore>) {
  return ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
}

describe('useRealtimeBridge', () => {
  it('подключается при наличии токена', () => {
    const store = makeStore();
    store.dispatch(setCredentials({ access_token: 'tok', refresh_token: 'r' }));
    const connect = jest.spyOn(client, 'connectSocket');
    renderHook(() => useRealtimeBridge(), { wrapper: wrapper(store) });
    expect(connect).toHaveBeenCalledWith(expect.any(String), 'tok', expect.any(Object));
  });

  it('не подключается без токена', () => {
    const store = makeStore();
    const connect = jest.spyOn(client, 'connectSocket');
    renderHook(() => useRealtimeBridge(), { wrapper: wrapper(store) });
    expect(connect).not.toHaveBeenCalled();
  });

  it('onInvalidate диспатчит invalidateTags по маппингу', () => {
    const store = makeStore();
    store.dispatch(setCredentials({ access_token: 'tok', refresh_token: 'r' }));
    let captured: (p: unknown) => void = () => {};
    jest.spyOn(client, 'connectSocket').mockImplementation((_u, _t, h) => {
      captured = h.onInvalidate as (p: unknown) => void;
    });
    const dispatchSpy = jest.spyOn(store, 'dispatch');
    renderHook(() => useRealtimeBridge(), { wrapper: wrapper(store) });
    captured({ type: 'notification' });
    // invalidateTags(['Notification']) уходит thunk'ом в dispatch
    expect(dispatchSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `cd apps/client && pnpm test -- useRealtimeBridge`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать хук**

`apps/client/src/store/useRealtimeBridge.ts`:
```ts
'use client';

import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from './hooks';
import { selectAccessToken } from './slices/authSlice';
import { baseApi } from './api/baseApi';
import { connectSocket, disconnectSocket } from './socketClient';
import {
  ALL_REALTIME_TAGS,
  invalidationTagsFor,
  type RealtimeInvalidation,
} from './realtimeInvalidation';
import { setSocketConnected } from './realtimeSlice';

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000';

/**
 * Мост сокет↔RTK: (пере)подключается при появлении/ротации access-токена,
 * по событию `invalidate` дёргает invalidateTags → штатный REST-рефетч. При
 * reconnect инвалидирует все realtime-теги (gap-fill пропущенных за разрыв
 * ивентов). Логаут (token=null) → дисконнект. Монтируется один раз в layout.
 */
export function useRealtimeBridge(): void {
  const dispatch = useAppDispatch();
  const token = useAppSelector(selectAccessToken);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      dispatch(setSocketConnected(false));
      return;
    }
    connectSocket(WS_URL, token, {
      onConnect: () => {
        dispatch(setSocketConnected(true));
        // gap-fill: подтянуть всё, что могли пропустить до/во время разрыва.
        dispatch(baseApi.util.invalidateTags(ALL_REALTIME_TAGS));
      },
      onDisconnect: () => dispatch(setSocketConnected(false)),
      onInvalidate: (payload: RealtimeInvalidation) =>
        dispatch(baseApi.util.invalidateTags(invalidationTagsFor(payload))),
    });
    return () => {
      disconnectSocket();
      dispatch(setSocketConnected(false));
    };
  }, [token, dispatch]);
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `cd apps/client && pnpm test -- useRealtimeBridge`
Expected: PASS (3 теста).

- [ ] **Step 5: Смонтировать мост в layout**

В клиентском layout-компоненте (там же, где рендерится Header) вызвать `useRealtimeBridge();` один раз (компонент уже `'use client'`; если Header внутри серверного layout — добавить вызов в тот же клиентский компонент, что и Header).

- [ ] **Step 6: Type-check + существующие тесты**

Run: `cd apps/client && pnpm exec tsc --noEmit && pnpm test`
Expected: без ошибок, все тесты PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/store/useRealtimeBridge.ts apps/client/src/store/useRealtimeBridge.test.ts apps/client/src/app
git commit -m "feat(client): realtime bridge (socket -> RTK invalidation)"
```

---

### Task 11: Деградация поллинга при живом сокете

**Files:**
- Modify: `apps/client/src/store/useUnreadCounts.ts`
- Modify: `apps/client/src/features/account/Inbox.tsx` (стр. 164, 180)
- Test: `apps/client/src/store/useUnreadCounts.test.ts` (добавить кейс)

**Interfaces:**
- Consumes: `selectSocketConnected` (Task 7). Живой сокет → интервал 60000; мёртвый → текущие значения.

- [ ] **Step 1: Добавить падающий тест деградации**

В `apps/client/src/store/useUnreadCounts.test.ts` добавить кейс: при `socketConnected=true` внутренние запросы вызываются с `pollingInterval: 60000`, при false — с переданным. (Если текущий тест мокает RTK-хуки — проверить аргумент `pollingInterval`; иначе замокать `selectSocketConnected` и проверить возвращаемый интервал через вынесенный helper.)

Ввести чистый helper в `useUnreadCounts.ts`:
```ts
export const effectivePollingInterval = (requested: number, socketLive: boolean): number =>
  socketLive ? 60_000 : requested;
```
и тест:
```ts
import { effectivePollingInterval } from './useUnreadCounts';
it('живой сокет → 60с независимо от запрошенного', () => {
  expect(effectivePollingInterval(20_000, true)).toBe(60_000);
  expect(effectivePollingInterval(20_000, false)).toBe(20_000);
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `cd apps/client && pnpm test -- useUnreadCounts`
Expected: FAIL — `effectivePollingInterval` не экспортирован.

- [ ] **Step 3: Реализовать в useUnreadCounts.ts**

Добавить helper (выше по файлу) и применить в `useUnreadCounts`:
```ts
import { selectSocketConnected } from './realtimeSlice';
// ...
  const socketLive = useAppSelector(selectSocketConnected);
  const queryOpts = {
    skip: !isAuthenticated,
    pollingInterval: effectivePollingInterval(opts.pollingInterval ?? 0, socketLive),
    skipPollingIfUnfocused: true,
  } as const;
```
(Примечание: при `opts.pollingInterval` = 0 и живом сокете вернётся 60000; допустимо — потребители-читатели без интервала: они и так делят кэш с Header; чтобы не включать поллинг у читателей, обернуть: `requested === 0 ? 0 : effective`. Реализовать именно так — см. Step 3a.)

- [ ] **Step 3a: Не включать поллинг у читателей кэша**

Скорректировать helper, чтобы 0 оставался 0:
```ts
export const effectivePollingInterval = (requested: number, socketLive: boolean): number =>
  requested === 0 ? 0 : socketLive ? 60_000 : requested;
```
Обновить тест: `expect(effectivePollingInterval(0, true)).toBe(0)`.

- [ ] **Step 4: Применить в Inbox.tsx**

В `apps/client/src/features/account/Inbox.tsx`: импортировать `selectSocketConnected` и `effectivePollingInterval`, получить `const socketLive = useAppSelector(selectSocketConnected);` и заменить литералы:
- стр. 164: `pollingInterval: effectivePollingInterval(10000, socketLive)`
- стр. 180: `pollingInterval: effectivePollingInterval(6000, socketLive)`

- [ ] **Step 5: Запустить — пройдёт**

Run: `cd apps/client && pnpm test -- useUnreadCounts`
Expected: PASS.

- [ ] **Step 6: Финальный type-check + весь клиентский тест-сьют**

Run: `cd apps/client && pnpm exec tsc --noEmit && pnpm test`
Expected: без ошибок, всё зелёное.

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/store/useUnreadCounts.ts apps/client/src/store/useUnreadCounts.test.ts apps/client/src/features/account/Inbox.tsx
git commit -m "feat(client): degrade polling to 60s safety-net when socket live"
```

> **Конец PHASE B.** Открыть PR `feat/realtime-client-bridge` → `main`.

---

## PHASE C — Проверка и инфраструктура

### Task 12: Env + live-verify + prod-заметка

**Files:**
- Modify: `.env.example` / staging env-доки (добавить `NEXT_PUBLIC_WS_URL`).
- Doc: заметка про sticky-sessions (prod-TODO из спека).

- [ ] **Step 1: Добавить env**

В `.env.example` (и staging/prod env-шаблоны клиента) добавить:
```
# WebSocket-эндпоинт realtime (по умолчанию = хост API, namespace /rt)
NEXT_PUBLIC_WS_URL=http://localhost:4000
```

- [ ] **Step 2: Live-verify по локальному стеку**

Поднять стек (по рецепту проекта: `docker compose ... up`), залогиниться, открыть два браузера (владелец + покупатель). Проверить:
- новое сообщение у одного — мгновенно появляется у второго без ожидания поллинга;
- заявка на тур → бейдж владельца обновляется мгновенно;
- вкладку в фон → сокет дисконнектится (Network WS закрыт), возврат → reconnect + подтягивание.

Зафиксировать результат (скриншот/лог) — предъявить в PR.

- [ ] **Step 3: Prod-заметка (вне охвата реализации)**

В описании PHASE C PR указать явно: **при масштабировании `api` >1 реплики** нужен либо sticky-sessions на Caddy, либо websocket-only транспорт + подтверждённая работа redis-adapter. Сейчас один инстанс — не блокер. Caddy проксирует WS zero-config, правок конфига не требуется.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore: NEXT_PUBLIC_WS_URL + realtime prod note"
```

---

## Self-Review

**Spec coverage:**
- Транспорт socket.io + Gateway → Tasks 1-4. ✅
- Auth через handshake.auth → Tasks 2-3. ✅
- Redis-adapter поверх ioredis → Task 4. ✅
- Тонкие инвалидации (3 точки эмита, после commit) → Tasks 5-6. ✅
- REST-контракт неизменен → эмит не трогает DTO/эндпоинты. ✅
- Клиент: socketClient + bridge + маппинг + флаг → Tasks 7-10. ✅
- Реконнект gap-fill (ALL_REALTIME_TAGS) → Task 10. ✅
- Ротация токена → reconnect по смене `selectAccessToken` в bridge → Task 10. ✅ (уточнение vs спек: реализовано через watch селектора, а не правку `baseQuery.ts` — менее инвазивно, blast-radius меньше.)
- Скрытая вкладка → `skipPollingIfUnfocused` сохранён; сокет-дисконнект на unfocus **не** реализован явным listener'ом — socket.io сам не рвёт связь по visibility. *Гэп относительно спека:* если нужен явный дисконнект на `visibilitychange`, добавить listener в bridge (Task 10) — помечено как возможное расширение, но не включено в MVP-задачи, т.к. idle-WS дёшев и `transports:['websocket']` не держит polling-запросов. **Решение: оставить вне охвата, зафиксировано здесь.**
- Деградация поллинга до 60с → Task 11. ✅
- Тесты backend (authenticator, gateway, эмиты) + frontend (slice, mapping, bridge, degradation) → распределены по задачам. ✅
- Мобилка/FCM не трогаются → нет задач в `notifications/delivery`. ✅
- Caddy zero-config, env, prod-TODO sticky → Task 12. ✅

**Placeholder scan:** один намеренный плейсхолдер — ключ `redis.url` в Task 4 (Step 1 требует подтвердить фактическое имя перед реализацией). Помечен явно. Остальное — конкретный код.

**Type consistency:** `RealtimeInvalidation` идентичен на бэке (`realtime.types.ts`) и фронте (`realtimeInvalidation.ts`); имя события `'invalidate'` и комната `user:${id}` — из Global Constraints, едины; теги совпадают с `baseApi.tagTypes` и константами `chatApi`/`tourRequestsApi`. `RealtimeEmitter.emit`/`setServer`, `WsAuthenticator.verify`, `connectSocket`/`disconnectSocket`, `effectivePollingInterval`, `selectSocketConnected` — сигнатуры согласованы между задачами-производителями и потребителями.
