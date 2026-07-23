import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { CurrentUser } from '../common/decorators';
import { JwtAuthGuard, AuthenticatedUser } from '../common/guards';
import { AuthService, RefreshResult, VerifyOtpResult } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { AppleAuthService } from './apple-auth.service';
import { OtpService, RequestOtpResult } from './otp.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { AppleLoginDto } from './dto/apple-login.dto';
import { MeResponse } from './dto/me-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SessionResponse } from './dto/session-response.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie.util';

/**
 * AuthController — публичные эндпоинты аутентификации (TASK-041/042, API.md §3).
 *
 * Версионирование URI (`/api/v1/auth/...`) обязательно с первого дня
 * (CLAUDE.md §14): глобальный префикс `api` ставится в main.ts, версия — здесь.
 *
 * Реализовано: `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify`,
 * `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout` (TASK-041/042/043).
 *
 * Refresh-токен (ADR-0153, TASK-256): на логин (verify/google/apple) и ротацию
 * ставится в httpOnly cookie `avino_rt` для web-клиентов; тело ответа сохраняет
 * `refresh_token` для mobile/Flutter. refresh/logout читают токен из
 * `req.cookies.avino_rt ?? body.refresh_token` (обратная совместимость).
 */
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly otpService: OtpService,
    private readonly authService: AuthService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly appleAuthService: AppleAuthService,
    private readonly config: ConfigService,
  ) {}

  /** Поставить/обновить refresh-cookie (логин и ротация). */
  private setRefreshCookie(res: Response, refreshToken: string): void {
    setRefreshCookie(res, refreshToken, this.config);
  }

  /** Удалить refresh-cookie (logout). */
  private clearRefreshCookie(res: Response): void {
    clearRefreshCookie(res, this.config);
  }

  /**
   * Разрешить refresh-токен из cookie (web) ИЛИ тела (mobile, ADR-0153).
   * Нет ни того, ни другого → 400 VALIDATION_ERROR.
   */
  private resolveRefreshToken(req: Request, dto: RefreshTokenDto): string {
    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE_NAME
    ];
    const token = fromCookie ?? dto.refresh_token;
    if (!token) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Refresh token is required',
        details: [
          {
            field: 'refresh_token',
            issue: 'must be provided in the request body or the avino_rt cookie',
          },
        ],
      });
    }
    return token;
  }

  /**
   * Запросить OTP-код (public/GUEST). `@Ip()` даёт IP клиента для per-IP
   * rate-limit без зависимости от `@types/express`.
   * Throttle: 10 req/60s (строже глобального — OTP-канал критичен, M-3).
   */
  @Post('otp/request')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  requestOtp(
    @Body() dto: RequestOtpDto,
    @Ip() ip: string,
  ): Promise<RequestOtpResult> {
    return this.otpService.requestOtp(dto, ip);
  }

  /**
   * Подтвердить OTP-код и получить сессию (public). При первом входе создаётся
   * пользователь. `@Ip()`/`User-Agent` сохраняются в строке refresh-токена и
   * в audit-логе логина.
   * Throttle: 10 req/60s (H-1 + M-3 — брутфорс-защита verify).
   */
  @Post('otp/verify')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<VerifyOtpResult> {
    const result = await this.authService.verifyOtp(dto, ip, userAgent);
    this.setRefreshCookie(res, result.refresh_token);
    return result;
  }

  /**
   * Вход через Google (public). Принимает Google ID-token (GIS на клиенте),
   * верифицирует офлайн, создаёт пользователя при первом входе (login=signup),
   * выдаёт ту же сессию, что и OTP-verify. Провайдер не настроен → 503.
   * Throttle: 20 req/60s (M-3).
   */
  @Post('google')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async google(
    @Body() dto: GoogleLoginDto,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<VerifyOtpResult> {
    const result = await this.googleAuthService.login(dto, ip, userAgent);
    this.setRefreshCookie(res, result.refresh_token);
    return result;
  }

  /**
   * Вход через Apple (public). Принимает Apple ID-token (Sign in with Apple JS),
   * верифицирует офлайн, создаёт пользователя при первом входе (login=signup),
   * выдаёт ту же сессию, что и OTP-verify. Провайдер не настроен → 503.
   * Throttle: 20 req/60s (M-3).
   */
  @Post('apple')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async apple(
    @Body() dto: AppleLoginDto,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<VerifyOtpResult> {
    const result = await this.appleAuthService.login(dto, ip, userAgent);
    this.setRefreshCookie(res, result.refresh_token);
    return result;
  }

  /**
   * Текущий пользователь + профиль + роли (TASK-045, API.md §3). Защищён
   * Bearer-guard: `@CurrentUser('id')` берёт `sub` из access-токена, который
   * положил {@link JwtAuthGuard}. Нет/невалидный токен → `401 UNAUTHORIZED`
   * (бросает guard). Тело ответа строится в сервисе строго по контракту.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser('id') userId: string): Promise<MeResponse> {
    return this.authService.getMe(userId);
  }

  /**
   * Активные сессии текущего пользователя (ADR-0143). `is_current` метится по
   * `fid` предъявленного access-токена — refresh-токен не передаётся. Токены,
   * выпущенные до ADR-0143, `fid` не несут → все сессии `is_current=false` до
   * ближайшей ротации.
   */
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  sessions(@CurrentUser() user: AuthenticatedUser): Promise<SessionResponse[]> {
    return this.authService.listSessions(user.id, user.sessionFamilyId);
  }

  /**
   * Отозвать конкретную сессию (session family) по её id (ADR-0143) → 204.
   * Только свою: чужой/несуществующий `fid` → 404 NOT_FOUND (существование
   * чужой сессии не раскрывается). Refresh-токены family перестают ротироваться
   * (401 на `/auth/refresh`).
   * Throttle: 20 req/60s (M-3).
   */
  @Delete('sessions/:fid')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeSession(
    @CurrentUser('id') userId: string,
    @Param('fid', new ParseUUIDPipe()) fid: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    return this.authService.revokeSessionById(userId, fid, ip, userAgent);
  }

  /**
   * Ротация refresh-токена (public — авторизует сам refresh-токен). Токен берётся
   * из cookie `avino_rt` (web) или тела (mobile, ADR-0153); нет ни того, ни
   * другого → 400. Возвращает новую пару access+refresh (в теле — для mobile) и
   * ставит новый refresh-cookie; reuse ротированного токена отзывает всю session
   * family (TOKEN_REUSED). Throttle: 20 req/60s (M-3).
   */
  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<RefreshResult> {
    const token = this.resolveRefreshToken(req, dto);
    const result = await this.authService.refresh(token, ip, userAgent);
    this.setRefreshCookie(res, result.refresh_token);
    return result;
  }

  /**
   * Отозвать session family текущего refresh-токена. Идемпотентен → 204 No
   * Content. Защищён Bearer-guard (TASK-044, API.md §3): вызвать может только
   * аутентифицированный пользователь, а конкретную family адресует refresh-токен
   * из cookie `avino_rt` (web) или тела (mobile, ADR-0153); нет ни того, ни
   * другого → 400. Cookie очищается в любом случае. Throttle: 20 req/60s (M-3).
   */
  @Post('logout')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    const token = this.resolveRefreshToken(req, dto);
    await this.authService.logout(token, ip, userAgent);
    this.clearRefreshCookie(res);
  }
}
