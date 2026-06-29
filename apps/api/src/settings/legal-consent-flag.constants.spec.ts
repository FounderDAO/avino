import {
  resolveLegalConsentRequired,
  resolveLegalConsentVersion,
} from './legal-consent-flag.constants';

describe('resolveLegalConsentRequired', () => {
  it("stored 'true'/'false' wins over env default", () => {
    expect(resolveLegalConsentRequired('true', false)).toBe(true);
    expect(resolveLegalConsentRequired('false', true)).toBe(false);
  });
  it('falls back to env default when unset/garbage', () => {
    expect(resolveLegalConsentRequired(null, true)).toBe(true);
    expect(resolveLegalConsentRequired(undefined, false)).toBe(false);
    expect(resolveLegalConsentRequired('yes', false)).toBe(false);
  });
});

describe('resolveLegalConsentVersion', () => {
  it('parses a stored positive integer', () => {
    expect(resolveLegalConsentVersion('3', 1)).toBe(3);
  });
  it('falls back to env default for null/garbage/<1', () => {
    expect(resolveLegalConsentVersion(null, 1)).toBe(1);
    expect(resolveLegalConsentVersion('abc', 2)).toBe(2);
    expect(resolveLegalConsentVersion('0', 1)).toBe(1);
    expect(resolveLegalConsentVersion('-5', 4)).toBe(4);
    expect(resolveLegalConsentVersion('1abc', 2)).toBe(2);
    expect(resolveLegalConsentVersion('3.5', 1)).toBe(1);
  });
});
