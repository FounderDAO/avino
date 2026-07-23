import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpChannel } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { RedisService } from '../redis';

/**
 * Лестница cooldown между повторными запросами кода на один контакт:
 * множители базового `OTP_RESEND_COOLDOWN` по номеру запроса в rolling-окне.
 * 1-й → ×1 (60с), 2-й и далее → ×2 (120с). Потолок — 2 минуты: раньше
 * лестница уходила в 5/10 минут, что для обычного пользователя читалось как
 * «система не даёт войти».
 */
const RESEND_COOLDOWN_MULTIPLIERS = [1, 2] as const;

/**
 * Кап кодов на один контакт в rolling-окне {@link REQUEST_WINDOW_S}. Свой на
 * канал: e-mail дешёв — даём больше; SMS бьёт по бюджету Eskiz — строже.
 * Окно короткое (15 мин, не сутки), поэтому исчерпание капа больше не даёт
 * ожидания «час и дольше»: счётчик восстанавливается максимум за окно.
 */
const REQUEST_CAP: Record<OtpChannel, number> = {
  [OtpChannel.EMAIL]: 10,
  [OtpChannel.SMS]: 6,
};
const REQUEST_WINDOW_S = 900;

/**
 * Rate-limit запросов OTP (TASK-041, DB_SCHEMA §15, ARCHITECTURE §23).
 *
 * Оси защиты, как требует контракт «per destination + per IP» (API.md §3):
 * - **per destination** — прогрессивный cooldown между запросами на один
 *   контакт (лестница {@link RESEND_COOLDOWN_MULTIPLIERS} от
 *   `OTP_RESEND_COOLDOWN`) + канальный кап {@link REQUEST_CAP} кодов за
 *   rolling-окно {@link REQUEST_WINDOW_S} (ADR-0150): защищают номер/почту от
 *   SMS-bombing и бюджет SMS;
 * - **per IP** — счётчик в фиксированном окне (`RATE_LIMIT_WINDOW` /
 *   `RATE_LIMIT_MAX`): защищает от перебора получателей с одного источника.
 *
 * Хранилище — Redis (атомарные INCR/EXPIRE, TTL переживает рестарт API).
 * Превышение любой оси → `429 RATE_LIMITED` (единый error-envelope).
 * Лестница и кап — константы в коде, без env-кнобок (кроме базового cooldown).
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

    // Канальный кап на контакт (SMS-bombing + бюджет SMS): счётчик ведёт
    // startCooldown; здесь только читаем. >= cap → 429 до истечения окна.
    const reqKey = this.requestCountKey(channel, destination);
    const reqCount = Number((await this.redis.get(reqKey)) ?? 0);
    if (reqCount >= REQUEST_CAP[channel]) {
      const ttl = await this.redis.ttl(reqKey);
      throw this.rateLimited(
        `Code request limit for this contact reached. Try again in ${ttl}s`,
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
   * Длительность прогрессивная — ступень лестницы по номеру запроса в
   * rolling-окне {@link REQUEST_WINDOW_S} (счётчик и есть база канального
   * капа). Возвращает длительность cooldown (для `resend_after` в ответе API).
   */
  async startCooldown(
    channel: OtpChannel,
    destination: string,
  ): Promise<number> {
    const base = this.configService.get<number>('otp.resendCooldown') ?? 60;

    // Номер запроса в rolling-окне: INCR + TTL окна от первого запроса.
    const reqKey = this.requestCountKey(channel, destination);
    const count = await this.redis.incr(reqKey);
    if (count === 1) {
      await this.redis.expire(reqKey, REQUEST_WINDOW_S);
    }

    const idx = Math.min(count - 1, RESEND_COOLDOWN_MULTIPLIERS.length - 1);
    const cooldown = base * RESEND_COOLDOWN_MULTIPLIERS[idx];
    await this.redis.set(
      this.cooldownKey(channel, destination),
      '1',
      'EX',
      cooldown,
    );
    return cooldown;
  }

  /**
   * Проверить лимиты ПЕРЕД верификацией кода. Бросает 429 RATE_LIMITED если:
   * - destination заблокирован (кумулятивный brute-force lock);
   * - per-IP лимит верификаций за окно превышен;
   * - per-destination лимит верификаций за окно превышен.
   */
  async assertCanVerify(destination: string, ip: string): Promise<void> {
    // 1. Проверить блокировку destination.
    const lockKey = this.verifyLockKey(destination);
    const locked = await this.redis.exists(lockKey);
    if (locked) {
      const ttl = await this.redis.ttl(lockKey);
      throw this.rateLimited(
        `Too many failed attempts. Try again in ${ttl}s`,
      );
    }

    const window =
      this.configService.get<number>('rateLimit.verifyWindowS') ?? 60;

    // 2. Per-IP лимит.
    const maxPerIp =
      this.configService.get<number>('rateLimit.verifyMaxPerIp') ?? 10;
    const ipKey = this.verifyIpKey(ip);
    const ipCount = await this.redis.incr(ipKey);
    if (ipCount === 1) {
      await this.redis.expire(ipKey, window);
    }
    if (ipCount > maxPerIp) {
      throw this.rateLimited('Too many verification attempts, try again later');
    }

    // 3. Per-destination лимит.
    const maxPerDest =
      this.configService.get<number>('rateLimit.verifyMaxPerDest') ?? 10;
    const destKey = this.verifyDestKey(destination);
    const destCount = await this.redis.incr(destKey);
    if (destCount === 1) {
      await this.redis.expire(destKey, window);
    }
    if (destCount > maxPerDest) {
      throw this.rateLimited('Too many verification attempts for this contact');
    }
  }

  /**
   * Зафиксировать неудачную верификацию. Инкрементирует кумулятивный счётчик;
   * если достигнут порог — блокирует destination на verifyLockS секунд.
   * Вызывается при OTP_INVALID (неверный код); НЕ вызывается при OTP_EXPIRED
   * или OTP_ATTEMPTS_EXCEEDED (те — уже конечные состояния конкретного кода).
   */
  async recordFailedVerify(destination: string): Promise<void> {
    const threshold =
      this.configService.get<number>('rateLimit.verifyFailThreshold') ?? 15;
    const failTtl =
      this.configService.get<number>('rateLimit.verifyFailTtlS') ?? 3600;
    const lockS =
      this.configService.get<number>('rateLimit.verifyLockS') ?? 900;

    const failKey = this.verifyFailKey(destination);
    const failCount = await this.redis.incr(failKey);
    if (failCount === 1) {
      await this.redis.expire(failKey, failTtl);
    }
    if (failCount >= threshold) {
      await this.redis.set(this.verifyLockKey(destination), '1', 'EX', lockS);
      // Сброс кумулятивного счётчика (блокировка теперь активна — счётчик не нужен).
      await this.redis.del(failKey);
    }
  }

  private cooldownKey(channel: OtpChannel, destination: string): string {
    return `otp:cooldown:${channel}:${destination}`;
  }

  private requestCountKey(channel: OtpChannel, destination: string): string {
    return `otp:req:${channel}:${destination}`;
  }

  private ipKey(ip: string): string {
    return `otp:ip:${ip}`;
  }

  private verifyIpKey(ip: string): string {
    return `otp:verify:ip:${ip}`;
  }

  private verifyDestKey(destination: string): string {
    return `otp:verify:dest:${destination}`;
  }

  private verifyFailKey(destination: string): string {
    return `otp:verify:fail:${destination}`;
  }

  private verifyLockKey(destination: string): string {
    return `otp:verify:lock:${destination}`;
  }

  private rateLimited(message: string): HttpException {
    return new HttpException(
      { code: ApiErrorCode.RATE_LIMITED, message },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
