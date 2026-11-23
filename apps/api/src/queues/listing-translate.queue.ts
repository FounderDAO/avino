import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { buildBullConnection } from './bullmq-connection';
import {
  LISTING_TRANSLATE_JOB_OPTIONS,
  LISTING_TRANSLATE_QUEUE_NAME,
  TRANSLATE_LISTING_JOB,
  TranslateListingJobData,
} from './queue.constants';

/**
 * Продюсер `listing_translate_queue` (SEO AUD-14): одобренное объявление
 * переводится в фоне. Выключено, пока TRANSLATE_ON_APPROVE != true.
 */
@Injectable()
export class ListingTranslateQueue implements OnModuleDestroy {
  private readonly logger = new Logger(ListingTranslateQueue.name);
  private readonly queue?: Queue<TranslateListingJobData>;

  constructor(configService: ConfigService) {
    const enabled = configService.get<boolean>('translate.onApprove') === true;
    const url = configService.get<string>('redis.url');
    if (enabled && url) {
      this.queue = new Queue<TranslateListingJobData>(LISTING_TRANSLATE_QUEUE_NAME, {
        connection: buildBullConnection(url),
      });
    }
  }

  async enqueue(listingIds: string[]): Promise<void> {
    if (!this.queue || listingIds.length === 0) return;
    try {
      await this.queue.addBulk(
        [...new Set(listingIds)].map((listingId) => ({
          name: TRANSLATE_LISTING_JOB,
          data: { listingId },
          opts: { ...LISTING_TRANSLATE_JOB_OPTIONS, jobId: listingId },
        })),
      );
    } catch (err) {
      this.logger.warn(`Translate enqueue failed for ${listingIds.length} listing(s): ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
