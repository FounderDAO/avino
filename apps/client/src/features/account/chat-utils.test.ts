import { describe, it, expect } from 'vitest';
import {
  buildMessageRows,
  localDayKey,
  mergeMessages,
  lastMessagePreview,
  type ChatMessage,
} from './chat-utils';

const ME = 'me';
const THEM = 'them';

function msg(
  id: string,
  created_at: string,
  sender_id: string | null,
  body = 'x',
): ChatMessage {
  return { id, thread_id: 't1', sender_id, body, is_read: false, created_at };
}

describe('mergeMessages', () => {
  it('склеивает старые и свежие в ASC без дублей по id', () => {
    const older = [
      msg('a', '2026-06-10T10:00:00Z', THEM),
      msg('b', '2026-06-10T10:01:00Z', ME),
    ];
    const latest = [
      // 'b' перекрывается на стыке поллинга — должен остаться один раз.
      msg('b', '2026-06-10T10:01:00Z', ME),
      msg('c', '2026-06-10T10:02:00Z', THEM),
    ];
    const out = mergeMessages(older, latest);
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('сортирует вперемешку поступившие реплики по времени', () => {
    const out = mergeMessages(
      [msg('c', '2026-06-10T10:02:00Z', ME)],
      [msg('a', '2026-06-10T10:00:00Z', THEM)],
    );
    expect(out.map((m) => m.id)).toEqual(['a', 'c']);
  });
});

describe('buildMessageRows', () => {
  it('ставит разделитель на каждый новый день, реплики идут ASC', () => {
    const rows = buildMessageRows(
      [
        msg('a', '2026-06-10T10:00:00Z', THEM),
        msg('b', '2026-06-11T09:00:00Z', ME),
      ],
      ME,
    );
    expect(rows.map((r) => r.kind)).toEqual(['day', 'msg', 'day', 'msg']);
    const mineFlags = rows
      .filter((r): r is Extract<typeof r, { kind: 'msg' }> => r.kind === 'msg')
      .map((r) => r.mine);
    expect(mineFlags).toEqual([false, true]);
  });

  it('группирует подряд идущие реплики одного автора в пределах окна', () => {
    const rows = buildMessageRows(
      [
        msg('a', '2026-06-10T10:00:00Z', ME),
        msg('b', '2026-06-10T10:01:00Z', ME), // +1м, тот же автор → grouped
        msg('c', '2026-06-10T10:30:00Z', ME), // +29м → новая пачка
        msg('d', '2026-06-10T10:30:30Z', THEM), // смена автора → не grouped
      ],
      ME,
    );
    const msgs = rows.filter(
      (r): r is Extract<typeof r, { kind: 'msg' }> => r.kind === 'msg',
    );
    expect(msgs.map((r) => r.grouped)).toEqual([false, true, false, false]);
  });

  it('реплика на новый день не grouped даже от того же автора', () => {
    // 24ч между репликами → разные локальные дни в любом часовом поясе.
    const rows = buildMessageRows(
      [
        msg('a', '2026-06-10T10:00:00Z', ME),
        msg('b', '2026-06-11T10:00:00Z', ME), // другой день → новая пачка
      ],
      ME,
    );
    const grouped = rows
      .filter((r): r is Extract<typeof r, { kind: 'msg' }> => r.kind === 'msg')
      .map((r) => r.grouped);
    expect(grouped).toEqual([false, false]);
  });
});

describe('lastMessagePreview', () => {
  it('префиксует свои реплики ярлыком «Вы»', () => {
    expect(
      lastMessagePreview({ body: 'Привет', sender_id: ME }, ME, 'Вы'),
    ).toBe('Вы: Привет');
  });

  it('чужие реплики — без префикса, схлопывает пробелы', () => {
    expect(
      lastMessagePreview({ body: '  Да,\n конечно ', sender_id: THEM }, ME, 'Вы'),
    ).toBe('Да, конечно');
  });

  it('null/пустое тело → null (фолбэк на цену/статус)', () => {
    expect(lastMessagePreview(null, ME, 'Вы')).toBeNull();
    expect(
      lastMessagePreview({ body: '   ', sender_id: THEM }, ME, 'Вы'),
    ).toBeNull();
  });
});

describe('localDayKey', () => {
  it('возвращает YYYY-MM-DD', () => {
    expect(localDayKey('2026-06-14T07:10:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
