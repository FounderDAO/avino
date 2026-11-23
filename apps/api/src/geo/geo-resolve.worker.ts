import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import { GEO_RESOLVE_QUEUE_NAME, ResolveListingDistrictJobData } from '../queues/queue.constants';
import { GeoResolveProcessor } from './geo-resolve.processor';

/** Консьюмер `geo_resolve_queue` в процессе API (по образцу ListingImportPhotoWorker). */
@Injectable()
export class GeoResolveWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GeoResolveWorker.name);
  private worker?: Worker<ResolveListingDistrictJobData>;

  constructor(
    private readonly configService: ConfigService,
    private readonly processor: GeoResolveProcessor,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.worker = new Worker<ResolveListingDistrictJobData>(
      GEO_RESOLVE_QUEUE_NAME,
      (job: Job<ResolveListingDistrictJobData>) =>
        this.processor.process(job.data.listingId, job.attemptsMade + 1 >= (job.opts.attempts ?? 1)),
      // Геокодер — внешний лимит: по одному запросу за раз.
      { connection: buildBullConnection(url), concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.warn(`District resolve job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
