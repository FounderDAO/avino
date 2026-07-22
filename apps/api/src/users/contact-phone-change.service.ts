import {
  BadRequestException,
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
import { PrismaService } from '../prisma';
import { SmsService } from '../sms';
import { TelegramService, formatOtpRequest } from '../telegram';
import { UserMeResponse, UsersService } from './users.service';

/** Ответ request: смена применена сразу (без OTP) либо выписан код на новый номер. */
export type RequestContactPhoneResult =
  | { applied: true }
  | ({ applied: false } & RequestOtpResult);

/**
 * ContactPhoneChangeService — смена ПУБЛИЧНОГО контакт-телефона
 * (`user_profiles.contact_phone`) с подтверждением владения OTP-кодом
 * (`OtpPurpose.CONTACT_PHONE_CHANGE`). Отличия от ContactChangeService (логин):
 *  - только SMS (контакт — телефон);
 *  - БЕЗ проверки уникальности (один номер агентства может быть у нескольких агентов);
 *  - короткое замыкание: если новый номер = верифицированному логин-телефону,
 *    применяем сразу без кода (владение уже доказано этим аккаунтом);
 *  - применяет смену и ставит contactPhoneVerified=true только после verify.
 */
@Injectable()
export class ContactPhoneChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly rateLimit: OtpRateLimitService,
    private readonly sms: SmsService,
    private readonly telegram: TelegramService,
    private readonly usersService: UsersService,
  ) {}

  /** `POST /users/me/contact-phone/request` — короткое замыкание или OTP на новый номер. */
  async requestContactPhoneChange(
    userId: string,
    dto: { destination: string },
    ip: string,
  ): Promise<RequestContactPhoneResult> {
    const destination = this.normalizeOrThrow(dto.destination);

    const current = await this.prisma.user.findFirst({
      where: { id: userId, status: { not: UserStatus.DELETED } },
      select: {
        phone: true,
        isPhoneVerified: true,
        profile: { select: { contactPhone: true, contactPhoneVerified: true } },
      },
    });
    if (!current) {
      throw this.gone();
    }

    // Уже стоит этот же ПОДТВЕРЖДЁННЫЙ номер — менять нечего.
    if (
      current.profile?.contactPhoneVerified &&
      destination === current.profile.contactPhone
    ) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'New contact phone matches the current verified one',
        details: [{ field: 'destination', issue: 'must differ from current' }],
      });
    }

    // Короткое замыкание: номер = верифицированному логин-телефону → применяем без OTP.
    if (current.isPhoneVerified && destination === current.phone) {
      await this.applyContactPhone(userId, destination);
      return { applied: true };
    }

    // SMS-канал может быть выключен админом — падаем до генерации кода (кроме
    // staging Telegram-доставки).
    const telegramDelivery =
      this.config.get<boolean>('otp.telegramDelivery') ?? false;
    if (!telegramDelivery && !(await this.sms.isEnabled())) {
      throw new ServiceUnavailableException({
        code: ApiErrorCode.AUTH_PROVIDER_UNAVAILABLE,
        message: 'SMS channel is temporarily unavailable',
      });
    }

    await this.rateLimit.assertCanRequest(OtpChannel.SMS, destination, ip);

    const ttl = this.config.get<number>('otp.ttl') ?? 300;
    const code = generateOtpCode();
    const codeHash = await hashOtpCode(code);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    await invalidateActiveOtpCodes(
      this.prisma,
      destination,
      OtpPurpose.CONTACT_PHONE_CHANGE,
    );
    await createOtpCode(this.prisma, {
      userId,
      channel: OtpChannel.SMS,
      destination,
      purpose: OtpPurpose.CONTACT_PHONE_CHANGE,
      codeHash,
      expiresAt,
    });

    await this.deliver(destination, code, ip, telegramDelivery);

    const resendAfter = await this.rateLimit.startCooldown(
      OtpChannel.SMS,
      destination,
    );

    return {
      applied: false,
      request_id: `otp_${randomBytes(4).toString('hex')}`,
      channel: OtpChannel.SMS,
      expires_in: ttl,
      resend_after: resendAfter,
    };
  }

  /** `POST /users/me/contact-phone/verify` — подтвердить код и применить смену. */
  async verifyContactPhoneChange(
    userId: string,
    dto: { destination: string; code: string },
    ip: string,
  ): Promise<UserMeResponse> {
    const destination = this.normalizeOrThrow(dto.destination);

    await this.rateLimit.assertCanVerify(destination, ip);
    const maxAttempts = this.config.get<number>('otp.maxAttempts') ?? 5;

    await consumeActiveOtpCode(this.prisma, {
      destination,
      code: dto.code,
      purpose: OtpPurpose.CONTACT_PHONE_CHANGE,
      maxAttempts,
      expectUserId: userId,
      onFailedAttempt: (dest) => void this.rateLimit.recordFailedVerify(dest),
    });

    await this.applyContactPhone(userId, destination);
    return this.usersService.getMe(userId);
  }

  /** Записать контакт-телефон и пометить подтверждённым (профиль создаётся лениво). */
  private async applyContactPhone(userId: string, phone: string): Promise<void> {
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, contactPhone: phone, contactPhoneVerified: true },
      update: { contactPhone: phone, contactPhoneVerified: true },
    });
  }

  /** Нормализовать телефон (E.164) или бросить VALIDATION_ERROR. */
  private normalizeOrThrow(destination: string): string {
    const normalized = normalizeContact(OtpChannel.SMS, destination);
    if (!normalized) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Invalid phone number',
        details: [
          { field: 'destination', issue: 'must be a valid E.164 phone number' },
        ],
      });
    }
    return normalized;
  }

  /** Доставка кода: staging Telegram-доставка либо SMS + best-effort admin-алерт. */
  private async deliver(
    destination: string,
    code: string,
    ip: string,
    telegramDelivery: boolean,
  ): Promise<void> {
    if (telegramDelivery) {
      await this.telegram.sendAdminAlert(
        formatOtpRequest({
          destination,
          channel: OtpChannel.SMS,
          code,
          ip,
          isNewUser: false,
        }),
      );
      return;
    }

    await this.sms.sendOtp(destination, code);

    const includeCode =
      this.config.get<boolean>('telegram.includeOtpCode') ?? false;
    void this.telegram.sendAdminAlert(
      formatOtpRequest({
        destination,
        channel: OtpChannel.SMS,
        code: includeCode ? code : undefined,
        ip,
        isNewUser: false,
      }),
    );
  }

  /** Валидный токен, но аккаунта уже нет/DELETED → 401. */
  private gone(): UnauthorizedException {
    return new UnauthorizedException({
      code: ApiErrorCode.UNAUTHORIZED,
      message: 'Account not found or inactive',
    });
  }
}
