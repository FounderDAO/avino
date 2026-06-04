import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * NotificationsModule — постановка уведомлений в очередь (DB_SCHEMA §11).
 *
 * Экспортирует {@link NotificationsService}, чтобы доменные модули
 * (PromotionsModule → истечение промо, TASK-123; позже модерация/чат/saved
 * searches) ставили PENDING-уведомления единообразно. Prisma — глобальный
 * модуль, импорт не нужен; отправкой займётся отдельный воркер при подключении
 * транспорта.
 */
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
