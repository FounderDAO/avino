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
  const sms = {
    sendOtp: jest.fn().mockResolvedValue(undefined),
    isEnabled: jest.fn().mockResolvedValue(true),
  };
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

  it('returns 503 AUTH_PROVIDER_UNAVAILABLE when SMS is disabled by admin', async () => {
    sms.isEnabled.mockResolvedValueOnce(false);
    await expect(
      service.requestOtp(
        { channel: OtpChannel.SMS, destination: '+998901234567' } as never,
        '1.2.3.4',
      ),
    ).rejects.toMatchObject({
      response: { code: 'AUTH_PROVIDER_UNAVAILABLE' },
    });
    // Падаем до rate-limit и генерации кода.
    expect(rateLimit.assertCanRequest).not.toHaveBeenCalled();
    expect(sms.sendOtp).not.toHaveBeenCalled();
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

  it('delivers phone OTP via Telegram and skips Eskiz when OTP_TELEGRAM_DELIVERY is on (staging)', async () => {
    config.get.mockImplementation((k: string) => {
      if (k === 'otp.ttl') return 300;
      if (k === 'otp.telegramDelivery') return true;
      if (k === 'telegram.includeOtpCode') return true;
      return undefined;
    });
    // SMS-тоггл выключен — в режиме telegram-доставки это не должно мешать.
    sms.isEnabled.mockResolvedValue(false);
    prisma.user.findFirst.mockResolvedValue(null); // новый контакт

    const res = await service.requestOtp(
      { channel: OtpChannel.SMS, destination: '+998901234567' } as never,
      '1.2.3.4',
    );

    // Eskiz не трогаем; 503 на выключенном SMS не кидаем.
    expect(sms.sendOtp).not.toHaveBeenCalled();
    // Ровно один Telegram-вызов (доставка = алерт, без дубля), и в нём — код.
    expect(telegram.sendAdminAlert).toHaveBeenCalledTimes(1);
    const msg = telegram.sendAdminAlert.mock.calls[0][0] as string;
    expect(msg).toContain('+998901234567');
    expect(msg).toContain('КОД'); // 6-значный код доставлен в Telegram
    expect(msg).toMatch(/\b\d{6}\b/);
    // Код всё равно сохранён в БД для verify, и rate-limit отработал.
    expect(prisma.otpCode.create).toHaveBeenCalledTimes(1);
    expect(rateLimit.assertCanRequest).toHaveBeenCalledTimes(1);
    expect(res.channel).toBe(OtpChannel.SMS);
  });

  it('short-circuits the OTP request for a reviewer bypass phone (no SMS, no code stored)', async () => {
    config.get.mockImplementation((k: string) => {
      if (k === 'otp.ttl') return 300;
      if (k === 'otp.bypassEnabled') return true;
      if (k === 'otp.bypassPhones') return ['+998902793100'];
      return undefined;
    });
    // SMS-тоггл выключен — обход не должен от него зависеть.
    sms.isEnabled.mockResolvedValue(false);

    const res = await service.requestOtp(
      { channel: OtpChannel.SMS, destination: '+998902793100' } as never,
      '1.2.3.4',
    );

    expect(res.channel).toBe(OtpChannel.SMS);
    expect(res.expires_in).toBe(300);
    // Ничего не сгенерировали/не сохранили/не отправили; rate-limit не трогали.
    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(telegram.sendAdminAlert).not.toHaveBeenCalled();
    expect(rateLimit.assertCanRequest).not.toHaveBeenCalled();
  });

  it('does NOT bypass the request when the flag is off (same number, normal SMS flow)', async () => {
    config.get.mockImplementation((k: string) => {
      if (k === 'otp.ttl') return 300;
      if (k === 'otp.bypassEnabled') return false;
      if (k === 'otp.bypassPhones') return ['+998902793100'];
      if (k === 'telegram.includeOtpCode') return true;
      return undefined;
    });
    // Предыдущий bypass-тест установил sms.isEnabled=false; сбрасываем для нормального пути.
    sms.isEnabled.mockResolvedValue(true);
    prisma.user.findFirst.mockResolvedValue(null);

    await service.requestOtp(
      { channel: OtpChannel.SMS, destination: '+998902793100' } as never,
      '1.2.3.4',
    );
    // Обычный путь: код доставлен и сохранён.
    expect(sms.sendOtp).toHaveBeenCalledTimes(1);
    expect(prisma.otpCode.create).toHaveBeenCalledTimes(1);
  });
});
