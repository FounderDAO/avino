import { Module } from '@nestjs/common';
import { ModerationService } from './moderation.service';

/**
 * ModerationModule — бизнес-логика модерации объявлений (TASK-053, M5).
 *
 * Содержит только {@link ModerationService}; HTTP-слой (роуты `admin/listings`)
 * живёт в AdminModule. Prisma — глобальный модуль, импорт не нужен. Сервис
 * экспортируется для переиспользования (например будущим complaints-флоу).
 */
@Module({
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
