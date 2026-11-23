import { describe, expect, it } from 'vitest';
import { MAX_SYNC_IDS, parseSyncBody, syncTags, syncUrls } from './sync';
import { bearerAuthorized } from './bearer';

const L1 = 'd64bed72-8421-4249-967b-b68d85065dcd';
const L2 = '3c2e8ab9-7480-4ebd-aef4-4be20d8d0019';
const A1 = 'c2d23e5d-76b2-40ce-bfb0-36f04471373a';

describe('parseSyncBody', () => {
  it('accepts listing and agent ids, dedupes and lowercases', () => {
    expect(parseSyncBody({ listing_ids: [L1, L1.toUpperCase()], agent_ids: [A1] })).toEqual({
      listingIds: [L1],
      agentIds: [A1],
    });
    expect(parseSyncBody({ agent_ids: [A1] })).toEqual({ listingIds: [], agentIds: [A1] });
  });

  it.each([
    [null],
    ['text'],
    [{}],
    [{ listing_ids: [] }],
    [{ listing_ids: ['not-a-uuid'] }],
    [{ listing_ids: L1 }],
    [{ listing_ids: [L1], agent_ids: [42] }],
  ])('rejects %j', (body) => {
    expect(parseSyncBody(body)).toHaveProperty('error');
  });

  it('caps the number of ids', () => {
    const ids = Array.from({ length: MAX_SYNC_IDS + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect(parseSyncBody({ listing_ids: ids })).toHaveProperty('error');
  });
});

describe('syncTags', () => {
  it('a listing change drops its page, search results, sitemap and agent pages', () => {
    expect(syncTags({ listingIds: [L1, L2], agentIds: [] }).sort()).toEqual(
      ['agents', `listing:${L1}`, `listing:${L2}`, 'search', 'sitemap'].sort(),
    );
  });

  it('an agent change drops only agent tags', () => {
    expect(syncTags({ listingIds: [], agentIds: [A1] }).sort()).toEqual([`agent:${A1}`, 'agents'].sort());
  });
});

describe('syncUrls', () => {
  it('lists every language version', () => {
    expect(syncUrls({ listingIds: [L1], agentIds: [A1] })).toEqual([
      `https://avino.uz/uz/listing/${L1}`,
      `https://avino.uz/ru/listing/${L1}`,
      `https://avino.uz/en/listing/${L1}`,
      `https://avino.uz/uz/agents/${A1}`,
      `https://avino.uz/ru/agents/${A1}`,
      `https://avino.uz/en/agents/${A1}`,
    ]);
  });
});

describe('bearerAuthorized', () => {
  it('requires the exact secret and a configured secret', () => {
    expect(bearerAuthorized('Bearer s3cret', 's3cret')).toBe(true);
    expect(bearerAuthorized('Bearer s3cre', 's3cret')).toBe(false);
    expect(bearerAuthorized('s3cret', 's3cret')).toBe(false);
    expect(bearerAuthorized(null, 's3cret')).toBe(false);
    expect(bearerAuthorized('Bearer ', '')).toBe(false);
    expect(bearerAuthorized('Bearer x', undefined)).toBe(false);
  });
});
