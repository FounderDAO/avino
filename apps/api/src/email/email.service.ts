import { Injectable, Logger } from '@nestjs/common';
import { EmailQueue } from '../queues/email.queue';
import { SendEmailJobData } from '../queues/queue.constants';

/**
 * EmailService — публичный фасад постановки email в очередь (TASK-041/TASK-101,
 * ARCHITECTURE §6/§23).
 *
 * Контракт намеренно узкий (`sendOtp` / `sendEmail`), чтобы вызывающий код
 * (OtpService и будущие уведомления) не зависел от транспорта. С TASK-101
 * доставка стала по-настоящему асинхронной: письмо кладётся в BullMQ
 * `email_queue` ({@link EmailQueue}), а реальную SMTP-отправку и логирование
 * результата выполняет воркер ({@link EmailWorker} → {@link EmailSender}).
 *
 * Сигнатура `sendOtp` не изменилась — подключение очереди прозрачно для
 * AuthModule/OtpService.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly emailQueue: EmailQueue) {}

  /** Поставить OTP-письмо в очередь доставки. */
  async sendOtp(email: string, code: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Avino — код для входа',
      text: `Ваш код для входа в Avino: ${code}. Никому не сообщайте его.`,
    });
  }

  /** Поставить произвольное письмо в очередь доставки. */
  async sendEmail(data: SendEmailJobData): Promise<void> {
    await this.emailQueue.enqueueSendEmail(data);
    this.logger.debug(`Queued email "${data.subject}" to ${data.to}`);
  }
}
