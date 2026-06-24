import { HttpException } from '@nestjs/common';
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
