import { ExecutionContext, Controller, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@avino/shared';
import { currentUserFactory } from './current-user.decorator';
import { Roles, ROLES_KEY } from './roles.decorator';

/**
 * Юнит-тесты декораторов RBAC (TASK-044): `@Roles(...)` пишет читаемые
 * Reflector'ом метаданные, а фабрика `@CurrentUser()` достаёт user из запроса.
 */
describe('RBAC decorators', () => {
  describe('@Roles', () => {
    it('writes the required roles into handler metadata', () => {
      class Sample {
        @Roles(UserRole.ADMIN, UserRole.MODERATOR)
        handler(): void {}
      }
      const reflector = new Reflector();
      const roles = reflector.get<UserRole[]>(
        ROLES_KEY,
        Sample.prototype.handler,
      );
      expect(roles).toEqual([UserRole.ADMIN, UserRole.MODERATOR]);
    });

    it('protects an admin-only endpoint (class + handler metadata read)', () => {
      @Controller()
      class AdminController {
        @Get('admin')
        @Roles(UserRole.ADMIN)
        adminOnly(): void {}
      }
      const reflector = new Reflector();
      const roles = reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
        AdminController.prototype.adminOnly,
        AdminController,
      ]);
      expect(roles).toEqual([UserRole.ADMIN]);
    });
  });

  describe('@CurrentUser factory', () => {
    const ctxWith = (user: unknown) =>
      ({
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      }) as unknown as ExecutionContext;

    it('returns the whole user when called without a key', () => {
      const user = { id: 'u1', roles: [UserRole.USER] };
      expect(currentUserFactory(undefined, ctxWith(user))).toEqual(user);
    });

    it('returns a single field when given a key', () => {
      const user = { id: 'u1', roles: [UserRole.USER] };
      expect(currentUserFactory('id', ctxWith(user))).toBe('u1');
    });

    it('returns undefined when no user is attached', () => {
      expect(currentUserFactory(undefined, ctxWith(undefined))).toBeUndefined();
    });
  });
});
