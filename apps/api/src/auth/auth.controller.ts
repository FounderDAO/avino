import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
} from '@nestjs/common';
import { OtpService, RequestOtpResult } from './otp.service';
import { RequestOtpDto } from './dto/request-otp.dto';

/**
 * AuthController — публичные эндпоинты аутентификации (TASK-041, API.md §3).
 *
 * Версионирование URI (`/api/v1/auth/...`) обязательно с первого дня
 * (CLAUDE.md §14): глобальный префикс `api` ставится в main.ts, версия — здесь.
 *
 * Реализовано в этой задаче: `POST /api/v1/auth/otp/request`.
 * verify / refresh / logout — TASK-042 / TASK-043.
 */
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly otpService: OtpService) {}

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
}
