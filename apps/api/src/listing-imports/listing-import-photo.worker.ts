import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import { FetchImportPhotoJobData, LISTING_IMPORT_PHOTO_QUEUE_NAME } from '../queues/queue.constants';
import { ImportPhotoFetchProcessor } from './import-photo-fetch.processor';

/** Консьюмер `listing_import_photo_queue` в процессе API (по образцу MediaCleanupWorker). */
@Injectable()
export class ListingImportPhotoWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ListingImportPhotoWorker.name);
  private worker?: Worker<FetchImportPhotoJobData>;

  constructor(
    private readonly configService: ConfigService,
    private readonly processor: ImportPhotoFetchProcessor,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.worker = new Worker<FetchImportPhotoJobData>(
      LISTING_IMPORT_PHOTO_QUEUE_NAME,
      (job: Job<FetchImportPhotoJobData>) =>
        // BullMQ 5: attemptsMade — «Number of attempts after the job has failed», в
        // первом прогоне 0; attemptsStarted считал бы и текущий запуск.
        this.processor.process(job.data.photoId, job.attemptsMade + 1 >= (job.opts.attempts ?? 1)),
      { connection: buildBullConnection(url), concurrency: 4 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.warn(`Import photo job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
