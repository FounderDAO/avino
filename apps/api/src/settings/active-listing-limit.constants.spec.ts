import { resolveActiveListingLimit } from './active-listing-limit.constants';

describe('resolveActiveListingLimit', () => {
  it('returns stored integer over env default', () => {
    expect(resolveActiveListingLimit('5', 2)).toBe(5);
  });
  it('treats stored "0" as a valid value (no limit)', () => {
    expect(resolveActiveListingLimit('0', 2)).toBe(0);
  });
  it('falls back to env default when unset/blank', () => {
    expect(resolveActiveListingLimit(null, 2)).toBe(2);
    expect(resolveActiveListingLimit(undefined, 3)).toBe(3);
    expect(resolveActiveListingLimit('   ', 4)).toBe(4);
  });
  it('falls back to env default on garbage / non-integer / negative', () => {
    expect(resolveActiveListingLimit('garbage', 2)).toBe(2);
    expect(resolveActiveListingLimit('2.5', 2)).toBe(2);
    expect(resolveActiveListingLimit('-1', 2)).toBe(2);
  });
});
