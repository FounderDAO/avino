import { describe, expect, it } from 'vitest';
import { pageHref, pageWindow, parsePageParam, totalPages } from './pagination';

describe('parsePageParam', () => {
  it('defaults to 1 and accepts positive integers', () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam('2')).toBe(2);
    expect(parsePageParam(['7', '8'])).toBe(7);
  });

  it.each(['0', '-1', '1.5', 'abc', '', '02', '99999'])('rejects %j', (raw) => {
    expect(parsePageParam(raw)).toBeNull();
  });
});

describe('totalPages', () => {
  it('rounds up, keeps at least one page and caps at 50', () => {
    expect(totalPages(0, 60)).toBe(1);
    expect(totalPages(60, 60)).toBe(1);
    expect(totalPages(61, 60)).toBe(2);
    expect(totalPages(10_000, 60)).toBe(50);
  });
});

describe('pageWindow', () => {
  it('shows every page when there are few', () => {
    expect(pageWindow(1, 4)).toEqual([1, 2, 3, 4]);
  });

  it('collapses distant ranges into gaps', () => {
    expect(pageWindow(10, 20)).toEqual([1, null, 8, 9, 10, 11, 12, null, 20]);
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, null, 20]);
  });

  it('fills a single-page gap with the page itself', () => {
    expect(pageWindow(5, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('pageHref', () => {
  it('keeps filters, drops cursor and writes page only above 1', () => {
    const sp = { tx: 'SALE', type: ['HOUSE', 'LAND'], cursor: 'abc', page: '3' };
    expect(pageHref('/search', sp, 2)).toBe('/search?tx=SALE&type=HOUSE&type=LAND&page=2');
    expect(pageHref('/search', sp, 1)).toBe('/search?tx=SALE&type=HOUSE&type=LAND');
    expect(pageHref('/agents/a1', {}, 1)).toBe('/agents/a1');
  });
});
