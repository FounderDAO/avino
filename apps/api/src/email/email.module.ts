import { Module } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Модуль email-доставки (TASK-041). Экспортирует {@link EmailService} для
 * AuthModule (OTP) и будущих уведомлений.
 */
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
