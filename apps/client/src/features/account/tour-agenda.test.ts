import { describe, expect, it } from 'vitest';
import { mergeUpcoming } from './tour-agenda';
import type { TourRequestItem } from '@/store/api/tourRequestsApi';

const make = (over: Partial<TourRequestItem>): TourRequestItem => ({
  id: 'TR1',
  listing_id: 'L1',
  requester_id: 'U1',
  status: 'CONFIRMED',
  requested_date: '2026-07-10',
  window_start: '07:00',
  window_end: '10:00',
  requester_name: 'Гость',
  requester_phone: '+998900000001',
  message: null,
  created_at: '2026-07-04T00:00:00.000Z',
  listing: { id: 'L1', title: 'Квартира', photo_url: null },
  ...over,
});

describe('mergeUpcoming', () => {
  it('склеивает обе роли и сортирует по дате, затем по окну', () => {
    const incoming = [make({ id: 'A', requested_date: '2026-07-12' })];
    const outgoing = [
      make({ id: 'B', requested_date: '2026-07-10', window_start: '11:00' }),
      make({ id: 'C', requested_date: '2026-07-10', window_start: '07:00' }),
    ];
    const res = mergeUpcoming(incoming, outgoing);
    expect(res.map((e) => e.item.id)).toEqual(['C', 'B', 'A']);
    expect(res.map((e) => e.role)).toEqual(['guest', 'guest', 'host']);
  });

  it('переживает undefined с обеих сторон', () => {
    expect(mergeUpcoming(undefined, undefined)).toEqual([]);
  });
});
