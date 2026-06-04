import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpChannel } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { RedisService } from '../redis';

/**
 * Rate-limit запросов OTP (TASK-041, DB_SCHEMA §15, ARCHITECTURE §23).
 *
 * Две независимые оси, как требует контракт «per destination + per IP» (API.md §3):
 * - **per destination** — cooldown между запросами на один контакт
 *   (`OTP_RESEND_COOLDOWN`): защищает конкретный номер/почту от SMS-bombing;
 * - **per IP** — счётчик в фиксированном окне (`RATE_LIMIT_WINDOW` /
 *   `RATE_LIMIT_MAX`): защищает от перебора получателей с одного источника.
 *
 * Хранилище — Redis (атомарные INCR/EXPIRE, TTL переживает рестарт API).
 * Превышение любой оси → `429 RATE_LIMITED` (единый error-envelope).
 *
 * Примечание: суточный объёмный cap на один контакт — отдельная мера hardening
 * (см. ADR-0012), здесь намеренно не реализован, чтобы не плодить недокументи-
 * рованные env-кнобы.
 */
@Injectable()
export class OtpRateLimitService {
  constructor(
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Проверить лимиты ДО отправки. Бросает `429 RATE_LIMITED`, если запрос
   * следует слишком рано (cooldown) или с IP превышен оконный лимит.
   */
  async assertCanRequest(
    channel: OtpChannel,
    destination: string,
    ip: string,
  ): Promise<void> {
    const cooldownKey = this.cooldownKey(channel, destination);
    const remaining = await this.redis.ttl(cooldownKey);
    if (remaining > 0) {
      throw this.rateLimited(
        `Please wait ${remaining}s before requesting a new code`,
      );
    }

    const window = this.configService.get<number>('rateLimit.window') ?? 60;
    const max = this.configService.get<number>('rateLimit.max') ?? 100;
    const ipKey = this.ipKey(ip);
    const count = await this.redis.incr(ipKey);
    if (count === 1) {
      await this.redis.expire(ipKey, window);
    }
    if (count > max) {
      throw this.rateLimited('Too many requests, try again later');
    }
  }

  /**
   * Запустить cooldown на контакт после успешной постановки кода в доставку.
   * Возвращает длительность cooldown (для `resend_after` в ответе API).
   */
  async startCooldown(
    channel: OtpChannel,
    destination: string,
  ): Promise<number> {
    const cooldown = this.configService.get<number>('otp.resendCooldown') ?? 60;
    await this.redis.set(
      this.cooldownKey(channel, destination),
      '1',
      'EX',
      cooldown,
    );
    return cooldown;
  }

  private cooldownKey(channel: OtpChannel, destination: string): string {
    return `otp:cooldown:${channel}:${destination}`;
  }

  private ipKey(ip: string): string {
    return `otp:ip:${ip}`;
  }

  private rateLimited(message: string): HttpException {
    return new HttpException(
      { code: ApiErrorCode.RATE_LIMITED, message },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
