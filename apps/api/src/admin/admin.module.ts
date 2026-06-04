import { Module } from '@nestjs/common';
import { ModerationModule } from '../moderation';
import { PromotionsModule } from '../promotions';
import { RolesModule } from '../roles';
import { AdminListingPromotionsController } from './admin-listing-promotions.controller';
import { AdminListingsController } from './admin-listings.controller';
import { AdminPromotionsController } from './admin-promotions.controller';

/**
 * AdminModule — HTTP-слой админ/модераторских операций (TASK-053/TASK-121, M5/M12).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) и проверку
 * ролей ({@link RolesGuard}); `ModerationModule` — бизнес-логику модерации;
 * `PromotionsModule` — ручную активацию/историю промо ({@link AdminPromotionsService})
 * и управление существующей промо ({@link AdminListingPromotionsController}:
 * cancel/extend, TASK-122). Дальнейшие админ-роуты (complaints, audit-logs,
 * admin/users) подключаются сюда же по мере реализации.
 */
@Module({
  imports: [RolesModule, ModerationModule, PromotionsModule],
  controllers: [
    AdminListingsController,
    AdminPromotionsController,
    AdminListingPromotionsController,
  ],
})
export class AdminModule {}
