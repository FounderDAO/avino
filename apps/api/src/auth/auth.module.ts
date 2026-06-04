import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EmailModule } from '../email';
import { RolesModule } from '../roles';
import { SmsModule } from '../sms';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpRateLimitService } from './otp-rate-limit.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

/**
 * AuthModule — аутентификация по OTP (TASK-041/042, ARCHITECTURE §6).
 *
 * Зависит от SmsModule/EmailModule (доставка кода) и от глобальных
 * PrismaModule/RedisModule/ConfigModule (БД, rate-limit, конфиг). JwtModule
 * регистрируется без глобального секрета — access и refresh подписываются
 * РАЗНЫМИ секретами, передаваемыми per-call (ADR-0010, см. {@link TokenService}).
 *
 * Предоставляет OTP-request и OTP-verify+выпуск токенов, refresh/logout с
 * ротацией family (TASK-043). RolesModule (TASK-044) даёт Bearer-guard для
 * защиты `logout` (API.md §3: Auth Bearer).
 */
@Module({
  imports: [SmsModule, EmailModule, JwtModule.register({}), RolesModule],
  controllers: [AuthController],
  providers: [OtpService, OtpRateLimitService, AuthService, TokenService],
  exports: [OtpService, TokenService],
})
export class AuthModule {}
