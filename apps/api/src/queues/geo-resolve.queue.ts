import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { buildBullConnection } from './bullmq-connection';
import {
  GEO_RESOLVE_JOB_OPTIONS,
  GEO_RESOLVE_QUEUE_NAME,
  RESOLVE_LISTING_DISTRICT_JOB,
  ResolveListingDistrictJobData,
} from './queue.constants';

/**
 * Продюсер `geo_resolve_queue` (SEO AUD-2): объявления с точкой, но без района,
 * после коммита ставятся на повторное определение района. Ошибка постановки
 * не роняет создание или правку — район тогда доставит scripts/backfill-districts.
 */
@Injectable()
export class GeoResolveQueue implements OnModuleDestroy {
  private readonly logger = new Logger(GeoResolveQueue.name);
  private readonly queue?: Queue<ResolveListingDistrictJobData>;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('redis.url');
    if (url) {
      this.queue = new Queue<ResolveListingDistrictJobData>(GEO_RESOLVE_QUEUE_NAME, {
        connection: buildBullConnection(url),
      });
    }
  }

  async enqueue(listingIds: string[]): Promise<void> {
    if (!this.queue || listingIds.length === 0) return;
    try {
      await this.queue.addBulk(
        [...new Set(listingIds)].map((listingId) => ({
          name: RESOLVE_LISTING_DISTRICT_JOB,
          data: { listingId },
          opts: { ...GEO_RESOLVE_JOB_OPTIONS, jobId: listingId },
        })),
      );
    } catch (err) {
      this.logger.warn(`District resolve enqueue failed for ${listingIds.length} listing(s): ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
