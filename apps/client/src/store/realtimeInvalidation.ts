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
