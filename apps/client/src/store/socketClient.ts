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
