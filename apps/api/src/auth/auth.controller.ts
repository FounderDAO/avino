import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
} from '@nestjs/common';
import { AuthService, VerifyOtpResult } from './auth.service';
import { OtpService, RequestOtpResult } from './otp.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

/**
 * AuthController — публичные эндпоинты аутентификации (TASK-041/042, API.md §3).
 *
 * Версионирование URI (`/api/v1/auth/...`) обязательно с первого дня
 * (CLAUDE.md §14): глобальный префикс `api` ставится в main.ts, версия — здесь.
 *
 * Реализовано: `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify`.
 * refresh / logout — TASK-043.
 */
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly otpService: OtpService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Запросить OTP-код (public/GUEST). `@Ip()` даёт IP клиента для per-IP
   * rate-limit без зависимости от `@types/express`.
   */
  @Post('otp/request')
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
   */
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<VerifyOtpResult> {
    return this.authService.verifyOtp(dto, ip, userAgent);
  }
}
