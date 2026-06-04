import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { hashRefreshToken } from './token.util';

/** Полезная нагрузка refresh-JWT (TASK-042: `sub`+`fid`+`jti`). */
interface RefreshPayload {
  sub: string;
  fid: string;
  jti: string;
}

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
 * family по `fid`) реализованы в {@link rotateSession} (TASK-043); отзыв сессии
 * по запросу — {@link revokeSession} (logout).
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

  /**
   * Ротация refresh-токена (`POST /api/v1/auth/refresh`, API.md §3).
   *
   * Шаги:
   *  1. проверка подписи refresh-JWT (`JWT_REFRESH_SECRET`); ошибка истечения →
   *     `TOKEN_EXPIRED`, любая другая → `TOKEN_INVALID`;
   *  2. поиск строки `refresh_tokens` по `jti` и сверка хеша/владельца/family —
   *     рассинхрон → `TOKEN_INVALID`;
   *  3. **reuse-detection**: строка уже отозвана (`revoked_at`) → токен ротирован
   *     ранее, его повторное предъявление компрометирует сессию → отзываем всю
   *     family и `TOKEN_REUSED`;
   *  4. истёкшая по БД строка → `TOKEN_EXPIRED`; неактивный пользователь →
   *     отзыв family + `TOKEN_INVALID`;
   *  5. ротация в одной транзакции: текущая строка помечается `revoked_at`, в той
   *     же family создаётся новая; роли в новый access-токен берутся свежими из БД.
   */
  async rotateSession(
    refreshToken: string,
    ip?: string | null,
    userAgent?: string | null,
  ): Promise<IssuedTokens> {
    const refreshSecret = this.config.get<string>('jwt.refreshSecret')!;

    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: refreshSecret,
      });
    } catch (err) {
      const expired = err instanceof Error && err.name === 'TokenExpiredError';
      throw this.tokenError(
        expired ? ApiErrorCode.TOKEN_EXPIRED : ApiErrorCode.TOKEN_INVALID,
        expired ? 'Refresh token has expired' : 'Invalid refresh token',
      );
    }

    const tokenHash = hashRefreshToken(refreshToken, refreshSecret);
    const row = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
    });

    // Подпись валидна, но строка должна точно соответствовать токену: иначе это
    // подделанный/чужой jti.
    if (
      !row ||
      row.tokenHash !== tokenHash ||
      row.userId !== payload.sub ||
      row.familyId !== payload.fid
    ) {
      throw this.tokenError(
        ApiErrorCode.TOKEN_INVALID,
        'Invalid refresh token',
      );
    }

    // Предъявлен уже ротированный (отозванный) токен → вся session family
    // считается скомпрометированной.
    if (row.revokedAt) {
      await this.revokeFamily(row.familyId);
      throw this.tokenError(
        ApiErrorCode.TOKEN_REUSED,
        'Refresh token reuse detected, session revoked',
      );
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      throw this.tokenError(
        ApiErrorCode.TOKEN_EXPIRED,
        'Refresh token has expired',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: row.userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      // Заблокированный/удалённый пользователь не должен продлевать сессию.
      await this.revokeFamily(row.familyId);
      throw this.tokenError(
        ApiErrorCode.TOKEN_INVALID,
        'Invalid refresh token',
      );
    }
    const roles = user.roles.map((r) => r.role.code);

    const accessTtl = this.config.get<number>('jwt.accessTtl') ?? 900;
    const refreshTtl = this.config.get<number>('jwt.refreshTtl') ?? 2592000;
    const accessSecret = this.config.get<string>('jwt.accessSecret')!;

    const newTokenId = randomUUID();
    const accessToken = await this.jwt.signAsync(
      { sub: row.userId, roles },
      { secret: accessSecret, expiresIn: accessTtl },
    );
    const newRefreshToken = await this.jwt.signAsync(
      { sub: row.userId, fid: row.familyId },
      { secret: refreshSecret, expiresIn: refreshTtl, jwtid: newTokenId },
    );

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          id: newTokenId,
          userId: row.userId,
          tokenHash: hashRefreshToken(newRefreshToken, refreshSecret),
          familyId: row.familyId,
          userAgent: userAgent ?? null,
          ip: ip ? ip.slice(0, 64) : null,
          expiresAt: new Date(Date.now() + refreshTtl * 1000),
        },
      }),
    ]);

    return { accessToken, refreshToken: newRefreshToken, expiresIn: accessTtl };
  }

  /**
   * Отзыв сессии по refresh-токену (`POST /api/v1/auth/logout`, API.md §3).
   *
   * Logout идемпотентен и не верифицирует подпись: строка ищется по
   * детерминированному хешу токена. Найдена → отзываем всю family (любой её
   * токен после этого даст `TOKEN_REUSED`) и возвращаем `userId` для аудита; не
   * найдена → `null` (ответ всё равно 204 — не раскрываем существование сессии).
   */
  async revokeSession(refreshToken: string): Promise<string | null> {
    const refreshSecret = this.config.get<string>('jwt.refreshSecret')!;
    const tokenHash = hashRefreshToken(refreshToken, refreshSecret);
    const row = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
    });
    if (!row) {
      return null;
    }
    await this.revokeFamily(row.familyId);
    return row.userId;
  }

  /** Отозвать все ещё активные токены session family (reuse / logout). */
  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private tokenError(code: ApiErrorCode, message: string): HttpException {
    // Все ошибки refresh/logout — 401 (API.md §3).
    return new HttpException({ code, message }, HttpStatus.UNAUTHORIZED);
  }
}
