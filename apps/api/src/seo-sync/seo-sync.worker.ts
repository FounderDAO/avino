import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import { LISTING_URL_SYNC_QUEUE_NAME, SyncListingUrlsJobData } from '../queues/queue.constants';
import { SeoSyncProcessor } from './seo-sync.processor';

/** Консьюмер `listing_url_sync_queue` в процессе API (по образцу ListingImportPhotoWorker). */
@Injectable()
export class SeoSyncWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SeoSyncWorker.name);
  private worker?: Worker<SyncListingUrlsJobData>;

  constructor(
    private readonly configService: ConfigService,
    private readonly processor: SeoSyncProcessor,
  ) {}

  onModuleInit(): void {
    // Без адреса сайта синхронизация выключена — воркер не нужен.
    if (!this.configService.get<string>('seoSync.url')) return;
    const url = this.configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.worker = new Worker<SyncListingUrlsJobData>(
      LISTING_URL_SYNC_QUEUE_NAME,
      (job: Job<SyncListingUrlsJobData>) => this.processor.process(job.data.listingId),
      { connection: buildBullConnection(url), concurrency: 4 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.warn(`SEO sync job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
