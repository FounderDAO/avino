import { resolveMinAppBuild } from './min-app-build.constants';

describe('resolveMinAppBuild', () => {
  it('returns stored integer over default', () => {
    expect(resolveMinAppBuild('42', 0)).toBe(42);
  });
  it('treats stored "0" as a valid value (no forced update)', () => {
    expect(resolveMinAppBuild('0', 5)).toBe(0);
  });
  it('defaults to 0 when unset/blank', () => {
    expect(resolveMinAppBuild(null)).toBe(0);
    expect(resolveMinAppBuild(undefined)).toBe(0);
    expect(resolveMinAppBuild('   ')).toBe(0);
  });
  it('falls back to default on garbage / non-integer / negative / too large', () => {
    expect(resolveMinAppBuild('garbage')).toBe(0);
    expect(resolveMinAppBuild('2.5')).toBe(0);
    expect(resolveMinAppBuild('-1')).toBe(0);
    expect(resolveMinAppBuild('1000001')).toBe(0);
  });
  it('accepts the upper bound', () => {
    expect(resolveMinAppBuild('1000000')).toBe(1_000_000);
  });
});
