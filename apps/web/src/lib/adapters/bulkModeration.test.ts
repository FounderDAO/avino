import { describe, expect, it, vi } from 'vitest';
import { bulkModerationToast, runBulkModeration } from './bulkModeration';

const apiError = (status: number, code: string, message = '') => ({
  status,
  data: { error: { code, message } },
});

describe('runBulkModeration', () => {
  it('отправляет действие по каждому выбранному id и считает успехи', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const res = await runBulkModeration(['a', 'b', 'c'], run);
    expect(run.mock.calls.map((c) => c[0]).sort()).toEqual(['a', 'b', 'c']);
    expect(res).toEqual({ ok: 3, skipped: {} });
  });

  it('не падает на отказах — группирует их по причине', async () => {
    const run = vi.fn(async (id: string) => {
      if (id === 'sold') throw apiError(422, 'INVALID_STATUS_TRANSITION');
      if (id === 'no-tr') {
        throw apiError(422, 'VALIDATION_ERROR', 'Translations required for all languages before publishing');
      }
      if (id === 'gone') throw apiError(404, 'NOT_FOUND');
      if (id === 'net') throw { status: 'FETCH_ERROR' };
    });
    const res = await runBulkModeration(['ok', 'sold', 'no-tr', 'gone', 'net', 'sold'], run);
    expect(res.ok).toBe(1);
    expect(res.skipped).toEqual({ status: 2, translations: 1, notFound: 1, other: 1 });
  });

  it('держит не больше 5 запросов одновременно', async () => {
    let active = 0;
    let peak = 0;
    const run = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active -= 1;
    });
    await runBulkModeration(Array.from({ length: 23 }, (_, i) => String(i)), run);
    expect(run).toHaveBeenCalledTimes(23);
    expect(peak).toBeLessThanOrEqual(5);
  });
});

describe('bulkModerationToast', () => {
  it('все успешно — только счётчик', () => {
    expect(bulkModerationToast('ARCHIVE', { ok: 4, skipped: {} })).toBe('Перемещено в архив: 4');
    expect(bulkModerationToast('APPROVE', { ok: 2, skipped: {} })).toBe('Одобрено: 2');
  });

  it('частичный успех — честно перечисляет пропущенные с причинами', () => {
    expect(
      bulkModerationToast('ARCHIVE', { ok: 3, skipped: { status: 2, other: 1 } }),
    ).toBe('Перемещено в архив: 3. Пропущено: 3 (статус не позволяет — 2, ошибка — 1)');
  });

  it('ничего не получилось — не рапортует об успехе', () => {
    expect(bulkModerationToast('APPROVE', { ok: 0, skipped: { translations: 2 } })).toBe(
      'Одобрено: 0. Пропущено: 2 (нет переводов — 2)',
    );
  });
});
