import { Module } from '@nestjs/common';
import { RolesModule } from '../roles';
import { UploadsModule } from '../uploads';
import { ListingMediaController } from './listing-media.controller';
import { ListingMediaService } from './listing-media.service';
import { MediaVariantsProcessor } from './media-variants.processor';
import { MediaVariantsWorker } from './media-variants.worker';

/**
 * ListingMediaModule — медиа объявления (TASK-061, M6).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) одним импортом
 * (TASK-044); `UploadsModule` — {@link UploadsService} для S3 (TASK-060). Prisma —
 * глобальный модуль, импорт не нужен.
 */
@Module({
  imports: [RolesModule, UploadsModule],
  controllers: [ListingMediaController],
  // MediaVariants*: WebP-варианты загруженных фото в фоне (SEO AUD-8).
  providers: [ListingMediaService, MediaVariantsProcessor, MediaVariantsWorker],
  exports: [ListingMediaService],
})
export class ListingMediaModule {}
