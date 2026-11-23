import { describe, expect, it, vi } from 'vitest';
import { INDEXNOW_BATCH, INDEXNOW_ENDPOINTS, isValidIndexNowKey, pingIndexNow, sameHostUrls } from './indexnow';

const KEY = 'a1b2c3d4e5f6a7b8';
const BASE = 'https://avino.uz';
const noSleep = vi.fn(async () => {});

const ok = (status = 200) => ({ status }) as Response;

describe('isValidIndexNowKey', () => {
  it('accepts 8–128 [a-zA-Z0-9-] and rejects the rest', () => {
    expect(isValidIndexNowKey(KEY)).toBe(true);
    expect(isValidIndexNowKey('short')).toBe(false);
    expect(isValidIndexNowKey('has space here')).toBe(false);
    expect(isValidIndexNowKey(undefined)).toBe(false);
  });
});

describe('sameHostUrls', () => {
  it('keeps only our host and drops duplicates and junk', () => {
    expect(
      sameHostUrls(
        [`${BASE}/ru/listing/1`, `${BASE}/ru/listing/1`, 'https://evil.com/x', 'not a url', `${BASE}/uz/listing/1`],
        BASE,
      ),
    ).toEqual([`${BASE}/ru/listing/1`, `${BASE}/uz/listing/1`]);
  });
});

describe('pingIndexNow', () => {
  it('posts host, key, keyLocation and urlList to both endpoints', async () => {
    const fetchImpl = vi.fn(async () => ok(200));
    const results = await pingIndexNow([`${BASE}/ru/listing/1`], { key: KEY, base: BASE, fetchImpl, sleep: noSleep });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map((c) => (c as unknown[])[0])).toEqual([...INDEXNOW_ENDPOINTS]);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ host: 'avino.uz', key: KEY, keyLocation: `${BASE}/${KEY}.txt`, urlList: [`${BASE}/ru/listing/1`] });
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('retries 429/5xx with backoff, not 4xx', async () => {
    const statuses = [429, 503, 202, 422];
    const fetchImpl = vi.fn(async () => ok(statuses.shift()));
    const sleep = vi.fn(async () => {});
    const results = await pingIndexNow([`${BASE}/ru`], { key: KEY, base: BASE, fetchImpl, sleep });
    expect(results[0]).toMatchObject({ status: 202, attempts: 3, ok: true });
    expect(results[1]).toMatchObject({ status: 422, attempts: 1, ok: false });
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([1000, 2000]);
  });

  it('treats network errors as retryable and reports failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    const results = await pingIndexNow([`${BASE}/ru`], { key: KEY, base: BASE, fetchImpl, sleep: noSleep, maxAttempts: 2 });
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ status: null, attempts: 2, ok: false });
  });

  it('splits into batches of 10,000', async () => {
    const fetchImpl = vi.fn(async () => ok(200));
    const urls = Array.from({ length: INDEXNOW_BATCH + 5 }, (_, i) => `${BASE}/ru/listing/${i}`);
    const results = await pingIndexNow(urls, { key: KEY, base: BASE, fetchImpl, sleep: noSleep });
    expect(results.map((r) => r.batch)).toEqual([0, 0, 1, 1]);
    const second = JSON.parse((fetchImpl.mock.calls[2] as unknown as [string, RequestInit])[1].body as string);
    expect(second.urlList).toHaveLength(5);
  });

  it('refuses to run without a valid key', async () => {
    await expect(pingIndexNow([`${BASE}/ru`], { key: 'bad', base: BASE })).rejects.toThrow('INDEXNOW_KEY');
  });
});
