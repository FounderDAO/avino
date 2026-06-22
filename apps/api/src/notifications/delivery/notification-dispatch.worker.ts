import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { buildBullConnection } from '../../queues/bullmq-connection';
import { NOTIFICATION_DISPATCH_QUEUE_NAME } from '../../queues/queue.constants';
import { NotificationDispatcherService } from './notification-dispatcher.service';

/**
 * NotificationDispatchWorker — консьюмер очереди `notification_dispatch_queue`
 * (ADR-0102). Тонкий транспорт BullMQ по аналогии с {@link SavedSearchWorker}:
 * получает джобу `dispatch_notifications` и делегирует
 * {@link NotificationDispatcherService} (он покрыт юнит-тестами). Ошибки
 * пробрасываются — BullMQ применит ретрай.
 *
 * Воркер поднимается вместе с API-процессом; concurrency задаётся
 * `NOTIFICATION_DISPATCH_CONCURRENCY` (по умолчанию 1 — sweep последователен,
 * idempotent unique-constraint защищает от гонок). Подключение Redis — отдельное
 * от продюсера ({@link NotificationDispatchQueue}).
 */
@Injectable()
export class NotificationDispatchWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatchWorker.name);
  private worker?: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly dispatcher: NotificationDispatcherService,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    const concurrency =
      this.configService.get<number>('notifications.dispatchConcurrency') ?? 1;

    this.worker = new Worker(
      NOTIFICATION_DISPATCH_QUEUE_NAME,
      () => this.dispatcher.run(),
      { connection: buildBullConnection(url), concurrency },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Notification dispatch job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
      );
    });

    this.logger.log(
      `Notification dispatch worker started (concurrency=${concurrency})`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
