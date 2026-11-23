import { describe, expect, it } from 'vitest';
import {
  AvailabilityCache,
  LISTING_PATH_RE,
  REVIEW_GRACE_MS,
  classifyListingResponse,
} from './listingAvailability';

const NOW = Date.parse('2026-11-23T12:00:00.000Z');
const underReview = (started: string | null) => ({
  error: { code: 'UNDER_REVIEW', meta: { published_at: '2026-06-01T00:00:00.000Z', review_started_at: started } },
});

describe('LISTING_PATH_RE', () => {
  it('matches only the listing detail path', () => {
    expect('/ru/listing/d64bed72-8421-4249-967b-b68d85065dcd'.match(LISTING_PATH_RE)?.[2]).toBe(
      'd64bed72-8421-4249-967b-b68d85065dcd',
    );
    expect(LISTING_PATH_RE.test('/uz/listing/d64bed72-8421-4249-967b-b68d85065dcd/')).toBe(true);
    expect(LISTING_PATH_RE.test('/ru/listing/d64bed72-8421-4249-967b-b68d85065dcd/mortgage')).toBe(false);
    expect(LISTING_PATH_RE.test('/ru/listing/not-a-uuid')).toBe(false);
    expect(LISTING_PATH_RE.test('/de/listing/d64bed72-8421-4249-967b-b68d85065dcd')).toBe(false);
  });
});

describe('classifyListingResponse', () => {
  it('410 / GONE → gone', () => {
    expect(classifyListingResponse(410, { error: { code: 'GONE' } }, NOW)).toEqual({ kind: 'gone' });
  });

  it('UNDER_REVIEW within 7 days → under_review', () => {
    expect(classifyListingResponse(404, underReview('2026-11-20T12:00:00.000Z'), NOW)).toEqual({ kind: 'under_review' });
    expect(classifyListingResponse(404, underReview(null), NOW)).toEqual({ kind: 'under_review' });
  });

  it('UNDER_REVIEW longer than 7 days → pass (page answers 404)', () => {
    const old = new Date(NOW - REVIEW_GRACE_MS - 1000).toISOString();
    expect(classifyListingResponse(404, underReview(old), NOW)).toEqual({ kind: 'pass' });
  });

  it('active, not found and API errors pass through', () => {
    expect(classifyListingResponse(200, { data: {} }, NOW)).toEqual({ kind: 'pass' });
    expect(classifyListingResponse(404, { error: { code: 'NOT_FOUND' } }, NOW)).toEqual({ kind: 'pass' });
    expect(classifyListingResponse(500, null, NOW)).toEqual({ kind: 'pass' });
  });
});

describe('AvailabilityCache', () => {
  it('expires entries by kind and evicts the oldest', () => {
    let now = 0;
    const cache = new AvailabilityCache(2, () => now);
    cache.set('a', { kind: 'pass' });
    cache.set('b', { kind: 'gone' });
    now = 61_000;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toEqual({ kind: 'gone' });
    cache.set('c', { kind: 'under_review' });
    cache.set('d', { kind: 'under_review' });
    expect(cache.get('b')).toBeUndefined();
  });
});
