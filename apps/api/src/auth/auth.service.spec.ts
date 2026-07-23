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
  let telegram: any;
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
    config = {
      get: jest.fn().mockImplementation((k: string) => {
        if (k === 'otp.maxAttempts') return 5;
        if (k === 'otp.bypassEnabled') return false;
        if (k === 'otp.bypassPhones') return [];
        return undefined;
      }),
    };
    telegram = { sendAdminAlert: jest.fn().mockResolvedValue(undefined) };
    const rateLimitService = {
      assertCanVerify: jest.fn().mockResolvedValue(undefined),
      recordFailedVerify: jest.fn().mockResolvedValue(undefined),
    };
    const uploads = { getObjectUrl: jest.fn().mockResolvedValue('https://signed/a.webp') };
    service = new AuthService(prisma, config, tokenService, telegram, rateLimitService as any, uploads as any);
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

  // Account-linking (H-2) namespace isolation: SMS-вход резолвит пользователя
  // ТОЛЬКО по phone (никогда по email) — телефонный OTP не клеймит email-аккаунт.
  it('namespace isolation: SMS login resolves user by phone only, never by email', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'o1',
      codeHash: await hashOtpCode(CODE),
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findFirst.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue(baseUser);

    await service.verifyOtp(dto(), '127.0.0.1');

    const whereArg = prisma.user.findFirst.mock.calls[0][0].where;
    expect(whereArg).toHaveProperty('phone', DEST);
    expect(whereArg).not.toHaveProperty('email');
  });

  // Email-вход (OTP) резолвит ТОЛЬКО по email и помечает is_email_verified — успешный
  // OTP сам по себе доказывает контроль над контактом (линковка здесь легитимна).
  it('namespace isolation: EMAIL login resolves user by email only and marks email verified', async () => {
    const emailDest = 'user@example.com';
    const emailUser = {
      ...baseUser,
      phone: null,
      email: emailDest,
      isPhoneVerified: false,
      isEmailVerified: true,
    };
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'o1',
      codeHash: await hashOtpCode(CODE),
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findFirst.mockResolvedValue(emailUser);
    prisma.user.update.mockResolvedValue(emailUser);

    await service.verifyOtp(
      { channel: OtpChannel.EMAIL, destination: emailDest, code: CODE },
      '127.0.0.1',
    );

    const whereArg = prisma.user.findFirst.mock.calls[0][0].where;
    expect(whereArg).toHaveProperty('email', emailDest);
    expect(whereArg).not.toHaveProperty('phone');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isEmailVerified: true }),
      }),
    );
  });

  it('fires a telegram success alert after a successful login', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'o1',
      codeHash: await hashOtpCode(CODE),
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findFirst.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue(baseUser);

    await service.verifyOtp(dto(), '1.2.3.4', 'jest-agent');

    expect(telegram.sendAdminAlert).toHaveBeenCalledWith(
      expect.stringContaining('вход выполнен'),
    );
  });

  it('fires a telegram failure alert on OTP_INVALID and still rejects', async () => {
    prisma.otpCode.findFirst.mockResolvedValue(null); // → OTP_INVALID
    await expect(
      service.verifyOtp(dto(), '1.2.3.4'),
    ).rejects.toBeInstanceOf(HttpException);
    expect(telegram.sendAdminAlert).toHaveBeenCalledWith(
      expect.stringContaining('OTP_INVALID'),
    );
  });

  it('reviewer bypass: accepts any code and logs in without consulting an OTP row', async () => {
    config.get.mockImplementation((k: string) => {
      if (k === 'otp.maxAttempts') return 5;
      if (k === 'otp.bypassEnabled') return true;
      if (k === 'otp.bypassPhones') return [DEST];
      return undefined;
    });
    prisma.user.findFirst.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue(baseUser);

    const result = await service.verifyOtp(dto('000000'), '127.0.0.1', 'jest-agent');

    expect(result.access_token).toBe('access');
    expect(result.user).toMatchObject({ id: 'u1', roles: ['USER'] });
    // Код не искали и не сверяли — обход коротит до completeLogin.
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(tokenService.issueSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', roles: ['USER'] }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('reviewer bypass disabled: the same number still requires a valid code', async () => {
    // config из beforeEach: bypassEnabled=false.
    prisma.otpCode.findFirst.mockResolvedValue(null); // нет активного кода
    await expectCode(
      service.verifyOtp(dto('000000'), '127.0.0.1'),
      ApiErrorCode.OTP_INVALID,
    );
    expect(prisma.otpCode.findFirst).toHaveBeenCalled();
  });
});

/**
 * Юнит-тесты `getMe` (TASK-045, API.md §3). Проверяется контракт ответа: набор
 * полей snake_case, маппинг ролей, всегда-присутствующий `profile` и фолбэк
 * `preferred_language` на `default_language`. 401 при отсутствии пользователя.
 */
