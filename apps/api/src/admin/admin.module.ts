import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { AdminComplaintsController, ComplaintsModule } from '../complaints';
import { ModerationModule } from '../moderation';
import { PromotionsModule } from '../promotions';
import { RolesModule } from '../roles';
import { AdminListingPromotionsController } from './admin-listing-promotions.controller';
import { AdminListingsController } from './admin-listings.controller';
import { AdminLogsController } from './admin-logs.controller';
import { AdminLogsService } from './admin-logs.service';
import { AdminPromotionsController } from './admin-promotions.controller';
import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsService } from './admin-stats.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

/**
 * AdminModule — HTTP-слой админ/модераторских операций (TASK-053/TASK-121/
 * TASK-130, M5/M12/M13).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) и проверку
 * ролей ({@link RolesGuard}); `ModerationModule` — бизнес-логику модерации;
 * `PromotionsModule` — ручную активацию/историю промо ({@link AdminPromotionsService})
 * и управление существующей промо ({@link AdminListingPromotionsController}:
 * cancel/extend, TASK-122). {@link AdminUsersController}/{@link AdminUsersService}
 * — управление пользователями и ролями (TASK-130, API.md §6).
 * {@link AdminLogsController}/{@link AdminLogsService} + `AuditModule` — read-only
 * журналы (audit/moderation/promotion/notification, TASK-131, ADMIN-only).
 * {@link AdminComplaintsController} + `ComplaintsModule` — разбор жалоб
 * (MODERATOR/ADMIN, TASK-132); бизнес-логика живёт в {@link ComplaintsService}.
 */
@Module({
  imports: [
    RolesModule,
    ModerationModule,
    PromotionsModule,
    AuditModule,
    ComplaintsModule,
  ],
  controllers: [
    AdminListingsController,
    AdminPromotionsController,
    AdminListingPromotionsController,
    AdminUsersController,
    AdminLogsController,
    AdminComplaintsController,
    AdminStatsController,
  ],
  providers: [AdminUsersService, AdminLogsService, AdminStatsService],
})
export class AdminModule {}
