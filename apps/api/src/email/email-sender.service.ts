import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { SendEmailJobData } from '../queues/queue.constants';

/** Итог попытки доставки письма — логируется воркером (acceptance). */
export type EmailDeliveryStatus = 'SENT' | 'SKIPPED_DEV' | 'SKIPPED_NOT_CONFIGURED';

export interface EmailDeliveryResult {
  status: EmailDeliveryStatus;
  to: string;
  subject: string;
  messageId?: string;
}

/**
 * EmailSender — транспорт реальной SMTP-доставки (TASK-101, ARCHITECTURE §6/§23).
 *
 * Вызывается консьюмером ({@link EmailWorker}) для каждой джобы `send_email`.
 * Провайдер-agnostic SMTP через nodemailer (ADR-0037); transporter создаётся
 * лениво и кэшируется. Поведение по конфигурации повторяет {@link SmsService}:
 * - SMTP настроен (mail.host)      → реальная отправка, возвращает SENT + messageId;
 * - SMTP не настроен, dev          → письмо логируется (SKIPPED_DEV), чтобы пройти
 *   flow request → verify локально без внешнего провайдера;
 * - SMTP не настроен, production    → SKIPPED_NOT_CONFIGURED (письмо НЕ отправлено).
 *
 * Реальные сбои транспорта (`sendMail` бросает) пробрасываются наверх, чтобы
 * BullMQ применил ретрай по `attempts`/backoff; «не настроено» ретраить
 * бессмысленно — возвращается результат без исключения.
 */
@Injectable()
export class EmailSender {
  private readonly logger = new Logger(EmailSender.name);
  private transporter?: Transporter;

  constructor(private readonly configService: ConfigService) {}

  /** Доставить письмо и вернуть результат (его логирует воркер). */
  async deliver(data: SendEmailJobData): Promise<EmailDeliveryResult> {
    const host = this.configService.get<string>('mail.host');
    const env = this.configService.get<string>('app.env');
    const { to, subject, text, html } = data;

    if (!host) {
      if (env !== 'production') {
        this.logger.warn(`[DEV EMAIL → ${to}] ${subject}: ${text}`);
        return { status: 'SKIPPED_DEV', to, subject };
      }
      this.logger.warn(
        `SMTP is not configured; email "${subject}" to ${to} was NOT sent`,
      );
      return { status: 'SKIPPED_NOT_CONFIGURED', to, subject };
    }

    const from = this.configService.get<string>('mail.from');
    const info = await this.transport(host).sendMail({
      from,
      to,
      subject,
      text,
      html,
    });

    return { status: 'SENT', to, subject, messageId: info.messageId };
  }

  /** Лениво создать и закэшировать SMTP-transporter из mail.* конфигурации. */
  private transport(host: string): Transporter {
    if (this.transporter) {
      return this.transporter;
    }
    const port = this.configService.get<number>('mail.port') ?? 587;
    const user = this.configService.get<string>('mail.user');
    const password = this.configService.get<string>('mail.password');

    this.transporter = createTransport({
      host,
      port,
      // 465 — implicit TLS; 587/25 — STARTTLS (secure: false).
      secure: port === 465,
      auth: user && password ? { user, pass: password } : undefined,
    });
    return this.transporter;
  }
}
