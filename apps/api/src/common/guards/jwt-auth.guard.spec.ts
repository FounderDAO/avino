import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from '../dto/error-response.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Юнит-тесты Bearer-аутентификации (TASK-044). JwtService/ConfigService мокаются —
 * проверяются извлечение токена, успешная привязка `request.user` и маппинг
 * ошибок подписи на стабильные коды (UNAUTHORIZED/TOKEN_EXPIRED/TOKEN_INVALID).
 */
describe('JwtAuthGuard', () => {
  const ACCESS_SECRET = 'access-secret';

  let jwt: any;
  let config: any;
  let guard: JwtAuthGuard;

  /** Собрать ExecutionContext с заданными заголовками; возвращает и сам request. */
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
    guard = new JwtAuthGuard(jwt, config);
  });

  it('attaches user from a valid access token', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', roles: ['USER', 'ADMIN'] });
    const { ctx, request } = contextWith({ authorization: 'Bearer good.token' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('good.token', {
      secret: ACCESS_SECRET,
    });
    expect(request.user).toEqual({ id: 'u1', roles: ['USER', 'ADMIN'] });
  });

  it('defaults roles to [] when token has none', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u2' });
    const { ctx, request } = contextWith({ authorization: 'Bearer t' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'u2', roles: [] });
  });

  it('accepts a case-insensitive bearer scheme', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u3', roles: [] });
    const { ctx } = contextWith({ authorization: 'bearer t' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects a missing Authorization header with 401 UNAUTHORIZED', async () => {
    const { ctx } = contextWith({});
    await expectError(guard.canActivate(ctx), ApiErrorCode.UNAUTHORIZED);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects a non-bearer scheme with 401 UNAUTHORIZED', async () => {
    const { ctx } = contextWith({ authorization: 'Basic abc' });
    await expectError(guard.canActivate(ctx), ApiErrorCode.UNAUTHORIZED);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('maps an expired token to 401 TOKEN_EXPIRED', async () => {
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';
    jwt.verifyAsync.mockRejectedValue(err);
    const { ctx } = contextWith({ authorization: 'Bearer expired' });

    await expectError(guard.canActivate(ctx), ApiErrorCode.TOKEN_EXPIRED);
  });

  it('maps any other verify error to 401 TOKEN_INVALID', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));
    const { ctx } = contextWith({ authorization: 'Bearer bad' });

    await expectError(guard.canActivate(ctx), ApiErrorCode.TOKEN_INVALID);
  });

  /** Утверждает, что промис упал HttpException с 401 и ожидаемым кодом. */
  async function expectError(
    promise: Promise<unknown>,
    code: ApiErrorCode,
  ): Promise<void> {
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    try {
      await promise;
    } catch (e) {
      const ex = e as HttpException;
      expect(ex.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect((ex.getResponse() as { code: string }).code).toBe(code);
    }
  }
});
