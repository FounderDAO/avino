import { clearRefreshCookie, refreshCookieOptions, setRefreshCookie, REFRESH_COOKIE_NAME } from './refresh-cookie.util';

const makeConfig = (over: Record<string, unknown> = {}) => ({
  get: (k: string) =>
    ({ 'authCookie.secure': true, 'authCookie.domain': '', 'authCookie.maxAgeSec': 100, ...over })[k],
}) as any;

describe('refresh-cookie.util', () => {
  it('refreshCookieOptions: host-only при пустом домене, maxAge в мс', () => {
    const opts = refreshCookieOptions(makeConfig());
    expect(opts).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1/auth', maxAge: 100000 });
    expect(opts.domain).toBeUndefined();
  });

  it('setRefreshCookie кладёт cookie с токеном и опциями', () => {
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as any;
    setRefreshCookie(res, 'tok', makeConfig());
    expect(res.cookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, 'tok', expect.objectContaining({ path: '/api/v1/auth' }));
  });

  it('clearRefreshCookie чистит cookie без maxAge', () => {
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as any;
    clearRefreshCookie(res, makeConfig());
    const [, opts] = res.clearCookie.mock.calls[0];
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, expect.any(Object));
    expect(opts.maxAge).toBeUndefined();
  });
});
