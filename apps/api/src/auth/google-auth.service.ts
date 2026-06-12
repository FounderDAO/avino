import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Language, UserStatus } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { TelegramService, formatLoginSuccess } from '../telegram';
import { VerifyOtpResult } from './auth.service';
import { TokenService } from './token.service';
import { GoogleLoginDto } from './dto/google-login.dto';

interface GooglePayload {
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
  sub: string;
}

interface ResolvedGoogleUser {
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
 * GoogleAuthService — passwordless вход через Google ID-token.
 *
 * Верификация токена офлайн через google-auth-library (проверка подписи/aud/
 * iss/exp); связывание аккаунта по верифицированному email (email_verified=true
 * обязателен). Логин=signup, как и в OTP-флоу. Сессия выпускается тем же
 * TokenService. Провайдер не настроен (нет GOOGLE_CLIENT_ID) → 503
 * AUTH_PROVIDER_UNAVAILABLE.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private client: OAuth2Client | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokenService: TokenService,
    private readonly telegram: TelegramService,
  ) {}

  async login(
    dto: GoogleLoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<VerifyOtpResult> {
    const clientId = this.config.get<string>('google.clientId');
    if (!clientId) {
      throw new HttpException(
        {
          code: ApiErrorCode.AUTH_PROVIDER_UNAVAILABLE,
          message: 'Google sign-in is not configured',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const payload = await this.verifyToken(dto.id_token, clientId);
    if (!payload.emailVerified) {
      throw new HttpException(
        {
          code: ApiErrorCode.UNAUTHORIZED,
          message: 'Google email is not verified',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

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
        metadata: { provider: 'GOOGLE' },
      },
    });

    // Admin-алерт об успешном входе (best-effort, fire-and-forget).
    void this.telegram.sendAdminAlert(
      formatLoginSuccess({
        destination: user.email,
        ip,
        isNewUser: isNew,
        roles: user.roles,
        provider: 'GOOGLE',
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
    clientId: string,
  ): Promise<GooglePayload> {
    if (!this.client) {
      this.client = new OAuth2Client(clientId);
    }
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      const p = ticket.getPayload();
      if (!p?.email || !p.sub) {
        throw new Error('Google payload missing email/sub');
      }
      return {
        email: p.email.toLowerCase(),
        emailVerified: p.email_verified === true,
        name: p.name,
        picture: p.picture,
        sub: p.sub,
      };
    } catch (err) {
      this.logger.warn(
        `Google token verification failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new HttpException(
        { code: ApiErrorCode.UNAUTHORIZED, message: 'Invalid Google token' },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /**
   * Найти активного (не-DELETED) пользователя по email или создать нового
   * (логин=signup). Контакт помечается verified; профиль сидируется из Google.
   */
  private async resolveByEmail(
    payload: GooglePayload,
  ): Promise<{ user: ResolvedGoogleUser; isNew: boolean }> {
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
      const first = payload.name?.split(' ')[0] ?? null;
      const last = payload.name?.split(' ').slice(1).join(' ') || null;
      const user = await tx.user.create({
        data: {
          email: payload.email,
          isEmailVerified: true,
          lastLoginAt: new Date(),
          profile: {
            create: {
              firstName: first,
              lastName: last,
              displayName: payload.name ?? null,
              avatarUrl: payload.picture ?? null,
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
  }): ResolvedGoogleUser {
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
