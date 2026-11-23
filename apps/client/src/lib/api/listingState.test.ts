import { afterEach, describe, expect, it, vi } from 'vitest';
import { getListingById, getListingState } from './listings';

const ID = '3c2e8ab9-7480-4ebd-aef4-4be20d8d0019';

function stub(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const underReview = (startedDaysAgo: number) => ({
  error: {
    code: 'UNDER_REVIEW',
    meta: {
      published_at: '2026-06-01T00:00:00.000Z',
      review_started_at: new Date(Date.now() - startedDaysAgo * 86_400_000).toISOString(),
    },
  },
});

describe('getListingState (SEO AUD-10, контракт B)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('410 GONE → gone', async () => {
    stub(410, { error: { code: 'GONE' } });
    expect(await getListingState(ID)).toEqual({ kind: 'gone' });
  });

  it('404 UNDER_REVIEW within 7 days → under_review', async () => {
    stub(404, underReview(1));
    expect(await getListingState(ID)).toEqual({ kind: 'under_review' });
  });

  it('404 UNDER_REVIEW longer than 7 days → not_found', async () => {
    stub(404, underReview(8));
    expect(await getListingState(ID)).toEqual({ kind: 'not_found' });
  });

  it('plain 404 → not_found', async () => {
    stub(404, { error: { code: 'NOT_FOUND' } });
    expect(await getListingState(ID)).toEqual({ kind: 'not_found' });
  });

  it('non-UUID id → not_found without calling the API', async () => {
    const fetchMock = stub(200, {});
    expect(await getListingState('not-a-uuid')).toEqual({ kind: 'not_found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('5xx is thrown, not turned into a 404', async () => {
    stub(503, null);
    await expect(getListingState(ID)).rejects.toThrow('API 503');
  });

  it('getListingById hides removed and under-review listings', async () => {
    stub(410, { error: { code: 'GONE' } });
    expect(await getListingById(ID)).toBeNull();
    stub(404, underReview(1));
    expect(await getListingById(ID)).toBeNull();
  });
});
