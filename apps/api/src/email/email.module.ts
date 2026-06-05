import { Module } from '@nestjs/common';
import { EmailSender } from './email-sender.service';
import { EmailService } from './email.service';
import { EmailWorker } from './email.worker';

/**
 * Модуль email-доставки (TASK-041, TASK-101).
 *
 * Экспортирует {@link EmailService} (фасад постановки в очередь) для AuthModule
 * (OTP) и будущих уведомлений. Внутри держит транспорт ({@link EmailSender}) и
 * консьюмера очереди `email_queue` ({@link EmailWorker}); продюсер
 * ({@link EmailQueue}) приходит из глобального QueuesModule.
 */
@Module({
  providers: [EmailService, EmailSender, EmailWorker],
  exports: [EmailService],
})
export class EmailModule {}
