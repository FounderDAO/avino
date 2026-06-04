import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../dto/error-response.dto';
import { RolesGuard } from './roles.guard';

/**
 * Юнит-тесты авторизации по ролям (TASK-044). Reflector мокается — проверяются
 * пропуск без `@Roles`, OR-семантика, 403 при нехватке роли и 401 без user.
 */
describe('RolesGuard', () => {
  let reflector: any;
  let guard: RolesGuard;

  const contextWith = (user: unknown) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows when no @Roles metadata is set', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(contextWith({ id: 'u1', roles: [] }))).toBe(true);
  });

  it('allows when @Roles is an empty list', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    expect(guard.canActivate(contextWith({ id: 'u1', roles: [] }))).toBe(true);
  });

  it('allows a user holding one of the required roles (OR semantics)', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const user = { id: 'u1', roles: [UserRole.USER, UserRole.ADMIN] };
    expect(guard.canActivate(contextWith(user))).toBe(true);
  });

  it('forbids a user without any required role (403 FORBIDDEN)', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const user = { id: 'u1', roles: [UserRole.USER] };
    try {
      guard.canActivate(contextWith(user));
      fail('expected FORBIDDEN');
    } catch (e) {
      const ex = e as HttpException;
      expect(ex.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect((ex.getResponse() as { code: string }).code).toBe(
        ApiErrorCode.FORBIDDEN,
      );
    }
  });

  it('rejects with 401 when request.user is missing', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    try {
      guard.canActivate(contextWith(undefined));
      fail('expected UNAUTHORIZED');
    } catch (e) {
      const ex = e as HttpException;
      expect(ex.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect((ex.getResponse() as { code: string }).code).toBe(
        ApiErrorCode.UNAUTHORIZED,
      );
    }
  });
});
