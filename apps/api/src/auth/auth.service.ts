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
import {
  TelegramService,
  formatLoginFailed,
  formatLoginSuccess,
} from '../telegram';
import { normalizeContact } from './contact.util';
import { verifyOtpCode } from './otp-hash.util';
import { OtpRateLimitService } from './otp-rate-limit.service';
import { TokenService } from './token.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SessionResponse } from './dto/session-response.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { MeResponse } from './dto/me-response.dto';
import { isReviewerBypass, type OtpBypassConfig } from './otp-bypass.util';
import { UploadsService } from '../uploads';
import { resolveAvatarUrl } from '../users/avatar-url.util';

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
  /** true, если пользователь создан этим логином (signup-as-login). */
  isNew: boolean;
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
    private readonly telegram: TelegramService,
    private readonly rateLimitService: OtpRateLimitService,
    private readonly uploads: UploadsService,
  ) {}

  /** Коды OTP-ошибок, на которые шлём admin-алерт о неудачном входе. */
  private static readonly ALERT_FAILURE_CODES = new Set<string>([
    ApiErrorCode.OTP_INVALID,
    ApiErrorCode.OTP_EXPIRED,
    ApiErrorCode.OTP_ATTEMPTS_EXCEEDED,
    ApiErrorCode.USER_BLOCKED,
  ]);

  /** Достаёт стабильный код ошибки из HttpException-пейлоада (или undefined). */
  private extractErrorCode(err: unknown): string | undefined {
    if (err instanceof HttpException) {
      const res = err.getResponse();
      if (typeof res === 'object' && res !== null && 'code' in res) {
        return (res as { code?: string }).code;
      }
    }
    return undefined;
  }

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

    // Brute-force guard: per-IP/per-dest window + cumulative lock (H-1).
    // Проверяем ДО любого DB-доступа, чтобы брутфорс не дотянулся до хеш-сравнения.
    await this.rateLimitService.assertCanVerify(destination, ip);

    try {
      // Обход OTP для номеров-ревьюверов (config-gated, default OFF): принимаем
      // любой 6-значный код (длину уже проверил DTO) и сразу завершаем вход.
      // Внутри try — чтобы USER_BLOCKED из resolveUser попал в failure-алерт.
      const bypass: OtpBypassConfig = {
        enabled: this.config.get<boolean>('otp.bypassEnabled') ?? false,
        phones: this.config.get<string[]>('otp.bypassPhones') ?? [],
      };
      if (isReviewerBypass(bypass, dto.channel, destination)) {
        return await this.completeLogin(dto.channel, destination, ip, userAgent);
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
        // Кумулятивный счётчик brute-force (H-1): запоминаем неудачу даже если
        // потом запросят новый код — бюджет не сбрасывается при ре-запросе.
        void this.rateLimitService.recordFailedVerify(destination);
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

      return await this.completeLogin(dto.channel, destination, ip, userAgent);
    } catch (err) {
      // Доменные OTP-ошибки → admin-алерт о неудачном входе, затем пробрасываем.
      const code = this.extractErrorCode(err);
      if (code && AuthService.ALERT_FAILURE_CODES.has(code)) {
        void this.telegram.sendAdminAlert(
          formatLoginFailed({
            destination,
            channel: dto.channel,
            ip,
            reason: code,
          }),
        );
      }
      throw err;
    }
  }

  /**
   * Завершение входа после успешной проверки кода ИЛИ обхода OTP (reviewer
   * bypass): resolve пользователя (signup-as-login), выпуск сессии, аудит LOGIN
   * и success-алерт. Возвращает контракт `verify` (API.md §3).
   */
  private async completeLogin(
    channel: OtpChannel,
    destination: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<VerifyOtpResult> {
    const user = await this.resolveUser(channel, destination);

    const tokens = await this.tokenService.issueSession({
      userId: user.id,
      roles: user.roles,
      ip,
      userAgent,
    });

    await this.writeLoginAudit(user.id, ip, userAgent, channel);

    // Admin-алерт об успешном входе (best-effort, fire-and-forget).
    void this.telegram.sendAdminAlert(
      formatLoginSuccess({
        destination,
        channel,
        ip,
        isNewUser: user.isNew,
        roles: user.roles,
      }),
    );

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
   * Текущий пользователь + профиль + роли (`GET /api/v1/auth/me`, API.md §3,
   * TASK-045). Bearer-аутентификацию выполняет {@link JwtAuthGuard}; сюда
   * приходит `userId` из `sub` access-токена (`@CurrentUser('id')`).
   *
   * Источник истины ролей здесь — БД (а не токен), чтобы `/auth/me` отдавал
   * актуальный набор ролей сразу после изменения (токен «свежеет» только при
   * ротации). DELETED-аккаунт по валидному токену трактуется как несуществующий
   * субъект → `401 UNAUTHORIZED`. `profile` присутствует всегда: при отсутствии
   * строки `user_profiles` поля null, а `preferred_language` берётся из
   * `default_language` пользователя (контракт фронта — non-null язык).
   */
  async getMe(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: { not: UserStatus.DELETED } },
      include: {
        profile: true,
        roles: { include: { role: true } },
        legalConsents: { orderBy: { version: 'desc' }, take: 1 },
      },
    });

    if (!user) {
      throw new HttpException(
        { code: ApiErrorCode.UNAUTHORIZED, message: 'Authentication required' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const latestConsent = user.legalConsents[0];
    // Загруженный аватар (avatarStorageKey) → свежая подписанная R2-ссылка;
    // иначе фото OAuth-провайдера или null (TASK-248, ADR-0134).
    const avatarUrl = await resolveAvatarUrl(
      this.uploads,
      user.profile?.avatarStorageKey,
      user.profile?.avatarUrl,
    );

    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      status: user.status,
      default_language: user.defaultLanguage,
      is_phone_verified: user.isPhoneVerified,
      is_email_verified: user.isEmailVerified,
      roles: user.roles.map((r) => r.role.code),
      profile: {
        first_name: user.profile?.firstName ?? null,
        last_name: user.profile?.lastName ?? null,
        display_name: user.profile?.displayName ?? null,
        avatar_url: avatarUrl,
        contact_phone: user.profile?.contactPhone ?? null,
        preferred_language:
          user.profile?.preferredLanguage ?? user.defaultLanguage,
      },
      legal_consent: {
        accepted_version: latestConsent?.version ?? null,
        accepted_at: latestConsent?.acceptedAt.toISOString() ?? null,
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
   * Активные сессии пользователя (`GET /api/v1/auth/sessions`, ADR-0143).
   * Делегирует {@link TokenService.listSessions}; `currentFamilyId` — `fid`
   * предъявленного access-токена (метит `is_current`).
   */
  async listSessions(
    userId: string,
    currentFamilyId?: string | null,
  ): Promise<SessionResponse[]> {
    const sessions = await this.tokenService.listSessions(
      userId,
      currentFamilyId,
    );
    return sessions.map((s) => ({
      id: s.familyId,
      created_at: s.createdAt.toISOString(),
      last_rotated_at: s.lastRotatedAt.toISOString(),
      user_agent: s.userAgent,
      ip: s.ip,
      is_current: s.isCurrent,
    }));
  }

  /**
   * Отозвать сессию по id family (`DELETE /api/v1/auth/sessions/:fid`,
   * ADR-0143) → 204. Family чужого пользователя или несуществующая → 404
   * NOT_FOUND (существование чужой сессии не раскрывается). Успешный отзыв
   * пишется в `audit_logs` (`action='SESSION_REVOKED'`).
   */
  async revokeSessionById(
    userId: string,
    familyId: string,
    ip: string,
    userAgent?: string,
  ): Promise<void> {
    const revoked = await this.tokenService.revokeUserFamily(userId, familyId);
    if (!revoked) {
      throw new HttpException(
        { code: ApiErrorCode.NOT_FOUND, message: 'Session not found' },
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'SESSION_REVOKED',
        entityType: 'refresh_token_family',
        entityId: familyId,
        ip: ip ? ip.slice(0, 64) : null,
        userAgent: userAgent ?? null,
      },
    });
  }

  /**
   * Найти активного (не-DELETED) пользователя по контакту или создать нового.
   * Логин по OTP — это одновременно регистрация (ADR-0010): первого входа
   * достаточно для создания аккаунта с базовой ролью USER.
   *
   * Account-linking (H-2): успешный OTP сам по себе доказывает контроль над
   * контактом, поэтому пометка verified и привязка к существующему аккаунту здесь
   * легитимны (в отличие от OAuth, где нужен флаг провайдера). Email и phone —
   * раздельные namespace'ы: SMS-вход матчится ТОЛЬКО по `phone`, email-вход ТОЛЬКО
   * по `email` — телефонный код не клеймит email-аккаунт и наоборот.
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
      return this.toResolved(updated, false);
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

    return this.toResolved(created, true);
  }

  private toResolved(
    user: {
      id: string;
      phone: string | null;
      email: string | null;
      defaultLanguage: Language;
      status: UserStatus;
      isPhoneVerified: boolean;
      isEmailVerified: boolean;
      roles: { role: { code: string } }[];
    },
    isNew: boolean,
  ): ResolvedUser {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      defaultLanguage: user.defaultLanguage,
      status: user.status,
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
      roles: user.roles.map((r) => r.role.code),
      isNew,
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
