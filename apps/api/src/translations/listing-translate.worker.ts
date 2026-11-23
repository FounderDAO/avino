import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import { ListingUrlSyncQueue } from '../queues/listing-url-sync.queue';
import { LISTING_TRANSLATE_QUEUE_NAME, TranslateListingJobData } from '../queues/queue.constants';
import { ListingAutoTranslator } from './listing-auto-translator.service';

/**
 * Консьюмер `listing_translate_queue` (SEO AUD-14): переводит одобренное
 * объявление и отправляет страницу на синхронизацию с сайтом. Ошибка
 * провайдера бросается — BullMQ повторит. Стартует только при TRANSLATE_ON_APPROVE.
 */
@Injectable()
export class ListingTranslateWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ListingTranslateWorker.name);
  private worker?: Worker<TranslateListingJobData>;

  constructor(
    private readonly configService: ConfigService,
    private readonly translator: ListingAutoTranslator,
    @Optional() private readonly urlSync?: ListingUrlSyncQueue,
  ) {}

  /** Тело задачи — отдельно от BullMQ для тестов. */
  async process(listingId: string): Promise<void> {
    const result = await this.translator.generateTranslations(listingId);
    if (result.regenerated.length > 0) {
      await this.urlSync?.enqueue([listingId]);
    }
  }

  onModuleInit(): void {
    if (this.configService.get<boolean>('translate.onApprove') !== true) return;
    const url = this.configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.worker = new Worker<TranslateListingJobData>(
      LISTING_TRANSLATE_QUEUE_NAME,
      (job: Job<TranslateListingJobData>) => this.process(job.data.listingId),
      { connection: buildBullConnection(url), concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.warn(`Translate job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
