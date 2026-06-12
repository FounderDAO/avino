import { OtpChannel } from '@prisma/client';
import { OtpService } from './otp.service';

describe('OtpService', () => {
  const prisma = {
    user: { findFirst: jest.fn() },
    otpCode: { updateMany: jest.fn(), create: jest.fn() },
  };
  const config = { get: jest.fn() };
  const rateLimit = {
    assertCanRequest: jest.fn().mockResolvedValue(undefined),
    startCooldown: jest.fn().mockResolvedValue(60),
  };
  const sms = { sendOtp: jest.fn().mockResolvedValue(undefined) };
  const email = { sendOtp: jest.fn().mockResolvedValue(undefined) };
  const telegram = { sendAdminAlert: jest.fn().mockResolvedValue(undefined) };
  let service: OtpService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((k: string) => {
      if (k === 'otp.ttl') return 300;
      if (k === 'telegram.includeOtpCode') return true;
      return undefined;
    });
    service = new OtpService(
      prisma as never,
      config as never,
      rateLimit as never,
      sms as never,
      email as never,
      telegram as never,
    );
  });

  it('delivers SMS OTP and fires a telegram alert with the code', async () => {
    prisma.user.findFirst.mockResolvedValue(null); // новый контакт
    const res = await service.requestOtp(
      { channel: OtpChannel.SMS, destination: '+998901234567' } as never,
      '1.2.3.4',
    );
    expect(sms.sendOtp).toHaveBeenCalledTimes(1);
    expect(res.channel).toBe(OtpChannel.SMS);
    expect(telegram.sendAdminAlert).toHaveBeenCalledTimes(1);
    const msg = telegram.sendAdminAlert.mock.calls[0][0] as string;
    expect(msg).toContain('+998901234567');
    // Код в алерте — тот же, что ушёл в SMS.
    const sentCode = sms.sendOtp.mock.calls[0][1] as string;
    expect(msg).toContain(sentCode);
    expect(msg).toContain('новый');
  });

  it('omits the code from the alert when includeOtpCode is false', async () => {
    config.get.mockImplementation((k: string) =>
      k === 'otp.ttl'
        ? 300
        : k === 'telegram.includeOtpCode'
          ? false
          : undefined,
    );
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' }); // существующий
    await service.requestOtp(
      { channel: OtpChannel.SMS, destination: '+998901234567' } as never,
      '1.2.3.4',
    );
    const msg = telegram.sendAdminAlert.mock.calls[0][0] as string;
    const sentCode = sms.sendOtp.mock.calls[0][1] as string;
    expect(msg).not.toContain(sentCode);
    expect(msg).toContain('существующий');
  });
});
