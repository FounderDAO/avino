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
// pingInterval/pingTimeout зафиксированы явно (= дефолты socket.io v4): ping
// каждые 25 c держит WS живым внутри 100-секундного idle-окна Cloudflare Free —
// апгрейд socket.io или «оптимизация» не должны молча вывести ping за лимит.
@WebSocketGateway({ namespace: '/rt', pingInterval: 25000, pingTimeout: 20000 })
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
