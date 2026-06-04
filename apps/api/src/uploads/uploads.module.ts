import { Module } from '@nestjs/common';
import { UploadsService } from './uploads.service';

/**
 * Модуль загрузки файлов в S3 (TASK-060, ARCHITECTURE §14 UploadsModule).
 * Экспортирует {@link UploadsService} для ListingMediaModule (TASK-061) и
 * других сценариев. Конфиг берётся из глобального ConfigService — импорта
 * зависимостей не требуется.
 */
@Module({
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
