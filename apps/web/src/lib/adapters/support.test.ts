import { describe, it, expect } from 'vitest';
import { supportRequestToRow } from './support';
import type { SupportRequest } from '@/store/api/adminTypes';

const BASE: SupportRequest = {
  id: 'aaaabbbb-0000-4000-8000-000000000001',
  user_id: null,
  name: null,
  contact: '+998901234567',
  message: 'Не приходит код',
  status: 'NEW',
  handled_by: null,
  handled_at: null,
  created_at: '2026-07-16T09:30:00.000Z',
};

describe('supportRequestToRow', () => {
  it('гость без имени — автор «Гость», прочерки на необработанном', () => {
    const row = supportRequestToRow(BASE);
    expect(row.author).toBe('Гость');
    expect(row.contact).toBe('+998901234567');
    expect(row.handled).toBe('—');
    expect(row.handledBy).toBe('—');
    expect(row.created).toMatch(/16\.07\.2026/);
  });

  it('имя приоритетнее user_id; user_id усечён при отсутствии имени', () => {
    expect(supportRequestToRow({ ...BASE, name: 'Али', user_id: 'u1' }).author).toBe('Али');
    expect(
      supportRequestToRow({ ...BASE, user_id: 'ccccdddd-0000-4000-8000-000000000002' }).author,
    ).toBe('ccccdddd');
  });

  it('обработанное обращение — дата и обработавший', () => {
    const row = supportRequestToRow({
      ...BASE,
      status: 'RESOLVED',
      handled_by: 'eeeeffff-0000-4000-8000-000000000003',
      handled_at: '2026-07-16T12:00:00.000Z',
    });
    expect(row.handledBy).toBe('eeeeffff');
    expect(row.handled).toMatch(/16\.07\.2026/);
  });
});
