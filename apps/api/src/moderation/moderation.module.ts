import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads';
import { ModerationService } from './moderation.service';

/**
 * ModerationModule — бизнес-логика модерации объявлений (TASK-053, M5).
 *
 * Содержит только {@link ModerationService}; HTTP-слой (роуты `admin/listings`)
 * живёт в AdminModule. Prisma — глобальный модуль, импорт не нужен.
 * `UploadsModule` — {@link UploadsService} для свежего presigned-URL обложки в
 * строке списка (sign-on-read, ADR-0086). Сервис экспортируется для
 * переиспользования (например будущим complaints-флоу).
 */
@Module({
  imports: [UploadsModule],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
