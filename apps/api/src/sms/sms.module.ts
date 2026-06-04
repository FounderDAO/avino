import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';

/**
 * Модуль SMS-доставки (TASK-041). Экспортирует {@link SmsService} для AuthModule
 * (OTP) и будущих сценариев (уведомления). Конфиг берётся из ConfigService
 * (глобальный), поэтому импорта зависимостей не требуется.
 */
@Module({
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
