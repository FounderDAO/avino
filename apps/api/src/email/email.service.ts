import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * EmailService — абстракция отправки email (TASK-041, ARCHITECTURE §6 email login).
 *
 * Контракт узкий (`sendOtp`), чтобы OtpService не зависел от транспорта. Реальная
 * доставка через SMTP (provider-agnostic) выполняется асинхронно через
 * `email_queue` (BullMQ, ARCHITECTURE §23) — это отдельная задача. До её
 * подключения сервис работает как абстракция:
 * - SMTP настроен  → предупреждение, что транспорт ещё не подключён (видно в логах);
 * - SMTP не настроен (dev) → код логируется (NODE_ENV !== production),
 *   чтобы пройти flow request → verify локально.
 *
 * Сигнатура (`sendOtp`) уже стабильна: подключение реального SMTP-транспорта не
 * затронет вызывающий код.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  /** Отправить OTP-код на email. */
  async sendOtp(email: string, code: string): Promise<void> {
    const subject = 'Avino — код для входа';
    const text = `Ваш код для входа в Avino: ${code}. Никому не сообщайте его.`;
    await this.send(email, subject, text);
  }

  /** Отправить произвольное письмо. */
  async send(to: string, subject: string, text: string): Promise<void> {
    const host = this.configService.get<string>('mail.host');
    const env = this.configService.get<string>('app.env');

    if (host) {
      // SMTP-транспорт подключается через email_queue (отдельная задача).
      this.logger.warn(
        `SMTP transport is not wired yet; email "${subject}" to ${to} was queued only conceptually`,
      );
    }

    if (env !== 'production') {
      this.logger.warn(`[DEV EMAIL → ${to}] ${subject}: ${text}`);
    } else if (!host) {
      this.logger.warn(
        `Email provider is not configured; message to ${to} was NOT sent`,
      );
    }
  }
}
