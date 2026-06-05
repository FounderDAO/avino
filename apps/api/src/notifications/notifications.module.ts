import { Module } from '@nestjs/common';
import { RolesModule } from '../roles';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * NotificationsModule — постановка и чтение уведомлений (DB_SCHEMA §11).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) одним импортом
 * (TASK-044) для in-app ленты (TASK-100). Экспортирует {@link NotificationsService},
 * чтобы доменные модули (PromotionsModule → истечение промо, TASK-123; позже
 * модерация/чат/saved searches) ставили PENDING-уведомления единообразно. Prisma —
 * глобальный модуль, импорт не нужен; отправкой займётся отдельный воркер при
 * подключении транспорта.
 */
@Module({
  imports: [RolesModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
