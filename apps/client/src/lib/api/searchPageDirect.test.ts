import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPageParamSupport, searchListingsPageAt } from './listings';

const okPage = (ids: string[], total = 300) => ({
  ok: true,
  status: 200,
  json: async () => ({ data: ids.map((id) => ({ id, created_at: '2026-11-01T00:00:00Z' })), meta: { limit: 60, total, next_cursor: 'c' } }),
});

describe('searchListingsPageAt with ?page= (backend SEO AUD-13)', () => {
  beforeEach(() => __resetPageParamSupport());
  afterEach(() => vi.unstubAllGlobals());

  it('asks the API for page N in one request', async () => {
    const fetchMock = vi.fn(async () => okPage(['a']));
    vi.stubGlobal('fetch', fetchMock);
    const page = await searchListingsPageAt({ tx: 'SALE' }, 'ru', 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('page=3');
    expect(page?.total).toBe(300);
  });

  it('an empty page means out of range → null (page answers 404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okPage([])));
    expect(await searchListingsPageAt({ tx: 'SALE' }, 'ru', 9)).toBeNull();
  });

  it('falls back to walking cursors when the old API rejects ?page=', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'VALIDATION_ERROR', details: [{ field: 'page', issue: 'property page should not exist' }] } }),
      })
      .mockResolvedValue(okPage(['x'], 200));
    vi.stubGlobal('fetch', fetchMock);
    const page = await searchListingsPageAt({ tx: 'SALE' }, 'ru', 2);
    expect(page?.listings).toHaveLength(1);
    // 1 отказ ?page= + 2 страницы курсором (1-я → курсор 2-й).
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String((fetchMock.mock.calls[1] as unknown[])[0])).not.toContain('page=');
  });
});
