import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpChannel, OtpPurpose, UserStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { normalizeContact } from '../auth/contact.util';
import {
  consumeActiveOtpCode,
  createOtpCode,
  invalidateActiveOtpCodes,
} from '../auth/otp-code.util';
import { generateOtpCode, hashOtpCode } from '../auth/otp-hash.util';
import { OtpRateLimitService } from '../auth/otp-rate-limit.service';
import type { RequestOtpResult } from '../auth/otp.service';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { EmailService } from '../email';
import { PrismaService } from '../prisma';
import { SmsService } from '../sms';
import { TelegramService, formatOtpRequest } from '../telegram';
import { UserMeResponse, UsersService } from './users.service';

/**
 * ContactChangeService — смена ЛОГИН-контакта (телефон/email) с подтверждением
 * владения новым значением OTP-кодом (`OtpPurpose.CONTACT_CHANGE`).
 *
 * Отличия от OTP-логина (переиспользуем те же примитивы `otp-code.util`,
 * rate-limit и hash-утилиты, но НЕ весь AuthService — во избежание связности):
 *  - код всегда привязан к текущему аутентифицированному пользователю
 *    (`user_id = userId`, verify требует `expectUserId`);
 *  - смена применяется ТОЛЬКО после verify — до подтверждения контакт не меняется;
 *  - reviewer-bypass НЕ применяется (это операция над существующим аккаунтом);
 *  - уникальность нового контакта проверяется дважды: на request и повторно на
 *    verify (гонка — контакт мог занять другой аккаунт между шагами), только
 *    среди НЕ-DELETED аккаунтов (ADR-013).
 */
