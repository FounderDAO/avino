import { resolvePromotionsEnabled } from './promotions-flag.constants';

describe('resolvePromotionsEnabled', () => {
  it('returns true when stored "true"', () => {
    expect(resolvePromotionsEnabled('true', false)).toBe(true);
  });
  it('returns false when stored "false"', () => {
    expect(resolvePromotionsEnabled('false', true)).toBe(false);
  });
  it('falls back to env default when unset/garbage', () => {
    expect(resolvePromotionsEnabled(null, true)).toBe(true);
    expect(resolvePromotionsEnabled(undefined, false)).toBe(false);
    expect(resolvePromotionsEnabled('garbage', true)).toBe(true);
  });
});
