import { HttpException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { TokenService } from './token.service';
import { hashRefreshToken } from './token.util';

/**
 * Юнит-тесты ротации и отзыва refresh-сессии (TASK-043). Jwt/Config/Prisma
 * мокаются — проверяются reuse-detection, отзыв family и идемпотентный logout.
 */
describe('TokenService', () => {
  const REFRESH_SECRET = 'refresh-secret';
  const TOKEN = 'header.payload.sig';
  const TOKEN_HASH = hashRefreshToken(TOKEN, REFRESH_SECRET);

  const cfg: Record<string, unknown> = {
    'jwt.accessSecret': 'access-secret',
    'jwt.refreshSecret': REFRESH_SECRET,
    'jwt.accessTtl': 900,
    'jwt.refreshTtl': 2592000,
    'jwt.maxSessions': 5,
  };

  let jwt: any;
  let config: any;
  let prisma: any;
  let service: TokenService;

  const activeRow = () => ({
    id: 'tok1',
    userId: 'u1',
    tokenHash: TOKEN_HASH,
    familyId: 'fam1',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  });

  beforeEach(() => {
    jwt = {
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ sub: 'u1', fid: 'fam1', jti: 'tok1' }),
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('new-access')
        .mockResolvedValueOnce('new-refresh'),
    };
    config = { get: jest.fn((k: string) => cfg[k]) };
    prisma = {
      refreshToken: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          status: UserStatus.ACTIVE,
          roles: [{ role: { code: 'USER' } }],
        }),
      },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => Promise<unknown>)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    service = new TokenService(jwt, config, prisma);
  });

  async function expectCode(p: Promise<unknown>, code: ApiErrorCode) {
    await expect(p).rejects.toBeInstanceOf(HttpException);
    try {
      await p;
    } catch (e) {
      expect((e as HttpException).getResponse()).toMatchObject({ code });
    }
  }

  describe('issueSession (session limit, ADR-0143)', () => {
    const input = {
      userId: 'u1',
      roles: ['USER'],
      ip: '127.0.0.1',
      userAgent: 'agent',
    };

    it('keeps all sessions when the limit is not exceeded', async () => {
      prisma.refreshToken.groupBy.mockResolvedValue([]);

      const result = await service.issueSession(input);

      expect(result).toEqual({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresIn: 900,
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'u1' }),
      });
      // Хвост за лимитом пуст → ничего не отзываем
      expect(prisma.refreshToken.groupBy).toHaveBeenCalledWith({
        by: ['familyId'],
        where: {
          userId: 'u1',
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        _max: { createdAt: true },
        orderBy: { _max: { createdAt: 'desc' } },
        skip: 5,
      });
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('revokes families beyond the newest maxSessions by last activity', async () => {
      prisma.refreshToken.groupBy.mockResolvedValue([
        { familyId: 'fam-stale-1', _max: { createdAt: new Date() } },
        { familyId: 'fam-stale-2', _max: { createdAt: new Date() } },
      ]);

      await service.issueSession(input);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'u1',
          familyId: { in: ['fam-stale-1', 'fam-stale-2'] },
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('rotateSession', () => {
    it('rotates: revokes the presented token and issues a new pair in the family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(activeRow());

      const result = await service.rotateSession(TOKEN, '127.0.0.1', 'agent');

      expect(result).toEqual({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresIn: 900,
      });
      // старый токен отозван
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'tok1' },
        data: { revokedAt: expect.any(Date) },
      });
      // новый — в той же family
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'u1', familyId: 'fam1' }),
      });
      // свежие роли и family текущей сессии в новом access-токене (ADR-0143)
      expect(jwt.signAsync).toHaveBeenCalledWith(
        { sub: 'u1', roles: ['USER'], fid: 'fam1' },
        expect.objectContaining({ secret: 'access-secret' }),
      );
    });

    it('detects reuse of a revoked token and revokes the whole family (TOKEN_REUSED)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...activeRow(),
        revokedAt: new Date(),
      });

      await expectCode(service.rotateSession(TOKEN), ApiErrorCode.TOKEN_REUSED);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects an expired refresh JWT with TOKEN_EXPIRED', async () => {
      jwt.verifyAsync.mockRejectedValue(
        Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' }),
      );
      await expectCode(
        service.rotateSession(TOKEN),
        ApiErrorCode.TOKEN_EXPIRED,
      );
    });

    it('rejects a malformed/invalid signature with TOKEN_INVALID', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));
      await expectCode(
        service.rotateSession(TOKEN),
        ApiErrorCode.TOKEN_INVALID,
      );
    });

    it('rejects when no matching row exists (TOKEN_INVALID)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expectCode(
        service.rotateSession(TOKEN),
        ApiErrorCode.TOKEN_INVALID,
      );
    });

    it('rejects when the stored hash does not match (TOKEN_INVALID)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...activeRow(),
        tokenHash: 'different-hash',
      });
      await expectCode(
        service.rotateSession(TOKEN),
        ApiErrorCode.TOKEN_INVALID,
      );
    });

    it('revokes the family and rejects when the user is not active (TOKEN_INVALID)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(activeRow());
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        status: UserStatus.BLOCKED,
        roles: [{ role: { code: 'USER' } }],
      });
      await expectCode(
        service.rotateSession(TOKEN),
        ApiErrorCode.TOKEN_INVALID,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });
  });

  describe('revokeSession', () => {
    it('revokes the family and returns userId when the session exists', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue(activeRow());

      const userId = await service.revokeSession(TOKEN);

      expect(userId).toBe('u1');
      expect(prisma.refreshToken.findFirst).toHaveBeenCalledWith({
        where: { tokenHash: TOKEN_HASH },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('is a no-op returning null when no session matches', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue(null);

      const userId = await service.revokeSession(TOKEN);

      expect(userId).toBeNull();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('listSessions (ADR-0143)', () => {
    it('maps active rows to sessions: login time from groupBy, is_current by fid', async () => {
      const t1 = new Date('2026-07-01T00:00:00Z');
      const t2 = new Date('2026-07-10T00:00:00Z');
      prisma.refreshToken.findMany.mockResolvedValue([
        // DESC по createdAt: свежая ротация fam1, затем fam2 без ротаций
        {
          familyId: 'fam1',
          createdAt: t2,
          userAgent: 'Chrome',
          ip: '1.1.1.1',
        },
        { familyId: 'fam2', createdAt: t1, userAgent: null, ip: null },
      ]);
      prisma.refreshToken.groupBy.mockResolvedValue([
        { familyId: 'fam1', _min: { createdAt: t1 } },
        { familyId: 'fam2', _min: { createdAt: t1 } },
      ]);

      const sessions = await service.listSessions('u1', 'fam1');

      expect(prisma.refreshToken.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'u1',
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(sessions).toEqual([
        {
          familyId: 'fam1',
          createdAt: t1,
          lastRotatedAt: t2,
          userAgent: 'Chrome',
          ip: '1.1.1.1',
          isCurrent: true,
        },
        {
          familyId: 'fam2',
          createdAt: t1,
          lastRotatedAt: t1,
          userAgent: null,
          ip: null,
          isCurrent: false,
        },
      ]);
    });

    it('marks nothing current when the access token carries no fid (pre-ADR-0143)', async () => {
      const t = new Date();
      prisma.refreshToken.findMany.mockResolvedValue([
        { familyId: 'fam1', createdAt: t, userAgent: null, ip: null },
      ]);
      prisma.refreshToken.groupBy.mockResolvedValue([
        { familyId: 'fam1', _min: { createdAt: t } },
      ]);

      const sessions = await service.listSessions('u1', null);

      expect(sessions).toHaveLength(1);
      expect(sessions[0].isCurrent).toBe(false);
    });

    it('returns [] without extra queries when the user has no active rows', async () => {
      prisma.refreshToken.findMany.mockResolvedValue([]);

      await expect(service.listSessions('u1', 'fam1')).resolves.toEqual([]);
      expect(prisma.refreshToken.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('revokeUserFamily (ADR-0143)', () => {
    it('revokes an own family and returns true', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({ id: 'tok1' });

      await expect(service.revokeUserFamily('u1', 'fam1')).resolves.toBe(true);

      // Принадлежность проверяется парой familyId+userId
      expect(prisma.refreshToken.findFirst).toHaveBeenCalledWith({
        where: { familyId: 'fam1', userId: 'u1' },
        select: { id: true },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it("returns false for another user's or unknown family without revoking", async () => {
      prisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(service.revokeUserFamily('u1', 'fam-alien')).resolves.toBe(
        false,
      );
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
