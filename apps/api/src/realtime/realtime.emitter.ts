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
