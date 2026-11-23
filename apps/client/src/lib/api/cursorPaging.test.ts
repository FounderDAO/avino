import { describe, expect, it, vi } from 'vitest';
import { CursorChainCache, MAX_NUMBERED_PAGES, fetchPageByNumber } from './cursorPaging';

/** Фейковая выдача из `n` страниц: курсор страницы k — `c<k>`. */
function fakeApi(n: number) {
  const calls: (string | undefined)[] = [];
  const fetchPage = vi.fn(async (cursor: string | undefined) => {
    calls.push(cursor);
    const index = cursor ? Number(cursor.slice(1)) : 1;
    return { index, nextCursor: index < n ? `c${index + 1}` : null };
  });
  return { fetchPage, calls };
}

describe('fetchPageByNumber', () => {
  it('walks cursors to the requested page', async () => {
    const { fetchPage, calls } = fakeApi(5);
    const page = await fetchPageByNumber('k', 3, fetchPage, new CursorChainCache());
    expect(page?.index).toBe(3);
    expect(calls).toEqual([undefined, 'c2', 'c3']);
  });

  it('reuses the cached cursor chain', async () => {
    const cache = new CursorChainCache();
    await fetchPageByNumber('k', 3, fakeApi(5).fetchPage, cache);
    const { fetchPage, calls } = fakeApi(5);
    expect((await fetchPageByNumber('k', 4, fetchPage, cache))?.index).toBe(4);
    expect(calls).toEqual(['c3', 'c4']);
    const again = fakeApi(5);
    expect((await fetchPageByNumber('k', 2, again.fetchPage, cache))?.index).toBe(2);
    expect(again.calls).toEqual(['c2']);
  });

  it('returns null past the last page and outside 1..MAX', async () => {
    const cache = new CursorChainCache();
    expect(await fetchPageByNumber('k', 3, fakeApi(2).fetchPage, cache)).toBeNull();
    expect(await fetchPageByNumber('k', 0, fakeApi(2).fetchPage, cache)).toBeNull();
    expect(await fetchPageByNumber('k', MAX_NUMBERED_PAGES + 1, fakeApi(99).fetchPage, cache)).toBeNull();
  });

  it('propagates API errors instead of returning null', async () => {
    const failing = async () => {
      throw new Error('API 503');
    };
    await expect(fetchPageByNumber('k', 2, failing, new CursorChainCache())).rejects.toThrow('API 503');
  });

  it('expires chains after the TTL', async () => {
    let now = 0;
    const cache = new CursorChainCache(1000, 10, () => now);
    await fetchPageByNumber('k', 3, fakeApi(5).fetchPage, cache);
    now = 2000;
    const { fetchPage, calls } = fakeApi(5);
    await fetchPageByNumber('k', 3, fetchPage, cache);
    expect(calls).toEqual([undefined, 'c2', 'c3']);
  });

  it('evicts the oldest chain above the size limit', () => {
    const cache = new CursorChainCache(60_000, 2);
    cache.set('a', [undefined, 'x']);
    cache.set('b', [undefined, 'y']);
    cache.set('c', [undefined, 'z']);
    expect(cache.get('a')).toEqual([undefined]);
    expect(cache.get('c')).toEqual([undefined, 'z']);
  });
});
