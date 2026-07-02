import { describe, it, expect } from 'vitest';
import { computeUnreadCounts } from './useUnreadCounts';

describe('computeUnreadCounts', () => {
  it('суммирует unread_count тредов', () => {
    const r = computeUnreadCounts(
      [{ unread_count: 2 }, { unread_count: 0 }, { unread_count: 3 }],
      undefined,
      undefined,
    );
    expect(r.messages).toBe(5);
  });
  it('берёт notifications unread и считает только PENDING-туры', () => {
    const r = computeUnreadCounts(undefined, 4, [
      { status: 'PENDING' as const },
      { status: 'CONFIRMED' as const },
      { status: 'PENDING' as const },
    ]);
    expect(r.notifications).toBe(4);
    expect(r.tours).toBe(2);
  });
  it('total = сумма всех трёх', () => {
    const r = computeUnreadCounts([{ unread_count: 1 }], 2, [
      { status: 'PENDING' as const },
    ]);
    expect(r.total).toBe(4);
  });
  it('всё undefined → нули', () => {
    expect(computeUnreadCounts(undefined, undefined, undefined)).toEqual({
      messages: 0,
      notifications: 0,
      tours: 0,
      total: 0,
    });
  });
});
