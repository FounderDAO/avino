import { Module } from '@nestjs/common';
import { ListingMediaModule } from '../listing-media/listing-media.module';
import { ListingsModule } from '../listings/listings.module';
import { RolesModule } from '../roles';
import { ImportPhotoFetchProcessor } from './import-photo-fetch.processor';
import { ImportPhotoAttacher } from './import-photo.attacher';
import { ListingImportController } from './listing-import.controller';
import { ListingImportLock } from './listing-import.lock';
import { ListingImportPhotoWorker } from './listing-import-photo.worker';
import { ListingImportService } from './listing-import.service';

/**
 * ListingImportsModule — массовый импорт объявлений (спека 2026-10-02).
 * `RolesModule` — Bearer + роли; `ListingsModule` — общая с обычным созданием
 * запись объявления ({@link ListingsService.createInTransaction});
 * `ListingMediaModule` — запись фото в галерею (спека 2026-10-03). Prisma,
 * Redis и очереди — глобальные модули; воркер `listing_import_photo_queue`
 * живёт здесь, как и другие консьюмеры в доменных модулях.
 */
@Module({
  imports: [RolesModule, ListingsModule, ListingMediaModule],
  controllers: [ListingImportController],
  providers: [
    ListingImportService,
    ListingImportLock,
    ImportPhotoAttacher,
    ImportPhotoFetchProcessor,
    ListingImportPhotoWorker,
  ],
})
export class ListingImportsModule {}
