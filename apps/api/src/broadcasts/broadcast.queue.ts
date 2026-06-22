import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import {
  BROADCAST_DISPATCH_QUEUE_NAME,
  DISPATCH_BROADCASTS_JOB,
} from '../queues/queue.constants';

/** Стабильный id планировщика repeatable-джобы (для upsert при рестартах). */
const BROADCAST_SCHEDULER_ID = 'dispatch-broadcasts';

/**
 * BroadcastQueue — продюсер очереди `broadcast_dispatch_queue` (ADR-0103).
 * Тонкая обёртка над BullMQ `Queue` с выделенным Redis-подключением.
 *
 * По аналогии с {@link NotificationDispatchQueue}: на старте регистрируется
 * repeatable job (`dispatch_broadcasts`) через `upsertJobScheduler` с
 * cron-паттерном из `broadcasts.dispatchCron` (по умолчанию каждую минуту).
 * `upsert` идемпотентен — повторный буст процесса не плодит дубли расписаний.
 * Бизнес-логика живёт в {@link BroadcastDispatcherService}
 * (консьюмер — {@link BroadcastWorker}).
 */
@Injectable()
export class BroadcastQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BroadcastQueue.name);
  private readonly queue: Queue;
  private readonly cron: string;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.cron =
      configService.get<string>('broadcasts.dispatchCron') ?? '*/1 * * * *';
    this.queue = new Queue(BROADCAST_DISPATCH_QUEUE_NAME, {
      connection: buildBullConnection(url),
    });
  }

  /** Зарегистрировать (idempotent) периодический sweep рассылок. */
  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      BROADCAST_SCHEDULER_ID,
      { pattern: this.cron },
      {
        name: DISPATCH_BROADCASTS_JOB,
        data: {},
        opts: { removeOnComplete: true, removeOnFail: 100 },
      },
    );
    this.logger.log(
      `Scheduled ${DISPATCH_BROADCASTS_JOB} (cron="${this.cron}")`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
