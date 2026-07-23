import { HttpException } from '@nestjs/common';
import { OtpChannel } from '@prisma/client';
import { OtpRateLimitService } from './otp-rate-limit.service';

/**
 * Unit-тесты новых методов OtpRateLimitService (H-1, ADR security hardening).
 * Redis и ConfigService мокируются — проверяется логика ключей и лимитов.
 */
describe('OtpRateLimitService.assertCanVerify', () => {
  let redis: any;
  let config: any;
  let svc: OtpRateLimitService;

  beforeEach(() => {
    redis = {
      exists: jest.fn().mockResolvedValue(0),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockResolvedValue(850),
    };
    config = {
      get: jest.fn((key: string) => {
        const map: Record<string, number> = {
          'rateLimit.verifyWindowS': 60,
          'rateLimit.verifyMaxPerIp': 10,
          'rateLimit.verifyMaxPerDest': 10,
        };
        return map[key];
      }),
    };
    svc = new OtpRateLimitService(redis as any, config as any);
  });

  it('passes when no lock and within limits', async () => {
    await expect(svc.assertCanVerify('+998901234567', '1.2.3.4')).resolves.toBeUndefined();
  });

  it('throws 429 when destination is locked', async () => {
    redis.exists.mockResolvedValue(1);
    await expect(
      svc.assertCanVerify('+998901234567', '1.2.3.4'),
    ).rejects.toBeInstanceOf(HttpException);
    try {
      await svc.assertCanVerify('+998901234567', '1.2.3.4');
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(429);
    }
  });

  it('throws 429 when per-IP count exceeds limit', async () => {
    redis.exists.mockResolvedValue(0);
    redis.incr.mockResolvedValueOnce(11); // ip count > 10
    await expect(
      svc.assertCanVerify('+998901234567', '1.2.3.4'),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('throws 429 when per-dest count exceeds limit', async () => {
    redis.exists.mockResolvedValue(0);
    redis.incr
      .mockResolvedValueOnce(1)  // ip count OK
      .mockResolvedValueOnce(11); // dest count > 10
    await expect(
      svc.assertCanVerify('+998901234567', '1.2.3.4'),
    ).rejects.toBeInstanceOf(HttpException);
  });
});

describe('OtpRateLimitService.recordFailedVerify', () => {
  it('increments fail counter without locking when below threshold', async () => {
    const redis: any = {
      incr: jest.fn().mockResolvedValue(5), // below threshold of 15
      expire: jest.fn().mockResolvedValue(1),
      set: jest.fn(),
      del: jest.fn(),
    };
    const config: any = {
      get: jest.fn((key: string) => {
        const map: Record<string, number> = {
          'rateLimit.verifyFailThreshold': 15,
          'rateLimit.verifyFailTtlS': 3600,
          'rateLimit.verifyLockS': 900,
        };
        return map[key];
      }),
    };
    const svc = new OtpRateLimitService(redis as any, config as any);
    await svc.recordFailedVerify('+998901234567');
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('locks destination and resets counter when threshold reached', async () => {
    const redis: any = {
      incr: jest.fn().mockResolvedValue(15), // exactly at threshold
      expire: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    const config: any = {
      get: jest.fn((key: string) => {
        const map: Record<string, number> = {
          'rateLimit.verifyFailThreshold': 15,
          'rateLimit.verifyFailTtlS': 3600,
          'rateLimit.verifyLockS': 900,
        };
        return map[key];
      }),
    };
    const svc = new OtpRateLimitService(redis as any, config as any);
    await svc.recordFailedVerify('+998901234567');
    expect(redis.set).toHaveBeenCalledWith(
      'otp:verify:lock:+998901234567',
      '1',
      'EX',
      900,
    );
    expect(redis.del).toHaveBeenCalledWith('otp:verify:fail:+998901234567');
  });
});

describe('OtpRateLimitService.startCooldown — прогрессивная лестница', () => {
  function makeSvc(incrValue: number) {
    const redis: any = {
      incr: jest.fn().mockResolvedValue(incrValue),
      expire: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
    };
    const config: any = {
      get: jest.fn((key: string) =>
        key === 'otp.resendCooldown' ? 60 : undefined,
      ),
    };
    return { svc: new OtpRateLimitService(redis, config), redis };
  }

  it('первый запрос в окне → базовый cooldown 60с и TTL окна 15 мин', async () => {
    const { svc, redis } = makeSvc(1);
    await expect(
      svc.startCooldown(OtpChannel.SMS, '+998901234567'),
    ).resolves.toBe(60);
    expect(redis.incr).toHaveBeenCalledWith('otp:req:SMS:+998901234567');
    expect(redis.expire).toHaveBeenCalledWith(
      'otp:req:SMS:+998901234567',
      900,
    );
    expect(redis.set).toHaveBeenCalledWith(
      'otp:cooldown:SMS:+998901234567',
      '1',
      'EX',
      60,
    );
  });

  it('лестница: 2-й → 120с, 3-й и далее → 120с (потолок 2 мин)', async () => {
    await expect(
      makeSvc(2).svc.startCooldown(OtpChannel.SMS, '+998901234567'),
    ).resolves.toBe(120);
    await expect(
      makeSvc(3).svc.startCooldown(OtpChannel.SMS, '+998901234567'),
    ).resolves.toBe(120);
    await expect(
      makeSvc(9).svc.startCooldown(OtpChannel.SMS, '+998901234567'),
    ).resolves.toBe(120);
  });

  it('не первый запрос в окне — TTL окна не переустанавливается', async () => {
    const { svc, redis } = makeSvc(3);
    await svc.startCooldown(OtpChannel.SMS, '+998901234567');
    expect(redis.expire).not.toHaveBeenCalled();
  });
});

describe('OtpRateLimitService.assertCanRequest — канальный кап', () => {
  function makeSvc(reqCount: string | null) {
    const redis: any = {
      // 1-й вызов ttl — cooldown-ключа нет (-2); 2-й — TTL счётчика для текста ошибки.
      ttl: jest.fn().mockResolvedValueOnce(-2).mockResolvedValue(900),
      get: jest.fn().mockResolvedValue(reqCount),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };
    const config: any = {
      get: jest.fn((key: string) => {
        const map: Record<string, number> = {
          'rateLimit.window': 60,
          'rateLimit.max': 100,
        };
        return map[key];
      }),
    };
    return new OtpRateLimitService(redis as any, config as any);
  }

  it('пропускает, когда счётчика ещё нет', async () => {
    await expect(
      makeSvc(null).assertCanRequest(
        OtpChannel.SMS,
        '+998901234567',
        '1.2.3.4',
      ),
    ).resolves.toBeUndefined();
  });

  it('SMS: пропускает при count < 6', async () => {
    await expect(
      makeSvc('5').assertCanRequest(
        OtpChannel.SMS,
        '+998901234567',
        '1.2.3.4',
      ),
    ).resolves.toBeUndefined();
  });

  it('SMS: бросает 429 при count >= 6', async () => {
    await expect(
      makeSvc('6').assertCanRequest(OtpChannel.SMS, '+998901234567', '1.2.3.4'),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('EMAIL: пропускает при count < 10 (мягче SMS)', async () => {
    await expect(
      makeSvc('9').assertCanRequest(
        OtpChannel.EMAIL,
        'user@example.com',
        '1.2.3.4',
      ),
    ).resolves.toBeUndefined();
  });

  it('EMAIL: бросает 429 при count >= 10', async () => {
    await expect(
      makeSvc('10').assertCanRequest(
        OtpChannel.EMAIL,
        'user@example.com',
        '1.2.3.4',
      ),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
