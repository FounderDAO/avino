import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';
import { RolesModule } from '../roles';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { FcmService } from './delivery/fcm.service';
import { NotificationDispatchQueue } from './delivery/notification-dispatch.queue';
import { NotificationDispatchWorker } from './delivery/notification-dispatch.worker';
import { NotificationDispatcherService } from './delivery/notification-dispatcher.service';
import { NotificationRendererService } from './delivery/notification-renderer.service';

/**
 * NotificationsModule — постановка и чтение уведомлений (DB_SCHEMA §11).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) одним импортом
 * (TASK-044) для in-app ленты (TASK-100). Экспортирует {@link NotificationsService},
 * чтобы доменные модули (PromotionsModule → истечение промо, TASK-123; позже
 * модерация/чат/saved searches) ставили PENDING-уведомления единообразно. Prisma —
 * глобальный модуль, импорт не нужен.
 *
 * ADR-0102 (Task 2): добавлены {@link NotificationRendererService} и {@link FcmService} —
 * слой рендера локализованных email/push и доставки через Firebase.
 *
 * ADR-0102 (Task 3): добавлены {@link NotificationDispatcherService},
 * {@link NotificationDispatchQueue} и {@link NotificationDispatchWorker} —
 * BullMQ repeatable диспетчер fan-out + доставки. EmailModule импортируется для
 * {@link EmailService}.
 */
@Module({
  imports: [RolesModule, ConfigModule, EmailModule, SmsModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationRendererService,
    FcmService,
    NotificationDispatcherService,
    NotificationDispatchQueue,
    NotificationDispatchWorker,
  ],
  exports: [NotificationsService, NotificationRendererService, FcmService],
})
export class NotificationsModule {}