describe('AuthService.getMe', () => {
  let prisma: any;
  let service: AuthService;

  const dbUser = {
    id: 'u1',
    phone: '+998901234567',
    email: null,
    defaultLanguage: 'RU',
    status: UserStatus.ACTIVE,
    isPhoneVerified: true,
    isEmailVerified: false,
    roles: [{ role: { code: 'USER' } }, { role: { code: 'AGENT' } }],
    profile: {
      firstName: 'Ali',
      lastName: 'Valiev',
      displayName: 'Ali V.',
      avatarUrl: null,
      contactPhone: '+998901234567',
      contactPhoneVerified: true,
      preferredLanguage: 'RU',
    },
    legalConsents: [] as { version: number; acceptedAt: Date }[],
  };

  beforeEach(() => {
    prisma = { user: { findFirst: jest.fn() } };
    service = new AuthService(
      prisma,
      { get: jest.fn() } as any,
      {} as any,
      { sendAdminAlert: jest.fn() } as any,
      { assertCanVerify: jest.fn().mockResolvedValue(undefined), recordFailedVerify: jest.fn().mockResolvedValue(undefined) } as any,
      { getObjectUrl: jest.fn().mockResolvedValue('https://signed/a.webp') } as any,
    );
  });

  it('returns the full contract for a user with a profile', async () => {
    prisma.user.findFirst.mockResolvedValue(dbUser);

    const result = await service.getMe('u1');

    expect(result).toEqual({
      id: 'u1',
      phone: '+998901234567',
      email: null,
      status: UserStatus.ACTIVE,
      default_language: 'RU',
      is_phone_verified: true,
      is_email_verified: false,
      roles: ['USER', 'AGENT'],
      profile: {
        first_name: 'Ali',
        last_name: 'Valiev',
        display_name: 'Ali V.',
        avatar_url: null,
        contact_phone: '+998901234567',
        contact_phone_verified: true,
        preferred_language: 'RU',
      },
      legal_consent: { accepted_version: null, accepted_at: null },
    });
    // не отдаём DELETED/BLOCKED-аккаунты по валидному токену (kick out)
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'u1',
        status: { notIn: [UserStatus.DELETED, UserStatus.BLOCKED] },
      },
      include: {
        profile: true,
        roles: { include: { role: true } },
        legalConsents: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
  });

  it('returns a null-filled profile and falls back preferred_language when no profile row', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ...dbUser,
      defaultLanguage: 'UZ',
      profile: null,
    });

    const result = await service.getMe('u1');

    expect(result.profile).toEqual({
      first_name: null,
      last_name: null,
      display_name: null,
      avatar_url: null,
      contact_phone: null,
      contact_phone_verified: false,
      preferred_language: 'UZ',
    });
  });

  it('falls back preferred_language to default_language when the profile leaves it unset', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ...dbUser,
      defaultLanguage: 'EN',
      profile: { ...dbUser.profile, preferredLanguage: null },
    });

    const result = await service.getMe('u1');

    expect(result.profile.preferred_language).toBe('EN');
  });

  it('throws 401 UNAUTHORIZED when the token subject no longer resolves', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    const promise = service.getMe('ghost');
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    try {
      await promise;
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(401);
      const res = (e as HttpException).getResponse() as { code: string };
      expect(res.code).toBe(ApiErrorCode.UNAUTHORIZED);
    }
  });

  it('maps the latest legal consent into legal_consent', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ...dbUser,
      legalConsents: [{ version: 2, acceptedAt: new Date('2026-06-29T10:00:00.000Z') }],
    });

    const result = await service.getMe('u1');

    expect(result.legal_consent).toEqual({
      accepted_version: 2,
      accepted_at: '2026-06-29T10:00:00.000Z',
    });
  });
});

/**
 * Юнит-тесты управления сессиями (ADR-0143): маппинг списка в snake_case-контракт,
 * 404 на чужую family и аудит успешного отзыва. TokenService мокается.
 */
describe('AuthService sessions (ADR-0143)', () => {
  let prisma: any;
  let tokenService: any;
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    tokenService = {
      listSessions: jest.fn(),
      revokeUserFamily: jest.fn(),
    };
    service = new AuthService(
      prisma,
      { get: jest.fn() } as any,
      tokenService,
      { sendAdminAlert: jest.fn() } as any,
      {} as any,
      {} as any,
    );
  });

  it('listSessions maps SessionInfo to the snake_case contract', async () => {
    tokenService.listSessions.mockResolvedValue([
      {
        familyId: 'fam1',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        lastRotatedAt: new Date('2026-07-10T00:00:00.000Z'),
        userAgent: 'Chrome',
        ip: '1.1.1.1',
        isCurrent: true,
      },
    ]);

    await expect(service.listSessions('u1', 'fam1')).resolves.toEqual([
      {
        id: 'fam1',
        created_at: '2026-07-01T00:00:00.000Z',
        last_rotated_at: '2026-07-10T00:00:00.000Z',
        user_agent: 'Chrome',
        ip: '1.1.1.1',
        is_current: true,
      },
    ]);
    expect(tokenService.listSessions).toHaveBeenCalledWith('u1', 'fam1');
  });

  it('revokeSessionById throws 404 NOT_FOUND for a foreign/unknown family without audit', async () => {
    tokenService.revokeUserFamily.mockResolvedValue(false);

    const promise = service.revokeSessionById('u1', 'fam-alien', '1.1.1.1');
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    try {
      await promise;
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(404);
      expect((e as HttpException).getResponse()).toMatchObject({
        code: ApiErrorCode.NOT_FOUND,
      });
    }
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('revokeSessionById revokes an own family and writes SESSION_REVOKED audit', async () => {
    tokenService.revokeUserFamily.mockResolvedValue(true);

    await service.revokeSessionById('u1', 'fam1', '1.1.1.1', 'Chrome');

    expect(tokenService.revokeUserFamily).toHaveBeenCalledWith('u1', 'fam1');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'u1',
        action: 'SESSION_REVOKED',
        entityType: 'refresh_token_family',
        entityId: 'fam1',
        ip: '1.1.1.1',
        userAgent: 'Chrome',
      },
    });
  });
});
