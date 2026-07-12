import { describe, it, expect } from 'vitest';
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
