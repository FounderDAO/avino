import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../dto/error-response.dto';

/**
 * Аутентифицированный пользователь, который {@link JwtAuthGuard} кладёт в
 * `request.user` из payload access-токена. Это контракт между guard'ом (producer)
 * и потребителями — {@link RolesGuard} и декоратором `@CurrentUser()`.
 *
 * Источник истины здесь — сам access-токен (`sub`+`roles`), а не БД: guard не
 * ходит в базу на каждый запрос (роли «свежими» пере-вшиваются при ротации,
 * TASK-043 {@link TokenService}).
 */
export interface AuthenticatedUser {
  /** id пользователя (`sub` access-токена). */
  id: string;
  /** Роли пользователя на момент выпуска токена. */
  roles: UserRole[];
}

/** Полезная нагрузка access-JWT (выпускается {@link TokenService}). */
interface AccessPayload {
  sub: string;
  roles?: string[];
}

/** Минимальный структурный тип запроса — без зависимости от `@types/express`. */
export interface RequestLike {
  headers?: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}

/**
 * JwtAuthGuard — Bearer-аутентификация по access-токену (TASK-044, API.md §3).
 *
 * Шаги:
 *  1. извлечь `Authorization: Bearer <token>`; нет/не Bearer → `401 UNAUTHORIZED`;
 *  2. проверить подпись `JWT_ACCESS_SECRET` (тот же per-call секрет, что и при
 *     выпуске — ADR-0010); истёк → `401 TOKEN_EXPIRED`, иначе → `401 TOKEN_INVALID`;
 *  3. положить `{ id, roles }` в `request.user` для {@link RolesGuard} и
 *     `@CurrentUser()`.
 *
 * Guard НЕ глобальный: большинство эндпоинтов публичны (OTP-логин, refresh,
 * публичные листинги), поэтому защита включается точечно через
 * `@UseGuards(JwtAuthGuard)` (+ `RolesGuard` там, где есть `@Roles(...)`).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const token = this.extractBearer(request);
    if (!token) {
      throw this.unauthorized(
        ApiErrorCode.UNAUTHORIZED,
        'Authentication required',
      );
    }

    const accessSecret = this.config.get<string>('jwt.accessSecret')!;
    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: accessSecret,
      });
    } catch (err) {
      const expired = err instanceof Error && err.name === 'TokenExpiredError';
      throw this.unauthorized(
        expired ? ApiErrorCode.TOKEN_EXPIRED : ApiErrorCode.TOKEN_INVALID,
        expired ? 'Access token has expired' : 'Invalid access token',
      );
    }

    request.user = {
      id: payload.sub,
      roles: (payload.roles ?? []) as UserRole[],
    };
    return true;
  }

  /** Достать токен из `Authorization: Bearer <token>` (схема — case-insensitive). */
  protected extractBearer(request: RequestLike): string | null {
    const header = request.headers?.['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    if (!value) {
      return null;
    }
    const [scheme, token] = value.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }
    const trimmed = token.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private unauthorized(code: ApiErrorCode, message: string): HttpException {
    // Все ошибки аутентификации — 401 (API.md §3/§17); фильтр возьмёт `code` из payload.
    return new HttpException({ code, message }, HttpStatus.UNAUTHORIZED);
  }
}
