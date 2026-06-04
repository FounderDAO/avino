import { HttpException } from '@nestjs/common';
import { OtpChannel, UserStatus } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthService } from './auth.service';
import { hashOtpCode } from './otp-hash.util';

/**
 * Юнит-тесты решающей логики verify (TASK-042). Prisma/Token/Config мокаются —
 * проверяется именно последовательность OTP-проверок, signup-as-login и аудит.
 */
describe('AuthService.verifyOtp', () => {
  const DEST = '+998901234567';
  const CODE = '123456';

  let prisma: any;
  let tokenService: any;
  let config: any;
  let service: AuthService;

  const baseUser = {
    id: 'u1',
    phone: DEST,
    email: null,
    defaultLanguage: 'RU',
    status: UserStatus.ACTIVE,
    isPhoneVerified: true,
    isEmailVerified: false,
    roles: [{ role: { code: 'USER' } }],
  };

  beforeEach(() => {
    prisma = {
      otpCode: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      role: { findUnique: jest.fn() },
      userRole: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    tokenService = {
      issueSession: jest.fn().mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresIn: 900,
      }),
    };
    config = { get: jest.fn().mockReturnValue(5) }; // otp.maxAttempts
    service = new AuthService(prisma, config, tokenService);
  });

  const dto = (code = CODE) => ({
    channel: OtpChannel.SMS,
    destination: DEST,
    code,
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

  it('rejects invalid destination with VALIDATION_ERROR', async () => {
    await expectCode(
      service.verifyOtp(
        { channel: OtpChannel.SMS, destination: 'not-a-phone', code: CODE },
        '127.0.0.1',
      ),
      ApiErrorCode.VALIDATION_ERROR,
    );
  });

  it('rejects when no active code exists (OTP_INVALID)', async () => {
    prisma.otpCode.findFirst.mockResolvedValue(null);
    await expectCode(
      service.verifyOtp(dto(), '127.0.0.1'),
      ApiErrorCode.OTP_INVALID,
    );
  });

  it('rejects and consumes an expired code (OTP_EXPIRED)', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'o1',
      codeHash: await hashOtpCode(CODE),
      attempts: 0,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expectCode(
      service.verifyOtp(dto(), '127.0.0.1'),
      ApiErrorCode.OTP_EXPIRED,
    );
    expect(prisma.otpCode.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it('rejects when attempts already exhausted (OTP_ATTEMPTS_EXCEEDED)', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'o1',
      codeHash: await hashOtpCode(CODE),
      attempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expectCode(
      service.verifyOtp(dto(), '127.0.0.1'),
      ApiErrorCode.OTP_ATTEMPTS_EXCEEDED,
    );
  });

  it('increments attempts and rejects on a wrong code (OTP_INVALID)', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'o1',
      codeHash: await hashOtpCode(CODE),
      attempts: 1,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expectCode(
      service.verifyOtp(dto('000000'), '127.0.0.1'),
      ApiErrorCode.OTP_INVALID,
    );
    expect(prisma.otpCode.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { attempts: 2 },
    });
  });

  it('locks out when a wrong code reaches the limit (OTP_ATTEMPTS_EXCEEDED)', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'o1',
      codeHash: await hashOtpCode(CODE),
      attempts: 4,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expectCode(
      service.verifyOtp(dto('000000'), '127.0.0.1'),
      ApiErrorCode.OTP_ATTEMPTS_EXCEEDED,
    );
  });

  it('rejects a blocked user with USER_BLOCKED', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'o1',
      codeHash: await hashOtpCode(CODE),
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findFirst.mockResolvedValue({
      ...baseUser,
      status: UserStatus.BLOCKED,
    });
    await expectCode(
      service.verifyOtp(dto(), '127.0.0.1'),
      ApiErrorCode.USER_BLOCKED,
    );
  });

  it('logs in an existing user: consumes code, issues tokens, writes audit', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'o1',
      codeHash: await hashOtpCode(CODE),
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findFirst.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue(baseUser);

    const result = await service.verifyOtp(dto(), '127.0.0.1', 'jest-agent');

    expect(result.token_type).toBe('Bearer');
    expect(result.access_token).toBe('access');
    expect(result.refresh_token).toBe('refresh');
    expect(result.expires_in).toBe(900);
    expect(result.user).toMatchObject({ id: 'u1', roles: ['USER'] });
    // код погашен (consumed) и пользователь не создавался
    expect(prisma.otpCode.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { consumedAt: expect.any(Date) },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(tokenService.issueSession).toHaveBeenCalledWith({
      userId: 'u1',
      roles: ['USER'],
      ip: '127.0.0.1',
      userAgent: 'jest-agent',
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'u1',
        action: 'LOGIN',
        entityType: 'user',
      }),
    });
  });

  it('creates a new user with the USER role on first login (signup-as-login)', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'o1',
      codeHash: await hashOtpCode(CODE),
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findFirst.mockResolvedValue(null); // нет активного аккаунта
    prisma.user.create.mockResolvedValue({ id: 'new' });
    prisma.role.findUnique.mockResolvedValue({ id: 'role-user' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      ...baseUser,
      id: 'new',
    });

    const result = await service.verifyOtp(dto(), '127.0.0.1');

    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.userRole.create).toHaveBeenCalledWith({
      data: { userId: 'new', roleId: 'role-user' },
    });
    expect(result.user.id).toBe('new');
    expect(tokenService.issueSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'new', roles: ['USER'] }),
    );
  });
});
