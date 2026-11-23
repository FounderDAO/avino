import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SeoSyncProcessor } from './seo-sync.processor';
import { SeoSyncWorker } from './seo-sync.worker';

/**
 * SEO-синхронизация с сайтом (AUD-11): воркер очереди `listing_url_sync_queue`.
 * Продюсер (ListingUrlSyncQueue) — в глобальном QueuesModule.
 */
@Module({
  providers: [
    { provide: SeoSyncProcessor, useFactory: (config: ConfigService) => new SeoSyncProcessor(config), inject: [ConfigService] },
    SeoSyncWorker,
  ],
})
export class SeoSyncModule {}
