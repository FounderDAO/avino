import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANDING_MIN_LISTINGS, fetchDistrictCounts, fetchLandingPaths } from './sitemapData';

const facets = {
  SALE: { by_region: [{ id: 'r-tash', count: 40 }, { id: 'r-small', count: 2 }], by_district: [{ id: 'd-yun', count: 30 }, { id: 'd-one', count: 1 }] },
  RENT: { by_region: [{ id: 'r-tash', count: 8 }], by_district: [{ id: 'd-yun', count: LANDING_MIN_LISTINGS }] },
};

function stubFacets() {
  const fetchMock = vi.fn(async (url: string) => {
    const tx = new URL(url).searchParams.get('transaction_type') as 'SALE' | 'RENT';
    return { ok: true, status: 200, json: async () => facets[tx] };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('sitemap data from /search/facets (backend SEO AUD-12)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists only landings with at least 3 listings, in canonical form', async () => {
    stubFacets();
    expect(await fetchLandingPaths()).toEqual([
      '/search?tx=SALE&region_id=r-tash',
      '/search?tx=SALE&district_id=d-yun',
      '/search?tx=RENT&region_id=r-tash',
      '/search?tx=RENT&district_id=d-yun',
    ]);
  });

  it('district counts come from facets in two requests', async () => {
    const fetchMock = stubFacets();
    const counts = await fetchDistrictCounts();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(counts[0]).toEqual({ tx: 'SALE', districtId: 'd-yun', count: 30 });
  });

  it('old API without facets: no landing file (no full walk for it)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    expect(await fetchLandingPaths()).toEqual([]);
  });
});
