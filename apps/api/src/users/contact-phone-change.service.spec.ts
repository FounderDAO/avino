import { HttpException } from '@nestjs/common';
import { OtpChannel } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { hashOtpCode } from '../auth/otp-hash.util';
import { ContactPhoneChangeService } from './contact-phone-change.service';

/**
 * Юнит-тесты смены публичного контакт-телефона (OtpPurpose.CONTACT_PHONE_CHANGE).
 * Зеркалит структуру `contact-change.service.spec.ts`, но без email-канала и без
 * uniqueness-проверки (несколько аккаунтов могут делить один контакт-телефон);
 * дополнительно покрывает короткое замыкание на верифицированный логин-телефон.
 */
describe('ContactPhoneChangeService', () => {
  const LOGIN_PHONE = '+998331986633';
  const NEW_PHONE = '+998939254477';
  const CODE = '123456';

  let prisma: any;
  let config: any;
  let rateLimit: any;
  let sms: any;
  let telegram: any;
  let usersService: any;
  let service: ContactPhoneChangeService;

  const meResponse = { id: 'me', phone: LOGIN_PHONE, email: null };

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn() },
      userProfile: { upsert: jest.fn().mockResolvedValue({}) },
      otpCode: {
        updateMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    config = {
      get: jest.fn().mockImplementation((k: string) => {
        if (k === 'otp.ttl') return 300;
        if (k === 'otp.maxAttempts') return 5;
        return undefined;
      }),
    };
    rateLimit = {
      assertCanRequest: jest.fn().mockResolvedValue(undefined),
      startCooldown: jest.fn().mockResolvedValue(60),
      assertCanVerify: jest.fn().mockResolvedValue(undefined),
      recordFailedVerify: jest.fn().mockResolvedValue(undefined),
    };
    sms = {
      sendOtp: jest.fn().mockResolvedValue(undefined),
      isEnabled: jest.fn().mockResolvedValue(true),
    };
    telegram = { sendAdminAlert: jest.fn().mockResolvedValue(undefined) };
    usersService = { getMe: jest.fn().mockResolvedValue(meResponse) };

    service = new ContactPhoneChangeService(
      prisma as never,
      config as never,
      rateLimit as never,
      sms as never,
      telegram as never,
      usersService as never,
    );
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

  // --- request ---

  it('request: destination ≠ login phone issues a CONTACT_PHONE_CHANGE code', async () => {
    prisma.user.findFirst.mockResolvedValue({
      phone: LOGIN_PHONE,
      isPhoneVerified: true,
      profile: { contactPhone: null, contactPhoneVerified: false },
    });

    const res = await service.requestContactPhoneChange(
      'me',
      { destination: NEW_PHONE },
      '1.2.3.4',
    );

    expect(prisma.otpCode.create).toHaveBeenCalledTimes(1);
    const createArg = prisma.otpCode.create.mock.calls[0][0].data;
    expect(createArg).toMatchObject({
      userId: 'me',
      destination: NEW_PHONE,
      channel: OtpChannel.SMS,
      purpose: 'CONTACT_PHONE_CHANGE',
    });
    expect(sms.sendOtp).toHaveBeenCalledTimes(1);
    expect(prisma.userProfile.upsert).not.toHaveBeenCalled();
    expect(res).toMatchObject({ applied: false, channel: OtpChannel.SMS });
  });

  it('request short-circuit: destination equals verified login phone applies without OTP', async () => {
    prisma.user.findFirst.mockResolvedValue({
      phone: NEW_PHONE,
      isPhoneVerified: true,
      profile: { contactPhone: null, contactPhoneVerified: false },
    });

    const res = await service.requestContactPhoneChange(
      'me',
      { destination: NEW_PHONE },
      '1.2.3.4',
    );

    expect(prisma.userProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 'me' },
      create: { userId: 'me', contactPhone: NEW_PHONE, contactPhoneVerified: true },
      update: { contactPhone: NEW_PHONE, contactPhoneVerified: true },
    });
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(res).toEqual({ applied: true });
  });

  it('request: rejects VALIDATION_ERROR when destination equals current verified contact phone', async () => {
    prisma.user.findFirst.mockResolvedValue({
      phone: LOGIN_PHONE,
      isPhoneVerified: true,
      profile: { contactPhone: NEW_PHONE, contactPhoneVerified: true },
    });

    await expectCode(
      service.requestContactPhoneChange(
        'me',
        { destination: NEW_PHONE },
        '1.2.3.4',
      ),
      ApiErrorCode.VALIDATION_ERROR,
    );
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(prisma.userProfile.upsert).not.toHaveBeenCalled();
  });

  it('request: throws AUTH_PROVIDER_UNAVAILABLE when SMS channel is off', async () => {
    prisma.user.findFirst.mockResolvedValue({
      phone: LOGIN_PHONE,
      isPhoneVerified: true,
      profile: { contactPhone: null, contactPhoneVerified: false },
    });
    sms.isEnabled.mockResolvedValue(false);

    await expectCode(
      service.requestContactPhoneChange(
        'me',
        { destination: NEW_PHONE },
        '1.2.3.4',
      ),
      ApiErrorCode.AUTH_PROVIDER_UNAVAILABLE,
    );
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
  });

  it('request: does not check uniqueness — two different users can request the same contact phone', async () => {
    prisma.user.findFirst.mockResolvedValue({
      phone: LOGIN_PHONE,
      isPhoneVerified: true,
      profile: { contactPhone: null, contactPhoneVerified: false },
    });

    await service.requestContactPhoneChange(
      'user-a',
      { destination: NEW_PHONE },
      '1.2.3.4',
    );
    await service.requestContactPhoneChange(
      'user-b',
      { destination: NEW_PHONE },
      '1.2.3.4',
    );

    // Единственный `user.findFirst` — за текущим аккаунтом; чужой phone не ищется.
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.otpCode.create).toHaveBeenCalledTimes(2);
  });

  // --- verify ---

  it('verify: applies contact phone and marks it verified', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'o1',
      codeHash: await hashOtpCode(CODE),
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const me = await service.verifyContactPhoneChange(
      'me',
      { destination: NEW_PHONE, code: CODE },
      '1.2.3.4',
    );

    expect(prisma.otpCode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          destination: NEW_PHONE,
          purpose: 'CONTACT_PHONE_CHANGE',
          userId: 'me',
        }),
      }),
    );
    expect(prisma.userProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 'me' },
      create: { userId: 'me', contactPhone: NEW_PHONE, contactPhoneVerified: true },
      update: { contactPhone: NEW_PHONE, contactPhoneVerified: true },
    });
    // код погашен (одноразовость)
    expect(prisma.otpCode.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { consumedAt: expect.any(Date) },
    });
    expect(me).toBe(meResponse);
  });

  it('verify: rejects a wrong code with OTP_INVALID and does not apply the change', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'o1',
      codeHash: await hashOtpCode(CODE),
      attempts: 1,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expectCode(
      service.verifyContactPhoneChange(
        'me',
        { destination: NEW_PHONE, code: '000000' },
        '1.2.3.4',
      ),
      ApiErrorCode.OTP_INVALID,
    );
    expect(prisma.userProfile.upsert).not.toHaveBeenCalled();
    expect(rateLimit.recordFailedVerify).toHaveBeenCalledWith(NEW_PHONE);
  });
});
