import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import { BROADCAST_DISPATCH_QUEUE_NAME } from '../queues/queue.constants';
import { BroadcastDispatcherService } from './broadcast-dispatcher.service';

/**
 * BroadcastWorker — консьюмер очереди `broadcast_dispatch_queue` (ADR-0103).
 * Тонкий транспорт BullMQ по аналогии с {@link NotificationDispatchWorker}:
 * получает джобу `dispatch_broadcasts` и делегирует
 * {@link BroadcastDispatcherService} (он покрыт юнит-тестами). Ошибки
 * пробрасываются — BullMQ применит ретрай.
 *
 * Воркер поднимается вместе с API-процессом; concurrency=1 — sweep последователен,
 * updateMany-гард SCHEDULED→SENDING защищает от гонок при горизонтальном
 * масштабировании.
 */
@Injectable()
export class BroadcastWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BroadcastWorker.name);
  private worker?: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly dispatcher: BroadcastDispatcherService,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.worker = new Worker(
      BROADCAST_DISPATCH_QUEUE_NAME,
      () => this.dispatcher.run(),
      { connection: buildBullConnection(url), concurrency: 1 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Broadcast dispatch job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
      );
    });

    this.logger.log('Broadcast dispatch worker started (concurrency=1)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
