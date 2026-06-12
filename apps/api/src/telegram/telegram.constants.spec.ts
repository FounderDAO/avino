import { resolveNotificationsEnabled } from './telegram.constants';

describe('resolveNotificationsEnabled', () => {
  it('returns true when stored "true"', () => {
    expect(resolveNotificationsEnabled('true', false)).toBe(true);
  });
  it('returns false when stored "false"', () => {
    expect(resolveNotificationsEnabled('false', true)).toBe(false);
  });
  it('falls back to env default when unset/garbage', () => {
    expect(resolveNotificationsEnabled(null, true)).toBe(true);
    expect(resolveNotificationsEnabled(undefined, false)).toBe(false);
    expect(resolveNotificationsEnabled('garbage', true)).toBe(true);
  });
});
