import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { NotificationsModule } from '../notifications/notifications.module';
import { RolesModule } from '../roles';
import { TourRequestsController } from './tour-requests.controller';
import { TourRequestsService } from './tour-requests.service';

/**
 * TourRequestsModule — запросы на тур-показ (TASK-tours).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) одним импортом
 * (TASK-044). `NotificationsModule` — уведомления о смене статуса тура.
 * Prisma — глобальный модуль.
 */
@Module({
  imports: [RolesModule, PrismaModule, NotificationsModule],
  controllers: [TourRequestsController],
  providers: [TourRequestsService],
})
export class TourRequestsModule {}
