import { describe, expect, it } from 'vitest';
import { takenWindowKeys, windowKey } from './tour-slots';

describe('windowKey', () => {
  it('строит ключ HH:MM-HH:MM', () => {
    expect(windowKey({ start: '11:00', end: '13:00' })).toBe('11:00-13:00');
  });
});

describe('takenWindowKeys', () => {
  const slots = [
    { requested_date: '2026-07-03', window_start: '11:00', window_end: '13:00' },
    { requested_date: '2026-07-03', window_start: '15:00', window_end: '17:00' },
    { requested_date: '2026-07-04', window_start: '11:00', window_end: '13:00' },
  ];

  it('возвращает только окна выбранной даты', () => {
    expect(takenWindowKeys(slots, '2026-07-03')).toEqual(
      new Set(['11:00-13:00', '15:00-17:00']),
    );
  });

  it('пустой Set без слотов, без даты или для свободной даты', () => {
    expect(takenWindowKeys(undefined, '2026-07-03').size).toBe(0);
    expect(takenWindowKeys(slots, '').size).toBe(0);
    expect(takenWindowKeys(slots, '2026-07-10').size).toBe(0);
  });
});
