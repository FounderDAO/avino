import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Language, UserStatus } from '@prisma/client';
import appleSignin from 'apple-signin-auth';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { TelegramService, formatLoginSuccess } from '../telegram';
import { VerifyOtpResult } from './auth.service';
import { TokenService } from './token.service';
import { AppleLoginDto } from './dto/apple-login.dto';

interface ApplePayload {
  email: string;
  emailVerified: boolean;
  sub: string;
  firstName: string | null;
  lastName: string | null;
}

interface ResolvedAppleUser {
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
 * AppleAuthService — passwordless вход через Apple ID (Sign in with Apple).
 *
 * Верификация ID-token офлайн через apple-signin-auth (подпись по JWKS Apple,
 * aud ∈ APPLE_CLIENT_ID, exp); связывание по верифицированному email (как
 * GoogleAuthService/ADR-0065). Логин=signup. Сессия — общим TokenService.
 * Провайдер не настроен (нет APPLE_CLIENT_ID) → 503 AUTH_PROVIDER_UNAVAILABLE.
 */
@Injectable()
export class AppleAuthService {
  private readonly logger = new Logger(AppleAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokenService: TokenService,
    private readonly telegram: TelegramService,
  ) {}

  async login(
    dto: AppleLoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<VerifyOtpResult> {
    const clientIds = this.config.get<string[]>('apple.clientIds');
    if (!clientIds || clientIds.length === 0) {
      throw new HttpException(
        {
          code: ApiErrorCode.AUTH_PROVIDER_UNAVAILABLE,
          message: 'Apple sign-in is not configured',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const verified = await this.verifyToken(dto.id_token, clientIds);
    if (!verified.emailVerified) {
      throw new HttpException(
        {
          code: ApiErrorCode.UNAUTHORIZED,
          message: 'Apple email is not verified',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const payload: ApplePayload = {
      ...verified,
      firstName: dto.first_name?.trim() || null,
      lastName: dto.last_name?.trim() || null,
    };

    const { user, isNew } = await this.resolveByEmail(payload);

    const tokens = await this.tokenService.issueSession({
      userId: user.id,
      roles: user.roles,
      ip,
      userAgent,
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'LOGIN',
        entityType: 'user',
        entityId: user.id,
        ip: ip ? ip.slice(0, 64) : null,
        userAgent: userAgent ?? null,
        metadata: { provider: 'APPLE' },
      },
    });

    // Admin-алерт об успешном входе (best-effort, fire-and-forget).
    void this.telegram.sendAdminAlert(
      formatLoginSuccess({
        destination: user.email,
        ip,
        isNewUser: isNew,
        roles: user.roles,
        provider: 'APPLE',
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

  private async verifyToken(
    idToken: string,
    clientIds: string[],
  ): Promise<Omit<ApplePayload, 'firstName' | 'lastName'>> {
    try {
      const p = await appleSignin.verifyIdToken(idToken, {
        audience: clientIds,
        ignoreExpiration: false,
      });
      if (!p?.email || !p.sub) {
        throw new Error('Apple payload missing email/sub');
      }
      // Apple отдаёт email_verified / is_private_email иногда строкой "true".
      const emailVerified = p.email_verified === true || p.email_verified === 'true';
      return {
        email: p.email.toLowerCase(),
        emailVerified,
        sub: p.sub,
      };
    } catch (err) {
      this.logger.warn(
        `Apple token verification failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new HttpException(
        { code: ApiErrorCode.UNAUTHORIZED, message: 'Invalid Apple token' },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /**
   * Найти активного (не-DELETED) пользователя по email или создать нового
   * (логин=signup). Email помечается verified; имя профиля — из DTO (Apple даёт
   * имя только при первой авторизации), иначе пусто.
   */
  private async resolveByEmail(
    payload: ApplePayload,
  ): Promise<{ user: ResolvedAppleUser; isNew: boolean }> {
    const existing = await this.prisma.user.findFirst({
      where: { email: payload.email, status: { not: UserStatus.DELETED } },
      include: { roles: { include: { role: true } } },
    });

    if (existing) {
      if (existing.status === UserStatus.BLOCKED) {
        throw new ForbiddenException({
          code: ApiErrorCode.USER_BLOCKED,
          message: 'Account is blocked',
        });
      }
      const updated = await this.prisma.user.update({
        where: { id: existing.id },
        data: { isEmailVerified: true, lastLoginAt: new Date() },
        include: { roles: { include: { role: true } } },
      });
      return { user: this.toResolved(updated), isNew: false };
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const displayName =
        [payload.firstName, payload.lastName].filter(Boolean).join(' ') || null;
      const user = await tx.user.create({
        data: {
          email: payload.email,
          isEmailVerified: true,
          lastLoginAt: new Date(),
          profile: {
            create: {
              firstName: payload.firstName,
              lastName: payload.lastName,
              displayName,
              avatarUrl: null,
            },
          },
        },
      });
      const role = await tx.role.findUnique({
        where: { code: UserRole.USER },
        select: { id: true },
      });
      if (role) {
        await tx.userRole.create({
          data: { userId: user.id, roleId: role.id },
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { roles: { include: { role: true } } },
      });
    });

    return { user: this.toResolved(created), isNew: true };
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
  }): ResolvedAppleUser {
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
}
