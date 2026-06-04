import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpChannel, OtpPurpose, UserStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { EmailService } from '../email';
import { PrismaService } from '../prisma';
import { SmsService } from '../sms';
import { normalizeContact } from './contact.util';
import { generateOtpCode, hashOtpCode } from './otp-hash.util';
import { OtpRateLimitService } from './otp-rate-limit.service';
import { RequestOtpDto } from './dto/request-otp.dto';

/** Ответ `POST /api/v1/auth/otp/request` (API.md §3). */
export interface RequestOtpResult {
  request_id: string;
  channel: OtpChannel;
  expires_in: number;
  resend_after: number;
}

/**
 * OtpService — выпуск одноразовых кодов для OTP-логина (TASK-041).
 *
 * Flow `request`:
 *  1. нормализация и валидация контакта по каналу (VALIDATION_ERROR при сбое);
 *  2. rate-limit (per destination cooldown + per IP window);
 *  3. генерация кода и его МЕДЛЕННЫЙ хеш (scrypt) — plaintext не хранится;
 *  4. инвалидация прежних неиспользованных кодов на этот контакт (актуален
 *     только последний) — упрощает и обезопашивает verify (TASK-042);
 *  5. привязка к существующему НЕ-DELETED пользователю, если он есть
 *     (иначе user_id = null — pre-signup login, DB_SCHEMA §4);
 *  6. сохранение строки `otp_codes` со сроком истечения (`OTP_TTL`);
 *  7. доставка кода через SMS/Email-абстракцию;
 *  8. запуск cooldown.
 *
 * Сам код наружу не возвращается (только `request_id` как корреляция).
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly rateLimit: OtpRateLimitService,
    private readonly sms: SmsService,
    private readonly email: EmailService,
  ) {}

  async requestOtp(dto: RequestOtpDto, ip: string): Promise<RequestOtpResult> {
    const destination = normalizeContact(dto.channel, dto.destination);
    if (!destination) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Invalid destination for the selected channel',
        details: [
          {
            field: 'destination',
            issue:
              dto.channel === OtpChannel.SMS
                ? 'must be a valid E.164 phone number'
                : 'must be a valid email address',
          },
        ],
      });
    }

    await this.rateLimit.assertCanRequest(dto.channel, destination, ip);

    const ttl = this.configService.get<number>('otp.ttl') ?? 300;
    const code = generateOtpCode();
    const codeHash = await hashOtpCode(code);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    const user = await this.findActiveUser(dto.channel, destination);

    // Старые неиспользованные коды на этот контакт гасим — валиден только новый.
    await this.prisma.otpCode.updateMany({
      where: {
        destination,
        purpose: OtpPurpose.LOGIN,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });

    await this.prisma.otpCode.create({
      data: {
        userId: user?.id ?? null,
        channel: dto.channel,
        destination,
        purpose: OtpPurpose.LOGIN,
        codeHash,
        expiresAt,
      },
    });

    await this.deliver(dto.channel, destination, code);
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

  private async findActiveUser(
    channel: OtpChannel,
    destination: string,
  ): Promise<{ id: string } | null> {
    // Уникальность контакта — только среди НЕ-DELETED аккаунтов (ADR-013).
    const where =
      channel === OtpChannel.SMS
        ? { phone: destination }
        : { email: destination };
    return this.prisma.user.findFirst({
      where: { ...where, status: { not: UserStatus.DELETED } },
      select: { id: true },
    });
  }

  private async deliver(
    channel: OtpChannel,
    destination: string,
    code: string,
  ): Promise<void> {
    if (channel === OtpChannel.SMS) {
      await this.sms.sendOtp(destination, code);
    } else {
      await this.email.sendOtp(destination, code);
    }
  }
}
