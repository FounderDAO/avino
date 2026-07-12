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
