import { HttpException } from '@nestjs/common';
import { OtpChannel } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { hashOtpCode } from '../auth/otp-hash.util';
import { ContactChangeService } from './contact-change.service';

/**
 * Юнит-тесты смены логин-контакта (OtpPurpose.CONTACT_CHANGE). Prisma/rate-limit/
 * доставка мокаются позиционно — проверяется бизнес-логика request/verify:
 * same-contact reject, CONTACT_TAKEN (request + гонка на verify), успешное
 * применение нового контакта с verified-флагом и OTP-провал.
 */
describe('ContactChangeService', () => {
  const CURRENT_PHONE = '+998331986633';
  const NEW_PHONE = '+998939254477';
  const NEW_EMAIL = 'new@example.com';
  const CODE = '123456';

  let prisma: any;
  let config: any;
  let rateLimit: any;
  let sms: any;
  let email: any;
  let telegram: any;
  let usersService: any;
  let service: ContactChangeService;

  const meResponse = { id: 'me', phone: NEW_PHONE, email: null };

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
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
    email = { sendOtp: jest.fn().mockResolvedValue(undefined) };
    telegram = { sendAdminAlert: jest.fn().mockResolvedValue(undefined) };
    usersService = { getMe: jest.fn().mockResolvedValue(meResponse) };

    service = new ContactChangeService(
      prisma as never,
      config as never,
      rateLimit as never,
      sms as never,
      email as never,
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

  it('request: throws CONTACT_TAKEN when destination belongs to another active user', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce({ phone: CURRENT_PHONE, email: null }) // текущий
      .mockResolvedValueOnce({ id: 'other' }); // uniqueness → занято

    await expectCode(
      service.requestContactChange(
        'me',
        { channel: OtpChannel.SMS, destination: NEW_PHONE },
        '1.2.3.4',
      ),
      ApiErrorCode.CONTACT_TAKEN,
    );
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
  });

  it('request: rejects VALIDATION_ERROR when destination equals current contact', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      phone: CURRENT_PHONE,
      email: null,
    });

    await expectCode(
      service.requestContactChange(
        'me',
        { channel: OtpChannel.SMS, destination: CURRENT_PHONE },
        '1.2.3.4',
      ),
      ApiErrorCode.VALIDATION_ERROR,
    );
    // uniqueness не запрашивается — падаем раньше
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
  });

  it('request: happy path issues a CONTACT_CHANGE code and delivers it', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce({ phone: CURRENT_PHONE, email: null }) // текущий
      .mockResolvedValueOnce(null); // uniqueness → свободно

    const res = await service.requestContactChange(
      'me',
      { channel: OtpChannel.SMS, destination: NEW_PHONE },
      '1.2.3.4',
    );

    expect(prisma.otpCode.create).toHaveBeenCalledTimes(1);
    const createArg = prisma.otpCode.create.mock.calls[0][0].data;
    expect(createArg).toMatchObject({
      userId: 'me',
      destination: NEW_PHONE,
      purpose: 'CONTACT_CHANGE',
    });
    expect(sms.sendOtp).toHaveBeenCalledTimes(1);
    expect(res.channel).toBe(OtpChannel.SMS);
    expect(res.resend_after).toBe(60);
    expect(res.expires_in).toBe(300);
  });

  // --- verify ---

  it('verify: applies new phone and sets isPhoneVerified', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'o1',
      codeHash: await hashOtpCode(CODE),
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findFirst.mockResolvedValue(null); // uniqueness recheck → свободно

    const me = await service.verifyContactChange(
      'me',
      { channel: OtpChannel.SMS, destination: NEW_PHONE, code: CODE },
      '1.2.3.4',
    );

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'me' },
        data: { phone: NEW_PHONE, isPhoneVerified: true },
      }),
    );
    // код погашен (одноразовость)
    expect(prisma.otpCode.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { consumedAt: expect.any(Date) },
    });
    expect(me).toBe(meResponse);
  });

  it('verify: applies new email and sets isEmailVerified', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'o1',
      codeHash: await hashOtpCode(CODE),
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findFirst.mockResolvedValue(null);

    await service.verifyContactChange(
      'me',
      { channel: OtpChannel.EMAIL, destination: NEW_EMAIL, code: CODE },
      '1.2.3.4',
    );

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { email: NEW_EMAIL, isEmailVerified: true },
      }),
    );
  });

  it('verify: throws CONTACT_TAKEN when the contact was claimed between request and verify', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'o1',
      codeHash: await hashOtpCode(CODE),
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findFirst.mockResolvedValue({ id: 'other' }); // гонка → занято

    await expectCode(
      service.verifyContactChange(
        'me',
        { channel: OtpChannel.SMS, destination: NEW_PHONE, code: CODE },
        '1.2.3.4',
      ),
      ApiErrorCode.CONTACT_TAKEN,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('verify: rejects a wrong code with OTP_INVALID and does not apply the change', async () => {
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'o1',
      codeHash: await hashOtpCode(CODE),
      attempts: 1,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expectCode(
      service.verifyContactChange(
        'me',
        { channel: OtpChannel.SMS, destination: NEW_PHONE, code: '000000' },
        '1.2.3.4',
      ),
      ApiErrorCode.OTP_INVALID,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(rateLimit.recordFailedVerify).toHaveBeenCalledWith(NEW_PHONE);
  });
});
