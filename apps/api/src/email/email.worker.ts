import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import {
  EMAIL_QUEUE_NAME,
  SendEmailJobData,
} from '../queues/queue.constants';
import { EmailSender } from './email-sender.service';

/**
 * EmailWorker — консьюмер очереди `email_queue` (TASK-101, ARCHITECTURE §23).
 *
 * Тонкий транспорт BullMQ по образцу {@link TranslationWorker}: получает джобу
 * `send_email`, делегирует доставку {@link EmailSender} и логирует результат
 * (acceptance: «email delivery result is logged»). Исключения транспорта
 * пробрасываются наверх → BullMQ ретраит по `attempts`/backoff продюсера.
 *
 * Воркер поднимается вместе с API-процессом (MVP); concurrency —
 * `EMAIL_QUEUE_CONCURRENCY`. Подключение Redis отдельное от продюсера
 * ({@link EmailQueue}), как рекомендует BullMQ.
 */
@Injectable()
export class EmailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorker.name);
  private worker?: Worker<SendEmailJobData>;

  constructor(
    private readonly configService: ConfigService,
    private readonly sender: EmailSender,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    const concurrency =
      this.configService.get<number>('mail.queueConcurrency') ?? 2;

    this.worker = new Worker<SendEmailJobData>(
      EMAIL_QUEUE_NAME,
      async (job: Job<SendEmailJobData>) => {
        const result = await this.sender.deliver(job.data);
        this.logger.log(
          `Email job ${job.id} → ${result.to}: ${result.status}` +
            (result.messageId ? ` (messageId=${result.messageId})` : ''),
        );
        return result;
      },
      { connection: buildBullConnection(url), concurrency },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Email job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
      );
    });

    this.logger.log(`Email worker started (concurrency=${concurrency})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
