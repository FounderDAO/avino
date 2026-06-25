import { resolveMapHoverRecenter } from './map-hover-recenter-flag.constants';

describe('resolveMapHoverRecenter', () => {
  it('returns true when stored "true"', () => {
    expect(resolveMapHoverRecenter('true', false)).toBe(true);
  });
  it('returns false when stored "false"', () => {
    expect(resolveMapHoverRecenter('false', true)).toBe(false);
  });
  it('falls back to env default when unset/garbage', () => {
    expect(resolveMapHoverRecenter(null, true)).toBe(true);
    expect(resolveMapHoverRecenter(undefined, false)).toBe(false);
    expect(resolveMapHoverRecenter('garbage', true)).toBe(true);
  });
});
