import { hashRefreshToken } from './token.util';

describe('token.util', () => {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig';
  const secret = 'refresh-secret';

  it('is deterministic for the same token+secret (btree lookup)', () => {
    expect(hashRefreshToken(token, secret)).toBe(
      hashRefreshToken(token, secret),
    );
  });

  it('produces a 64-char hex digest that hides the token', () => {
    const hash = hashRefreshToken(token, secret);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });

  it('depends on the secret (pepper) — different secret, different hash', () => {
    expect(hashRefreshToken(token, secret)).not.toBe(
      hashRefreshToken(token, 'another-secret'),
    );
  });

  it('depends on the token — different token, different hash', () => {
    expect(hashRefreshToken(token, secret)).not.toBe(
      hashRefreshToken(`${token}x`, secret),
    );
  });
});
