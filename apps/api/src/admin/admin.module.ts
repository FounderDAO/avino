import { Module } from '@nestjs/common';
import { ModerationModule } from '../moderation';
import { PromotionsModule } from '../promotions';
import { RolesModule } from '../roles';
import { AdminListingPromotionsController } from './admin-listing-promotions.controller';
import { AdminListingsController } from './admin-listings.controller';
import { AdminPromotionsController } from './admin-promotions.controller';
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
 * — управление пользователями и ролями (TASK-130, API.md §6). Дальнейшие
 * админ-роуты (complaints, audit-logs) подключаются сюда же по мере реализации.
 */
@Module({
  imports: [RolesModule, ModerationModule, PromotionsModule],
  controllers: [
    AdminListingsController,
    AdminPromotionsController,
    AdminListingPromotionsController,
    AdminUsersController,
  ],
  providers: [AdminUsersService],
})
export class AdminModule {}
