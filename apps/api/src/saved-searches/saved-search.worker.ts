import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import { SAVED_SEARCH_QUEUE_NAME } from '../queues/queue.constants';
import { SavedSearchAlertService } from './saved-search-alert.service';

/**
 * SavedSearchWorker — консьюмер очереди `saved_search_queue` (TASK-102). Тонкий
 * транспорт BullMQ по аналогии с {@link PromotionWorker}: получает джобу
 * `check_saved_searches` и делегирует матчинг {@link SavedSearchAlertService}
 * (он покрыт юнит-тестами). Ошибки пробрасываются — BullMQ применит ретрай.
 *
 * Воркер поднимается вместе с API-процессом (MVP); concurrency задаётся
 * `SAVED_SEARCH_ALERT_CONCURRENCY` (по умолчанию 1 — sweep последователен,
 * optimistic-гард watermark в сервисе защищает от гонок). Подключение Redis —
 * отдельное от продюсера ({@link SavedSearchQueue}).
 */
@Injectable()
export class SavedSearchWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SavedSearchWorker.name);
  private worker?: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly alertService: SavedSearchAlertService,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    const concurrency =
      this.configService.get<number>('savedSearch.alertConcurrency') ?? 1;

    this.worker = new Worker(
      SAVED_SEARCH_QUEUE_NAME,
      () => this.alertService.run(),
      { connection: buildBullConnection(url), concurrency },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Saved-search job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
      );
    });

    this.logger.log(`Saved-search worker started (concurrency=${concurrency})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
