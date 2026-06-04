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
  TRANSLATION_QUEUE_NAME,
  TranslateListingJobData,
} from '../queues/queue.constants';
import { ListingAutoTranslator } from './listing-auto-translator.service';

/**
 * TranslationWorker — консьюмер очереди `translation_queue` (TASK-071,
 * ARCHITECTURE §23). Тонкий транспорт BullMQ: получает джобу и делегирует всю
 * логику {@link ListingAutoTranslator} (он же покрыт юнит-тестами). Ошибки джобы
 * пробрасываются наверх, чтобы BullMQ применил ретрай по `attempts`/backoff.
 *
 * Воркер поднимается вместе с API-процессом (для MVP); concurrency задаётся
 * `TRANSLATE_QUEUE_CONCURRENCY`. Подключение Redis — отдельное от продюсера
 * ({@link TranslationQueue}), как рекомендует BullMQ.
 */
@Injectable()
export class TranslationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TranslationWorker.name);
  private worker?: Worker<TranslateListingJobData>;

  constructor(
    private readonly configService: ConfigService,
    private readonly autoTranslator: ListingAutoTranslator,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    const concurrency =
      this.configService.get<number>('translate.queueConcurrency') ?? 2;

    this.worker = new Worker<TranslateListingJobData>(
      TRANSLATION_QUEUE_NAME,
      (job: Job<TranslateListingJobData>) =>
        this.autoTranslator.run(job.data.listingId),
      { connection: buildBullConnection(url), concurrency },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Translation job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
      );
    });

    this.logger.log(`Translation worker started (concurrency=${concurrency})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
