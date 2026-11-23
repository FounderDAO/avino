import { Global, Module } from '@nestjs/common';
import { ExchangeRateQueue } from '../exchange-rates/exchange-rate.queue';
import { EmailQueue } from './email.queue';
import { ListingImportPhotoQueue } from './listing-import-photo.queue';
import { ListingUrlSyncQueue } from './listing-url-sync.queue';
import { GeoResolveQueue } from './geo-resolve.queue';
import { ListingTranslateQueue } from './listing-translate.queue';
import { MediaProcessingQueue } from './media-processing.queue';
import { MediaCleanupQueue } from './media-cleanup.queue';
import { PromotionQueue } from './promotion.queue';
import { SavedSearchQueue } from './saved-search.queue';

/**
 * QueuesModule — продюсеры BullMQ-очередей (TASK-071, ARCHITECTURE §23).
 *
 * `@Global`: очереди инжектируются в любой модуль без повторного импорта.
 * Воркеры-консьюмеры живут в своих доменных модулях, а не здесь — этот модуль
 * отвечает только за постановку джоб.
 */
@Global()
@Module({
  providers: [
    PromotionQueue,
    EmailQueue,
    SavedSearchQueue,
    ExchangeRateQueue,
    MediaCleanupQueue,
    ListingImportPhotoQueue,
    ListingUrlSyncQueue,
    GeoResolveQueue,
    ListingTranslateQueue,
    MediaProcessingQueue,
  ],
  exports: [
    PromotionQueue,
    EmailQueue,
    SavedSearchQueue,
    ExchangeRateQueue,
    MediaCleanupQueue,
    ListingImportPhotoQueue,
    ListingUrlSyncQueue,
    GeoResolveQueue,
    ListingTranslateQueue,
    MediaProcessingQueue,
  ],
})
export class QueuesModule {}
