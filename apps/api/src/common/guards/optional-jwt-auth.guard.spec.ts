import { ExecutionContext, HttpException } from '@nestjs/common';
import { ApiErrorCode } from '../dto/error-response.dto';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

/**
 * Юнит-тесты мягкой Bearer-аутентификации (TASK-051). Проверяется ключевое
 * отличие от {@link JwtAuthGuard}: запрос без токена ПРОХОДИТ (гость), а с
 * токеном — валидируется строго (невалидный → 401).
 */
describe('OptionalJwtAuthGuard', () => {
  const ACCESS_SECRET = 'access-secret';

  let jwt: any;
  let config: any;
  let guard: OptionalJwtAuthGuard;

  const contextWith = (headers: Record<string, string | undefined>) => {
    const request: any = { headers };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { ctx, request };
  };

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    config = {
      get: jest.fn((key: string) =>
        key === 'jwt.accessSecret' ? ACCESS_SECRET : undefined,
      ),
    };
    guard = new OptionalJwtAuthGuard(jwt, config);
  });

  it('passes as guest without an Authorization header and sets no user', async () => {
    const { ctx, request } = contextWith({});

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('passes as guest for a non-bearer scheme', async () => {
    const { ctx, request } = contextWith({ authorization: 'Basic abc' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('attaches user from a valid bearer token', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', roles: ['USER'] });
    const { ctx, request } = contextWith({ authorization: 'Bearer good' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'u1', roles: ['USER'] });
  });

  it('rejects an invalid bearer token with 401 (does not silently downgrade to guest)', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));
    const { ctx } = contextWith({ authorization: 'Bearer bad' });

    const promise = guard.canActivate(ctx);
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    try {
      await promise;
    } catch (e) {
      expect((e as HttpException).getResponse()).toMatchObject({
        code: ApiErrorCode.TOKEN_INVALID,
      });
    }
  });
});
