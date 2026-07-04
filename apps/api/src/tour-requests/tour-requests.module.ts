import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { NotificationsModule } from '../notifications/notifications.module';
import { RolesModule } from '../roles';
import { TranslationsModule } from '../translations';
import { UploadsModule } from '../uploads';
import { TourRequestsController } from './tour-requests.controller';
import { TourRequestsService } from './tour-requests.service';

/**
 * TourRequestsModule — запросы на тур-показ (TASK-tours).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) одним импортом
 * (TASK-044). `NotificationsModule` — уведомления о смене статуса тура.
 * `TranslationsModule`/`UploadsModule` — контекст объявления в списках (spec 2026-07-04).
 * Prisma — глобальный модуль.
 */
@Module({
  imports: [RolesModule, PrismaModule, NotificationsModule, TranslationsModule, UploadsModule],
  controllers: [TourRequestsController],
  providers: [TourRequestsService],
})
export class TourRequestsModule {}
