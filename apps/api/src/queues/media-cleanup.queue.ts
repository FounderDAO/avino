import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { buildBullConnection } from './bullmq-connection';
import {
  CLEANUP_ORPHAN_MEDIA_JOB,
  MEDIA_CLEANUP_QUEUE_NAME,
} from './queue.constants';

const CLEANUP_SCHEDULER_ID = 'cleanup-orphan-media';

/**
 * MediaCleanupQueue — продюсер очереди `media_cleanup_queue` (ADR-XXXX). По
 * аналогии с {@link SavedSearchQueue}: тонкая обёртка над BullMQ `Queue`.
 * Config-gated: при `mediaCleanup.enabled=false` repeatable-джоба НЕ ставится
 * (sweep деструктивен — по умолчанию выключен).
 */
@Injectable()
export class MediaCleanupQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaCleanupQueue.name);
  private readonly queue: Queue;
  private readonly enabled: boolean;
  private readonly cron: string;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.enabled = configService.get<boolean>('mediaCleanup.enabled') ?? false;
    this.cron = configService.get<string>('mediaCleanup.cron') ?? '0 4 * * *';
    this.queue = new Queue(MEDIA_CLEANUP_QUEUE_NAME, {
      connection: buildBullConnection(url),
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('Media cleanup disabled — not scheduling sweep');
      return;
    }
    await this.queue.upsertJobScheduler(
      CLEANUP_SCHEDULER_ID,
      { pattern: this.cron },
      {
        name: CLEANUP_ORPHAN_MEDIA_JOB,
        data: {},
        opts: { removeOnComplete: true, removeOnFail: 100 },
      },
    );
    this.logger.log(`Scheduled ${CLEANUP_ORPHAN_MEDIA_JOB} (cron="${this.cron}")`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
