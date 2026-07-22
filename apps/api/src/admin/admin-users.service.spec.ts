import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Language, UserStatus } from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AdminUsersService } from './admin-users.service';

/**
 * Юнит-тесты AdminUsersService (TASK-130, API.md §6). Prisma мокается —
 * проверяются сборка where-фильтров и пагинации, маппинг snake_case ответа,
 * инвариант deleted_at для DELETED, и аудит ADMIN_USER_UPDATE / ROLE_CHANGE
 * с ветками 404/400/409.
 */
describe('AdminUsersService', () => {
  const ADMIN_ID = 'admin-1';
  const USER_ID = 'u1';
  const ROLE_ID = 'role-agent';

  let prisma: any;
  let service: AdminUsersService;

  const detailRow = {
    id: USER_ID,
    phone: '+998901234567',
    email: 'a@b.uz',
    status: UserStatus.ACTIVE,
    defaultLanguage: Language.RU,
    isPhoneVerified: true,
    isEmailVerified: false,
    lastLoginAt: new Date('2026-06-01T00:00:00Z'),
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-06-02T00:00:00Z'),
    deletedAt: null,
    roles: [{ role: { code: 'USER' } }, { role: { code: 'AGENT' } }],
    _count: { listings: 2 },
    profile: {
      firstName: 'Ali',
      lastName: 'Valiev',
      displayName: 'Ali V.',
      avatarUrl: null,
      contactPhone: '+998901234567',
      contactPhoneVerified: true,
      preferredLanguage: Language.RU,
    },
  };

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      userRole: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      role: { findUnique: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
      ),
    };
    service = new AdminUsersService(prisma);
  });

  async function expectCode(promise: Promise<unknown>, code: ApiErrorCode) {
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    try {
      await promise;
    } catch (e) {
      const res = (e as HttpException).getResponse() as { code: string };
      expect(res.code).toBe(code);
    }
  }

  describe('listUsers', () => {
    it('applies status/role/q filters and returns paginated snake_case items', async () => {
      prisma.user.findMany.mockResolvedValue([detailRow]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.listUsers({
        status: UserStatus.ACTIVE,
        role: UserRole.AGENT,
        q: 'ali',
        page: 2,
        limit: 10,
      });

      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.where.status).toBe(UserStatus.ACTIVE);
      expect(args.where.roles).toEqual({
        some: { role: { code: UserRole.AGENT } },
      });
      expect(args.where.OR).toHaveLength(5);
      expect(args.skip).toBe(10);
      expect(args.take).toBe(10);
      expect(result.meta).toEqual({ page: 2, limit: 10, total: 1 });
      expect(result.data[0]).toMatchObject({
        id: USER_ID,
        roles: ['USER', 'AGENT'],
        listings_count: 2,
        is_email_verified: false,
        created_at: '2026-05-01T00:00:00.000Z',
        last_login_at: '2026-06-01T00:00:00.000Z',
      });
      expect(result.data[0]).not.toHaveProperty('profile');
    });

    it('defaults page/limit and caps limit at 100', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.listUsers({ limit: 500 });

      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.take).toBe(100);
      expect(args.skip).toBe(0);
    });
  });

  describe('getUser', () => {
    it('returns detail with profile', async () => {
      prisma.user.findUnique.mockResolvedValue(detailRow);
      const result = await service.getUser(USER_ID);
      expect(result.profile).toMatchObject({ first_name: 'Ali' });
      expect(result.updated_at).toBe('2026-06-02T00:00:00.000Z');
      expect(result.deleted_at).toBeNull();
    });

    it('throws 404 when user missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expectCode(service.getUser(USER_ID), ApiErrorCode.NOT_FOUND);
    });
  });

  describe('updateStatus', () => {
    it('sets deleted_at and writes ADMIN_USER_UPDATE audit when DELETED', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        status: UserStatus.ACTIVE,
      });
      prisma.user.update.mockResolvedValue({
        ...detailRow,
        status: UserStatus.DELETED,
        deletedAt: new Date('2026-06-06T00:00:00Z'),
      });

      const result = await service.updateStatus(ADMIN_ID, USER_ID, {
        status: UserStatus.DELETED,
        reason: 'spam',
      });

      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.data.status).toBe(UserStatus.DELETED);
      expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: ADMIN_ID,
          action: 'ADMIN_USER_UPDATE',
          entityType: 'user',
          entityId: USER_ID,
          metadata: {
            old_status: UserStatus.ACTIVE,
            new_status: UserStatus.DELETED,
            reason: 'spam',
          },
        },
      });
      expect(result.status).toBe(UserStatus.DELETED);
    });

    it('clears deleted_at when status is not DELETED', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        status: UserStatus.DELETED,
      });
      prisma.user.update.mockResolvedValue(detailRow);

      await service.updateStatus(ADMIN_ID, USER_ID, {
        status: UserStatus.ACTIVE,
      });

      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.data.deletedAt).toBeNull();
    });

    it('throws 404 when user missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expectCode(
        service.updateStatus(ADMIN_ID, USER_ID, { status: UserStatus.BLOCKED }),
        ApiErrorCode.NOT_FOUND,
      );
    });
  });

  describe('assignRole', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
      prisma.role.findUnique.mockResolvedValue({ id: ROLE_ID });
    });

    it('creates user_role with granted_by and ROLE_CHANGE grant audit', async () => {
      prisma.userRole.findUnique.mockResolvedValue(null);
      // getUser re-fetch after grant
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: USER_ID })
        .mockResolvedValueOnce(detailRow);

      await service.assignRole(ADMIN_ID, USER_ID, { role: UserRole.AGENT });

      expect(prisma.userRole.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, roleId: ROLE_ID, grantedBy: ADMIN_ID },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: ADMIN_ID,
          action: 'ROLE_CHANGE',
          entityType: 'user',
          entityId: USER_ID,
          metadata: { role: UserRole.AGENT, op: 'grant' },
        },
      });
    });

    it('throws 409 when role already granted', async () => {
      prisma.userRole.findUnique.mockResolvedValue({ id: 'ur1' });
      await expectCode(
        service.assignRole(ADMIN_ID, USER_ID, { role: UserRole.AGENT }),
        ApiErrorCode.ROLE_ALREADY_GRANTED,
      );
    });

    it('throws 400 for unknown role (e.g. GUEST not seeded)', async () => {
      prisma.role.findUnique.mockResolvedValue(null);
      await expectCode(
        service.assignRole(ADMIN_ID, USER_ID, { role: UserRole.GUEST }),
        ApiErrorCode.VALIDATION_ERROR,
      );
    });

    it('throws 404 when user missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expectCode(
        service.assignRole(ADMIN_ID, USER_ID, { role: UserRole.AGENT }),
        ApiErrorCode.NOT_FOUND,
      );
    });
  });

  describe('removeRole', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
      prisma.role.findUnique.mockResolvedValue({ id: ROLE_ID });
    });

    it('deletes user_role and writes ROLE_CHANGE revoke audit', async () => {
      prisma.userRole.findUnique.mockResolvedValue({ id: 'ur1' });

      await service.removeRole(ADMIN_ID, USER_ID, UserRole.AGENT);

      expect(prisma.userRole.delete).toHaveBeenCalledWith({
        where: { id: 'ur1' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: ADMIN_ID,
          action: 'ROLE_CHANGE',
          entityType: 'user',
          entityId: USER_ID,
          metadata: { role: UserRole.AGENT, op: 'revoke' },
        },
      });
    });

    it('throws 404 when role not granted', async () => {
      prisma.userRole.findUnique.mockResolvedValue(null);
      await expectCode(
        service.removeRole(ADMIN_ID, USER_ID, UserRole.AGENT),
        ApiErrorCode.NOT_FOUND,
      );
    });

    it('throws 404 when user missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expectCode(
        service.removeRole(ADMIN_ID, USER_ID, UserRole.AGENT),
        ApiErrorCode.NOT_FOUND,
      );
    });
  });

  it('surfaces typed Nest exceptions', () => {
    expect(new NotFoundException()).toBeInstanceOf(HttpException);
    expect(new ConflictException()).toBeInstanceOf(HttpException);
    expect(new BadRequestException()).toBeInstanceOf(HttpException);
  });
});
