import { WsAuthenticator } from './ws-authenticator';

const config = { get: (k: string) => (k === 'jwt.accessSecret' ? 'secret' : undefined) };

describe('WsAuthenticator', () => {
  it('возвращает null без токена', async () => {
    const jwt = { verifyAsync: jest.fn() };
    const auth = new WsAuthenticator(jwt as never, config as never);
    expect(await auth.verify(undefined)).toBeNull();
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('возвращает null на невалидном токене', async () => {
    const jwt = { verifyAsync: jest.fn().mockRejectedValue(new Error('bad')) };
    const auth = new WsAuthenticator(jwt as never, config as never);
    expect(await auth.verify('x')).toBeNull();
  });

  it('возвращает userId из sub', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1' }) };
    const auth = new WsAuthenticator(jwt as never, config as never);
    expect(await auth.verify('good')).toEqual({ userId: 'u1' });
    expect(jwt.verifyAsync).toHaveBeenCalledWith('good', { secret: 'secret' });
  });
});
