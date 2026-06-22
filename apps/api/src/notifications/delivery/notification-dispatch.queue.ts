import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { buildBullConnection } from '../../queues/bullmq-connection';
import {
  DISPATCH_NOTIFICATIONS_JOB,
  NOTIFICATION_DISPATCH_QUEUE_NAME,
} from '../../queues/queue.constants';

/** Стабильный id планировщика repeatable-джобы (для upsert при рестартах). */
const DISPATCH_SCHEDULER_ID = 'dispatch-notifications';

/**
 * NotificationDispatchQueue — продюсер очереди `notification_dispatch_queue`
 * (ADR-0102). Тонкая обёртка над BullMQ `Queue` с выделенным Redis-подключением.
 *
 * По аналогии с {@link SavedSearchQueue}: на старте регистрируется repeatable job
 * (`dispatch_notifications`) через `upsertJobScheduler` с cron-паттерном из
 * `notifications.dispatchCron` (по умолчанию каждую минуту). `upsert` идемпотентен —
 * повторный буст процесса не плодит дубли расписаний. Бизнес-логика живёт в
 * `NotificationDispatcherService` (консьюмер — `NotificationDispatchWorker`).
 */
@Injectable()
export class NotificationDispatchQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatchQueue.name);
  private readonly queue: Queue;
  private readonly cron: string;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.cron =
      configService.get<string>('notifications.dispatchCron') ?? '*/1 * * * *';
    this.queue = new Queue(NOTIFICATION_DISPATCH_QUEUE_NAME, {
      connection: buildBullConnection(url),
    });
  }

  /** Зарегистрировать (idempotent) периодический диспетч уведомлений. */
  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      DISPATCH_SCHEDULER_ID,
      { pattern: this.cron },
      {
        name: DISPATCH_NOTIFICATIONS_JOB,
        data: {},
        opts: { removeOnComplete: true, removeOnFail: 100 },
      },
    );
    this.logger.log(
      `Scheduled ${DISPATCH_NOTIFICATIONS_JOB} (cron="${this.cron}")`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
