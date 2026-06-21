import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads';
import { MediaCleanupService } from './media-cleanup.service';
import { MediaCleanupWorker } from './media-cleanup.worker';

/**
 * MediaCleanupModule — фоновая чистка осиротевших фото в R2 (ADR-0099).
 * {@link MediaCleanupService} — бизнес-логика sweep'а, {@link MediaCleanupWorker}
 * — консьюмер `media_cleanup_queue` (расписание ставит {@link MediaCleanupQueue}
 * из QueuesModule). Prisma — глобальный, импорт не нужен; UploadsService — из
 * UploadsModule.
 */
@Module({
  imports: [UploadsModule],
  providers: [MediaCleanupService, MediaCleanupWorker],
  exports: [MediaCleanupService],
})
export class MediaCleanupModule {}