@Injectable()
export class ContactChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly rateLimit: OtpRateLimitService,
    private readonly sms: SmsService,
    private readonly email: EmailService,
    private readonly telegram: TelegramService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * `POST /api/v1/users/me/contact-change/request` — выписать OTP на НОВЫЙ контакт.
   * Смену НЕ применяет; возвращает тот же контракт, что и OTP-логин-request.
   */
  async requestContactChange(
    userId: string,
    dto: { channel: OtpChannel; destination: string },
    ip: string,
  ): Promise<RequestOtpResult> {
    const destination = this.normalizeOrThrow(dto.channel, dto.destination);

    const current = await this.prisma.user.findFirst({
      where: { id: userId, status: { not: UserStatus.DELETED } },
      select: { phone: true, email: true },
    });
    if (!current) {
      throw this.gone();
    }

    // Новое значение совпадает с текущим — менять нечего (VALIDATION_ERROR).
    const currentContact =
      dto.channel === OtpChannel.SMS ? current.phone : current.email;
    if (destination === currentContact) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'New contact matches the current one',
        details: [{ field: 'destination', issue: 'must differ from current' }],
      });
    }

    await this.assertContactFree(dto.channel, destination, userId);

    // Канал SMS может быть выключен админом — падаем до генерации кода
    // (как OTP-логин), кроме staging Telegram-доставки.
    const telegramDelivery =
      this.config.get<boolean>('otp.telegramDelivery') ?? false;
    if (
      dto.channel === OtpChannel.SMS &&
      !telegramDelivery &&
      !(await this.sms.isEnabled())
    ) {
      throw new ServiceUnavailableException({
        code: ApiErrorCode.AUTH_PROVIDER_UNAVAILABLE,
        message: 'SMS channel is temporarily unavailable',
      });
    }

    await this.rateLimit.assertCanRequest(dto.channel, destination, ip);

    const ttl = this.config.get<number>('otp.ttl') ?? 300;
    const code = generateOtpCode();
    const codeHash = await hashOtpCode(code);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    // Гасим прежние CONTACT_CHANGE-коды на этот контакт — валиден только новый.
    await invalidateActiveOtpCodes(
      this.prisma,
      destination,
      OtpPurpose.CONTACT_CHANGE,
    );
    await createOtpCode(this.prisma, {
      userId,
      channel: dto.channel,
      destination,
      purpose: OtpPurpose.CONTACT_CHANGE,
      codeHash,
      expiresAt,
    });

    await this.deliver(dto.channel, destination, code, ip, telegramDelivery);

    const resendAfter = await this.rateLimit.startCooldown(
      dto.channel,
      destination,
    );

    return {
      request_id: `otp_${randomBytes(4).toString('hex')}`,
      channel: dto.channel,
      expires_in: ttl,
      resend_after: resendAfter,
    };
  }

  /**
   * `POST /api/v1/users/me/contact-change/verify` — подтвердить владение новым
   * контактом и применить смену. Возвращает обновлённый `/me`.
   */
  async verifyContactChange(
    userId: string,
    dto: { channel: OtpChannel; destination: string; code: string },
    ip: string,
  ): Promise<UserMeResponse> {
    const destination = this.normalizeOrThrow(dto.channel, dto.destination);

    // Brute-force guard (per-IP/per-dest + кумулятивный lock) — до DB-доступа.
    await this.rateLimit.assertCanVerify(destination, ip);

    const maxAttempts = this.config.get<number>('otp.maxAttempts') ?? 5;

    // Проверка+погашение последнего активного CONTACT_CHANGE-кода, выписанного
    // ИМЕННО этому пользователю (expectUserId) — чужой код не подойдёт.
    await consumeActiveOtpCode(this.prisma, {
      destination,
      code: dto.code,
      purpose: OtpPurpose.CONTACT_CHANGE,
      maxAttempts,
      expectUserId: userId,
      onFailedAttempt: (dest) => void this.rateLimit.recordFailedVerify(dest),
    });

    // Повторная uniqueness-проверка: контакт мог занять другой аккаунт между
    // request и verify.
    await this.assertContactFree(dto.channel, destination, userId);

    // Применяем смену и помечаем канал verified (успешный OTP доказывает владение).
    const data =
      dto.channel === OtpChannel.SMS
        ? { phone: destination, isPhoneVerified: true }
        : { email: destination, isEmailVerified: true };
    await this.prisma.user.update({ where: { id: userId }, data });

    return this.usersService.getMe(userId);
  }

  /** Нормализовать контакт по каналу или бросить VALIDATION_ERROR. */
  private normalizeOrThrow(channel: OtpChannel, destination: string): string {
    const normalized = normalizeContact(channel, destination);
    if (!normalized) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Invalid destination for the selected channel',
        details: [
          {
            field: 'destination',
            issue:
              channel === OtpChannel.SMS
                ? 'must be a valid E.164 phone number'
                : 'must be a valid email address',
          },
        ],
      });
    }
    return normalized;
  }

  /**
   * Убедиться, что контакт свободен среди НЕ-DELETED аккаунтов, кроме самого
   * пользователя (ADR-013). Занят → CONTACT_TAKEN.
   */
  private async assertContactFree(
    channel: OtpChannel,
    destination: string,
    userId: string,
  ): Promise<void> {
    const where =
      channel === OtpChannel.SMS
        ? { phone: destination }
        : { email: destination };
    const taken = await this.prisma.user.findFirst({
      where: { ...where, status: { not: UserStatus.DELETED }, id: { not: userId } },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException({
        code: ApiErrorCode.CONTACT_TAKEN,
        message:
          channel === OtpChannel.SMS
            ? 'Phone is already in use'
            : 'Email is already in use',
      });
    }
  }

  /**
   * Доставка кода (как OTP-логин): staging Telegram-доставка (код в admin-чат,
   * минуя Eskiz) либо обычный SMS/Email + best-effort admin-алерт с кодом,
   * гейтящийся флагом TELEGRAM_INCLUDE_OTP_CODE.
   */
  private async deliver(
    channel: OtpChannel,
    destination: string,
    code: string,
    ip: string,
    telegramDelivery: boolean,
  ): Promise<void> {
    if (channel === OtpChannel.SMS && telegramDelivery) {
      await this.telegram.sendAdminAlert(
        formatOtpRequest({ destination, channel, code, ip, isNewUser: false }),
      );
      return;
    }

    if (channel === OtpChannel.SMS) {
      await this.sms.sendOtp(destination, code);
    } else {
      await this.email.sendOtp(destination, code);
    }

    const includeCode =
      this.config.get<boolean>('telegram.includeOtpCode') ?? false;
    void this.telegram.sendAdminAlert(
      formatOtpRequest({
        destination,
        channel,
        code: includeCode ? code : undefined,
        ip,
        isNewUser: false,
      }),
    );
  }

  /** Валидный токен, но аккаунта уже нет/он DELETED → трактуем как 401. */
  private gone(): UnauthorizedException {
    return new UnauthorizedException({
      code: ApiErrorCode.UNAUTHORIZED,
      message: 'Account not found or inactive',
    });
  }
}
