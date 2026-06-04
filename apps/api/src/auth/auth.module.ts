import { Module } from '@nestjs/common';
import { EmailModule } from '../email';
import { SmsModule } from '../sms';
import { AuthController } from './auth.controller';
import { OtpRateLimitService } from './otp-rate-limit.service';
import { OtpService } from './otp.service';

/**
 * AuthModule — аутентификация по OTP (TASK-041, ARCHITECTURE §6).
 *
 * Зависит от SmsModule/EmailModule (доставка кода) и от глобальных
 * PrismaModule/RedisModule/ConfigModule (БД, rate-limit, конфиг). В этой задаче
 * предоставляет только OTP-request; verify+токены и refresh/logout добавят
 * TASK-042 / TASK-043.
 */
@Module({
  imports: [SmsModule, EmailModule],
  controllers: [AuthController],
  providers: [OtpService, OtpRateLimitService],
  exports: [OtpService],
})
export class AuthModule {}
