import { describe, expect, it } from 'vitest';
import { indexClosedListings, isClosedListing, offerAvailability } from './listingStatus';

describe('offerAvailability', () => {
  it('maps closed statuses and never says InStock for them', () => {
    expect(offerAvailability({ status: 'SOLD' })).toBe('https://schema.org/SoldOut');
    expect(offerAvailability({ status: 'RENTED' })).toBe('https://schema.org/Discontinued');
    expect(offerAvailability({ status: 'ACTIVE' })).toBe('https://schema.org/InStock');
    expect(offerAvailability({ status: undefined })).toBe('https://schema.org/InStock');
  });
});

describe('isClosedListing', () => {
  it('is true only for SOLD and RENTED', () => {
    expect(isClosedListing({ status: 'SOLD' })).toBe(true);
    expect(isClosedListing({ status: 'RENTED' })).toBe(true);
    expect(isClosedListing({ status: 'ACTIVE' })).toBe(false);
  });
});

describe('indexClosedListings', () => {
  it('defaults to true and turns off only on "false"', () => {
    expect(indexClosedListings(undefined)).toBe(true);
    expect(indexClosedListings('true')).toBe(true);
    expect(indexClosedListings('false')).toBe(false);
  });
});
