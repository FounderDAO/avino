import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import { PROMOTION_QUEUE_NAME } from '../queues/queue.constants';
import { PromotionExpiryService } from './promotion-expiry.service';

/**
 * PromotionWorker — консьюмер очереди `promotion_queue` (TASK-123). Тонкий
 * транспорт BullMQ по аналогии с {@link TranslationWorker}: получает джобу
 * `expire_listing_promotions` и делегирует sweep {@link PromotionExpiryService}
 * (он покрыт юнит-тестами). Ошибки пробрасываются — BullMQ применит ретрай.
 *
 * Воркер поднимается вместе с API-процессом (MVP); concurrency задаётся
 * `PROMOTION_EXPIRY_CONCURRENCY` (по умолчанию 1 — sweep дешёвый и достаточно
 * одного). Подключение Redis — отдельное от продюсера ({@link PromotionQueue}).
 */
@Injectable()
export class PromotionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PromotionWorker.name);
  private worker?: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly expiryService: PromotionExpiryService,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    const concurrency =
      this.configService.get<number>('promotion.expiryConcurrency') ?? 1;

    this.worker = new Worker(
      PROMOTION_QUEUE_NAME,
      () => this.expiryService.run(),
      { connection: buildBullConnection(url), concurrency },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Promotion job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
      );
    });

    this.logger.log(`Promotion worker started (concurrency=${concurrency})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
