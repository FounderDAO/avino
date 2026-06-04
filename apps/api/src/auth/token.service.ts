import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma';
import { hashRefreshToken } from './token.util';

/** Пара токенов сессии, отдаваемая клиенту (API.md §3). */
export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  /** TTL access-токена в секундах (для `expires_in`). */
  expiresIn: number;
}

/** Контекст выпуска сессии — кто и откуда логинится. */
export interface IssueSessionInput {
  userId: string;
  roles: string[];
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * TokenService — выпуск access/refresh-токенов и хранение refresh-сессии
 * (TASK-042, ADR-0010, ARCHITECTURE §6).
 *
 * Модель токенов:
 * - **access** — короткоживущий JWT, подписан `JWT_ACCESS_SECRET`, несёт `sub`
 *   (id пользователя) и `roles`; предъявляется как Bearer на каждом запросе
 *   (guard — TASK-044). Наружу только выдаётся, в БД не хранится.
 * - **refresh** — долгоживущий JWT, подписан ОТДЕЛЬНЫМ `JWT_REFRESH_SECRET`,
 *   несёт `sub`, `fid` (session family) и `jti` (= id строки `refresh_tokens`).
 *   В БД хранится только его детерминированный хеш ({@link hashRefreshToken}),
 *   а не значение.
 *
 * Ротация и reuse-detection (предъявление уже ротированного токена → отзыв всей
 * family по `fid`) — отдельный deliverable TASK-043; здесь только первичный
 * выпуск новой session family при логине.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Выпустить новую сессию (новая family) и сохранить refresh-строку.
   * Используется при успешном OTP-логине (TASK-042).
   */
  async issueSession(input: IssueSessionInput): Promise<IssuedTokens> {
    const accessTtl = this.config.get<number>('jwt.accessTtl') ?? 900;
    const refreshTtl = this.config.get<number>('jwt.refreshTtl') ?? 2592000;
    const accessSecret = this.config.get<string>('jwt.accessSecret')!;
    const refreshSecret = this.config.get<string>('jwt.refreshSecret')!;

    const familyId = randomUUID();
    // jti = id строки refresh_tokens: связывает токен с его записью в БД и даёт
    // TASK-043 опору для ротации/reuse-detection.
    const tokenId = randomUUID();

    const accessToken = await this.jwt.signAsync(
      { sub: input.userId, roles: input.roles },
      { secret: accessSecret, expiresIn: accessTtl },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: input.userId, fid: familyId },
      { secret: refreshSecret, expiresIn: refreshTtl, jwtid: tokenId },
    );

    await this.prisma.refreshToken.create({
      data: {
        id: tokenId,
        userId: input.userId,
        tokenHash: hashRefreshToken(refreshToken, refreshSecret),
        familyId,
        userAgent: input.userAgent ?? null,
        ip: input.ip ? input.ip.slice(0, 64) : null,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }
}
