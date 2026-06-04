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
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
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
      // свежие роли в новом access-токене
      expect(jwt.signAsync).toHaveBeenCalledWith(
        { sub: 'u1', roles: ['USER'] },
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
});
