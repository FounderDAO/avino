import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import { MEDIA_CLEANUP_QUEUE_NAME } from '../queues/queue.constants';
import { MediaCleanupService } from './media-cleanup.service';

/**
 * MediaCleanupWorker — консьюмер `media_cleanup_queue` (ADR-XXXX). По аналогии с
 * {@link PromotionWorker}. Config-gated: при `mediaCleanup.enabled=false` воркер
 * не стартует (sweep деструктивен — выключен по умолчанию).
 */
@Injectable()
export class MediaCleanupWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaCleanupWorker.name);
  private worker?: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly cleanupService: MediaCleanupService,
  ) {}

  onModuleInit(): void {
    const enabled =
      this.configService.get<boolean>('mediaCleanup.enabled') ?? false;
    if (!enabled) {
      this.logger.log('Media cleanup disabled — worker not started');
      return;
    }
    const url = this.configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }

    this.worker = new Worker(
      MEDIA_CLEANUP_QUEUE_NAME,
      () => this.cleanupService.run(),
      { connection: buildBullConnection(url), concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Media cleanup job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
      );
    });
    this.logger.log('Media cleanup worker started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
