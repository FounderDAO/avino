import { HttpException } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import { BlocksService } from './blocks.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const TARGET_ID = '22222222-2222-2222-2222-222222222222';
const BLOCK_ID = '33333333-3333-3333-3333-333333333333';
const NOW = new Date('2026-08-19T10:00:00Z');

const user: AuthenticatedUser = { id: USER_ID, roles: [UserRole.USER] };

describe('BlocksService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let uploads: any;
  let service: BlocksService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      userBlock: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    uploads = {};
    service = new BlocksService(prisma, uploads);
  });

  async function expectError(p: Promise<unknown>, code: ApiErrorCode) {
    await expect(p).rejects.toBeInstanceOf(HttpException);
    await p.catch((e: HttpException) => {
      expect((e.getResponse() as { code: string }).code).toBe(code);
    });
  }

  describe('add', () => {
    it('создаёт блок и возвращает квиток', async () => {
      prisma.user.findUnique.mockResolvedValue({ status: UserStatus.ACTIVE });
      prisma.userBlock.create.mockResolvedValue({
        id: BLOCK_ID,
        blockedId: TARGET_ID,
        createdAt: NOW,
      });
      const res = await service.add(user, TARGET_ID);
      expect(res).toEqual({
        id: BLOCK_ID,
        user_id: TARGET_ID,
        created_at: NOW.toISOString(),
      });
      expect(prisma.userBlock.create).toHaveBeenCalledWith({
        data: { blockerId: USER_ID, blockedId: TARGET_ID },
        select: { id: true, blockedId: true, createdAt: true },
      });
    });

    it('self-block → 400 VALIDATION_ERROR', async () => {
      await expectError(
        service.add(user, USER_ID),
        ApiErrorCode.VALIDATION_ERROR,
      );
      expect(prisma.userBlock.create).not.toHaveBeenCalled();
    });

    it('несуществующий пользователь → 404', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expectError(service.add(user, TARGET_ID), ApiErrorCode.NOT_FOUND);
    });

    it('DELETED-пользователь → 404', async () => {
      prisma.user.findUnique.mockResolvedValue({ status: UserStatus.DELETED });
      await expectError(service.add(user, TARGET_ID), ApiErrorCode.NOT_FOUND);
    });

    it('повторный блок (P2002) → идемпотентно существующая строка', async () => {
      prisma.user.findUnique.mockResolvedValue({ status: UserStatus.ACTIVE });
      prisma.userBlock.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      prisma.userBlock.findUnique.mockResolvedValue({
        id: BLOCK_ID,
        blockedId: TARGET_ID,
        createdAt: NOW,
      });
      const res = await service.add(user, TARGET_ID);
      expect(res.id).toBe(BLOCK_ID);
    });
  });

  describe('remove', () => {
    it('удаляет блок', async () => {
      prisma.userBlock.deleteMany.mockResolvedValue({ count: 1 });
      await service.remove(user, TARGET_ID);
      expect(prisma.userBlock.deleteMany).toHaveBeenCalledWith({
        where: { blockerId: USER_ID, blockedId: TARGET_ID },
      });
    });

    it('идемпотентно: блока не было → без ошибки', async () => {
      prisma.userBlock.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.remove(user, TARGET_ID)).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    it('возвращает заблокированных с именем и датой, свежие сверху', async () => {
      prisma.userBlock.findMany.mockResolvedValue([
        {
          createdAt: NOW,
          blocked: {
            id: TARGET_ID,
            profile: {
              displayName: 'Алишер',
              firstName: null,
              lastName: null,
              avatarUrl: null,
              avatarStorageKey: null,
            },
          },
        },
      ]);
      const res = await service.list(user);
      expect(res.data).toEqual([
        {
          user_id: TARGET_ID,
          name: 'Алишер',
          avatar_url: null,
          blocked_at: NOW.toISOString(),
        },
      ]);
      expect(prisma.userBlock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { blockerId: USER_ID },
          orderBy: [{ createdAt: 'desc' }],
        }),
      );
    });
  });
});
