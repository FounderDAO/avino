import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import { MEDIA_PROCESSING_QUEUE_NAME, ProcessUploadedImageJobData } from '../queues/queue.constants';
import { MediaVariantsProcessor } from './media-variants.processor';

/** Консьюмер `media_processing_queue` (SEO AUD-8), по образцу ListingImportPhotoWorker. */
@Injectable()
export class MediaVariantsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaVariantsWorker.name);
  private worker?: Worker<ProcessUploadedImageJobData>;

  constructor(
    private readonly configService: ConfigService,
    private readonly processor: MediaVariantsProcessor,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.worker = new Worker<ProcessUploadedImageJobData>(
      MEDIA_PROCESSING_QUEUE_NAME,
      (job: Job<ProcessUploadedImageJobData>) => this.processor.process(job.data.mediaId),
      // sharp нагружает CPU: две задачи одновременно.
      { connection: buildBullConnection(url), concurrency: 2 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.warn(`Media processing job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
