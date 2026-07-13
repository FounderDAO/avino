import {
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
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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

/**
 * AuthController — публичные эндпоинты аутентификации (TASK-041/042, API.md §3).
 *
 * Версионирование URI (`/api/v1/auth/...`) обязательно с первого дня
 * (CLAUDE.md §14): глобальный префикс `api` ставится в main.ts, версия — здесь.
 *
 * Реализовано: `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify`,
 * `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout` (TASK-041/042/043).
 */
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly otpService: OtpService,
    private readonly authService: AuthService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly appleAuthService: AppleAuthService,
  ) {}

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
  verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<VerifyOtpResult> {
    return this.authService.verifyOtp(dto, ip, userAgent);
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
  google(
    @Body() dto: GoogleLoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<VerifyOtpResult> {
    return this.googleAuthService.login(dto, ip, userAgent);
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
  apple(
    @Body() dto: AppleLoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<VerifyOtpResult> {
    return this.appleAuthService.login(dto, ip, userAgent);
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
   * Ротация refresh-токена (public — авторизует сам refresh-токен в теле).
   * Возвращает новую пару access+refresh; reuse ротированного токена отзывает
   * всю session family (TOKEN_REUSED).
   * Throttle: 20 req/60s (M-3).
   */
  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body() dto: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<RefreshResult> {
    return this.authService.refresh(dto, ip, userAgent);
  }

  /**
   * Отозвать session family текущего refresh-токена. Идемпотентен → 204 No
   * Content. Защищён Bearer-guard (TASK-044, API.md §3): вызвать может только
   * аутентифицированный пользователь, а конкретную family адресует refresh-токен
   * в теле.
   * Throttle: 20 req/60s (M-3).
   */
  @Post('logout')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(
    @Body() dto: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    return this.authService.logout(dto, ip, userAgent);
  }
}
