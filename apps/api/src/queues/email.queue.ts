import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsOptions, Queue } from 'bullmq';
import { buildBullConnection } from './bullmq-connection';
import {
  EMAIL_QUEUE_NAME,
  SEND_EMAIL_JOB,
  SendEmailJobData,
} from './queue.constants';

/**
 * EmailQueue — продюсер очереди доставки email (TASK-101, ARCHITECTURE §23).
 *
 * По аналогии с {@link TranslationQueue}: тонкая обёртка над BullMQ
 * `Queue('email_queue')` с выделенным Redis-подключением (BullMQ рекомендует
 * отдельные подключения продюсеру/воркеру, `maxRetriesPerRequest: null`).
 *
 * Дефолтные опции несут ретрай (acceptance: доставка может повторяться):
 * `attempts` из `EMAIL_QUEUE_ATTEMPTS`, экспоненциальный backoff. В отличие от
 * перевода `jobId` не задаётся — два письма на один адрес (например повторный
 * OTP) являются разными задачами и не должны дедуплицироваться.
 */
@Injectable()
export class EmailQueue implements OnModuleDestroy {
  private readonly logger = new Logger(EmailQueue.name);
  private readonly queue: Queue<SendEmailJobData>;
  private readonly jobOptions: JobsOptions;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.queue = new Queue<SendEmailJobData>(EMAIL_QUEUE_NAME, {
      connection: buildBullConnection(url),
    });
    this.jobOptions = {
      attempts: configService.get<number>('mail.queueAttempts') ?? 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 100,
    };
  }

  /** Поставить письмо в очередь доставки (acceptance: «email job can be queued»). */
  async enqueueSendEmail(data: SendEmailJobData): Promise<void> {
    await this.queue.add(SEND_EMAIL_JOB, data, this.jobOptions);
    this.logger.debug(`Enqueued send_email job to ${data.to}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
