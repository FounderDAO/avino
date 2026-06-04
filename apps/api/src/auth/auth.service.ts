import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Language, OtpChannel, OtpPurpose, UserStatus } from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { normalizeContact } from './contact.util';
import { verifyOtpCode } from './otp-hash.util';
import { TokenService } from './token.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

/** Сводка пользователя в ответе verify (API.md §3). */
export interface AuthUserSummary {
  id: string;
  phone: string | null;
  email: string | null;
  default_language: Language;
  status: UserStatus;
  roles: string[];
  is_phone_verified: boolean;
  is_email_verified: boolean;
}

/** Ответ `POST /api/v1/auth/otp/verify` (API.md §3). */
export interface VerifyOtpResult {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: AuthUserSummary;
}

/** Ответ `POST /api/v1/auth/refresh` (API.md §3) — без блока `user`. */
export interface RefreshResult {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

/** Внутреннее представление пользователя после resolve (создан или найден). */
interface ResolvedUser {
  id: string;
  phone: string | null;
  email: string | null;
  defaultLanguage: Language;
  status: UserStatus;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  roles: string[];
}

/**
 * AuthService — подтверждение OTP, создание пользователя и выпуск сессии
 * (TASK-042, API.md §3, ARCHITECTURE §6).
 *
 * Flow `verify`:
 *  1. нормализация контакта (VALIDATION_ERROR при неверном формате);
 *  2. выбор последнего невыданного кода на этот контакт (request гасит прежние,
 *     см. {@link OtpService}); отсутствие → OTP_INVALID;
 *  3. проверки истечения / лимита попыток / совпадения хеша — с инкрементом
 *     `attempts` и локаутом (OTP_ATTEMPTS_EXCEEDED) при исчерпании лимита;
 *  4. успешный код гасится (`consumed_at`) — одноразовость;
 *  5. resolve пользователя: найден активный → отметить контакт verified и
 *     last_login; нет → создать пользователя + базовую роль USER (login = signup,
 *     ADR-0010); BLOCKED → USER_BLOCKED;
 *  6. выпуск access+refresh ({@link TokenService}) — refresh хранится хешированным;
 *  7. запись в `audit_logs` (action `LOGIN`).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokenService: TokenService,
  ) {}

  async verifyOtp(
    dto: VerifyOtpDto,
    ip: string,
    userAgent?: string,
  ): Promise<VerifyOtpResult> {
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

    const maxAttempts = this.config.get<number>('otp.maxAttempts') ?? 5;

    // Последний активный код на контакт: request гасит прежние, поэтому валиден
    // только самый свежий неиспользованный.
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        destination,
        purpose: OtpPurpose.LOGIN,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw this.otpError(
        ApiErrorCode.OTP_INVALID,
        HttpStatus.BAD_REQUEST,
        'Invalid verification code',
      );
    }

    if (otp.expiresAt.getTime() <= Date.now()) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      });
      throw this.otpError(
        ApiErrorCode.OTP_EXPIRED,
        HttpStatus.BAD_REQUEST,
        'Verification code has expired',
      );
    }

    if (otp.attempts >= maxAttempts) {
      throw this.otpError(
        ApiErrorCode.OTP_ATTEMPTS_EXCEEDED,
        HttpStatus.TOO_MANY_REQUESTS,
        'Too many invalid attempts, request a new code',
      );
    }

    const matches = await verifyOtpCode(dto.code, otp.codeHash);
    if (!matches) {
      const attempts = otp.attempts + 1;
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts },
      });
      // Если эта попытка исчерпала лимит — сразу локаут, иначе обычный мисс.
      throw attempts >= maxAttempts
        ? this.otpError(
            ApiErrorCode.OTP_ATTEMPTS_EXCEEDED,
            HttpStatus.TOO_MANY_REQUESTS,
            'Too many invalid attempts, request a new code',
          )
        : this.otpError(
            ApiErrorCode.OTP_INVALID,
            HttpStatus.BAD_REQUEST,
            'Invalid verification code',
          );
    }

    // Успех: код одноразовый — гасим, чтобы повторный verify не прошёл.
    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    const user = await this.resolveUser(dto.channel, destination);

    const tokens = await this.tokenService.issueSession({
      userId: user.id,
      roles: user.roles,
      ip,
      userAgent,
    });

    await this.writeLoginAudit(user.id, ip, userAgent, dto.channel);

    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: 'Bearer',
      expires_in: tokens.expiresIn,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        default_language: user.defaultLanguage,
        status: user.status,
        roles: user.roles,
        is_phone_verified: user.isPhoneVerified,
        is_email_verified: user.isEmailVerified,
      },
    };
  }

  /**
   * Ротация refresh-токена (`POST /api/v1/auth/refresh`, API.md §3, TASK-043).
   * Делегирует {@link TokenService.rotateSession}; reuse-detection и отзыв family
   * — внутри сервиса токенов.
   */
  async refresh(
    dto: RefreshTokenDto,
    ip: string,
    userAgent?: string,
  ): Promise<RefreshResult> {
    const tokens = await this.tokenService.rotateSession(
      dto.refresh_token,
      ip,
      userAgent,
    );
    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: 'Bearer',
      expires_in: tokens.expiresIn,
    };
  }

  /**
   * Отзыв сессии (`POST /api/v1/auth/logout`, API.md §3, TASK-043) → 204.
   * Идемпотентен; при найденной сессии пишет `audit_logs` (`action='LOGOUT'`).
   */
  async logout(
    dto: RefreshTokenDto,
    ip: string,
    userAgent?: string,
  ): Promise<void> {
    const userId = await this.tokenService.revokeSession(dto.refresh_token);
    if (userId) {
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action: 'LOGOUT',
          entityType: 'user',
          entityId: userId,
          ip: ip ? ip.slice(0, 64) : null,
          userAgent: userAgent ?? null,
        },
      });
    }
  }

  /**
   * Найти активного (не-DELETED) пользователя по контакту или создать нового.
   * Логин по OTP — это одновременно регистрация (ADR-0010): первого входа
   * достаточно для создания аккаунта с базовой ролью USER.
   */
  private async resolveUser(
    channel: OtpChannel,
    destination: string,
  ): Promise<ResolvedUser> {
    const where =
      channel === OtpChannel.SMS
        ? { phone: destination }
        : { email: destination };

    const existing = await this.prisma.user.findFirst({
      where: { ...where, status: { not: UserStatus.DELETED } },
      include: { roles: { include: { role: true } } },
    });

    if (existing) {
      if (existing.status === UserStatus.BLOCKED) {
        throw new ForbiddenException({
          code: ApiErrorCode.USER_BLOCKED,
          message: 'Account is blocked',
        });
      }
      const verified =
        channel === OtpChannel.SMS
          ? { isPhoneVerified: true }
          : { isEmailVerified: true };
      const updated = await this.prisma.user.update({
        where: { id: existing.id },
        data: { ...verified, lastLoginAt: new Date() },
        include: { roles: { include: { role: true } } },
      });
      return this.toResolved(updated);
    }

    // Новый пользователь + роль USER в одной транзакции (атомарность signup).
    const created = await this.prisma.$transaction(async (tx) => {
      const contact =
        channel === OtpChannel.SMS
          ? { phone: destination, isPhoneVerified: true }
          : { email: destination, isEmailVerified: true };
      const user = await tx.user.create({
        data: { ...contact, lastLoginAt: new Date() },
      });
      const userRole = await tx.role.findUnique({
        where: { code: UserRole.USER },
        select: { id: true },
      });
      if (userRole) {
        await tx.userRole.create({
          data: { userId: user.id, roleId: userRole.id },
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { roles: { include: { role: true } } },
      });
    });

    return this.toResolved(created);
  }

  private toResolved(user: {
    id: string;
    phone: string | null;
    email: string | null;
    defaultLanguage: Language;
    status: UserStatus;
    isPhoneVerified: boolean;
    isEmailVerified: boolean;
    roles: { role: { code: string } }[];
  }): ResolvedUser {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      defaultLanguage: user.defaultLanguage,
      status: user.status,
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
      roles: user.roles.map((r) => r.role.code),
    };
  }

  private async writeLoginAudit(
    userId: string,
    ip: string,
    userAgent: string | undefined,
    channel: OtpChannel,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'LOGIN',
        entityType: 'user',
        entityId: userId,
        ip: ip ? ip.slice(0, 64) : null,
        userAgent: userAgent ?? null,
        metadata: { channel },
      },
    });
  }

  private otpError(
    code: ApiErrorCode,
    status: HttpStatus,
    message: string,
  ): HttpException {
    return new HttpException({ code, message }, status);
  }
}
