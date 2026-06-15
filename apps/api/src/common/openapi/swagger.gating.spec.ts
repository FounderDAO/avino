import { resolveSwaggerEnabled, resolveSwaggerGating } from './swagger.gating';

describe('resolveSwaggerEnabled', () => {
  it('honors an explicit "true" flag even in production', () => {
    expect(resolveSwaggerEnabled('true', 'production')).toBe(true);
  });

  it('honors an explicit "false" flag even in development', () => {
    expect(resolveSwaggerEnabled('false', 'development')).toBe(false);
  });

  it('defaults to enabled outside production when the flag is unset', () => {
    expect(resolveSwaggerEnabled(undefined, 'development')).toBe(true);
  });

  it('defaults to disabled in production when the flag is unset', () => {
    expect(resolveSwaggerEnabled(undefined, 'production')).toBe(false);
  });
});

describe('resolveSwaggerGating', () => {
  it('mounts nothing when disabled', () => {
    expect(resolveSwaggerGating({ enabled: false })).toEqual({
      mountPublic: false,
      mountInternal: false,
    });
  });

  it('mounts public but not internal when credentials are missing', () => {
    expect(resolveSwaggerGating({ enabled: true })).toEqual({
      mountPublic: true,
      mountInternal: false,
    });
  });

  it('mounts both and exposes basic-auth credentials when present', () => {
    expect(
      resolveSwaggerGating({
        enabled: true,
        basicAuthUser: 'u',
        basicAuthPass: 'p',
      }),
    ).toEqual({
      mountPublic: true,
      mountInternal: true,
      basicAuth: { user: 'u', pass: 'p' },
    });
  });
});
