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
