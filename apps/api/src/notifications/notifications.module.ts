import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RolesModule } from '../roles';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { FcmService } from './delivery/fcm.service';
import { NotificationRendererService } from './delivery/notification-renderer.service';

/**
 * NotificationsModule — постановка и чтение уведомлений (DB_SCHEMA §11).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) одним импортом
 * (TASK-044) для in-app ленты (TASK-100). Экспортирует {@link NotificationsService},
 * чтобы доменные модули (PromotionsModule → истечение промо, TASK-123; позже
 * модерация/чат/saved searches) ставили PENDING-уведомления единообразно. Prisma —
 * глобальный модуль, импорт не нужен; отправкой займётся отдельный воркер при
 * подключении транспорта.
 *
 * ADR-0102: добавлены {@link NotificationRendererService} и {@link FcmService} —
 * слой рендера локализованных email/push и доставки через Firebase.
 * Экспортируются для использования в NotificationDispatcherService (Task 3).
 */
@Module({
  imports: [RolesModule, ConfigModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationRendererService, FcmService],
  exports: [NotificationsService, NotificationRendererService, FcmService],
})
export class NotificationsModule {}
