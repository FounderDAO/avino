import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { buildBullConnection } from './bullmq-connection';
import {
  LISTING_URL_SYNC_JOB_OPTIONS,
  LISTING_URL_SYNC_QUEUE_NAME,
  SYNC_LISTING_URLS_JOB,
  SyncListingUrlsJobData,
} from './queue.constants';

/**
 * Продюсер `listing_url_sync_queue` (SEO AUD-11). Вызывается ПОСЛЕ коммита
 * изменения объявления. Ошибка постановки не роняет бизнес-операцию: страница
 * обновится по TTL кэша сайта, а поисковики — при следующем обходе.
 */
@Injectable()
export class ListingUrlSyncQueue implements OnModuleDestroy {
  private readonly logger = new Logger(ListingUrlSyncQueue.name);
  private readonly queue?: Queue<SyncListingUrlsJobData>;
  private readonly delayMs: number;

  constructor(configService: ConfigService) {
    this.delayMs = configService.get<number>('seoSync.delayMs') ?? 60_000;
    const enabled = Boolean(configService.get<string>('seoSync.url'));
    const redisUrl = configService.get<string>('redis.url');
    if (enabled && redisUrl) {
      this.queue = new Queue<SyncListingUrlsJobData>(LISTING_URL_SYNC_QUEUE_NAME, {
        connection: buildBullConnection(redisUrl),
      });
    }
  }

  /** Поставить объявления на синхронизацию; повтор того же id до запуска — схлопывается. */
  async enqueue(listingIds: string[]): Promise<void> {
    if (!this.queue || listingIds.length === 0) return;
    try {
      await this.queue.addBulk(
        [...new Set(listingIds)].map((listingId) => ({
          name: SYNC_LISTING_URLS_JOB,
          data: { listingId },
          opts: { ...LISTING_URL_SYNC_JOB_OPTIONS, jobId: listingId, delay: this.delayMs },
        })),
      );
    } catch (err) {
      this.logger.warn(`SEO sync enqueue failed for ${listingIds.length} listing(s): ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
