import { Module } from '@nestjs/common';
import { RolesModule } from '../roles';
import { AdminPromotionsFlagController } from './admin-promotions-flag.controller';
import { PublicSettingsController } from './public-settings.controller';
import { PromotionsFlagService } from './promotions-flag.service';

/**
 * SettingsModule — публичные фиче-флаги + admin-тогглы платформы.
 *
 * `PublicSettingsController` (`GET /settings/public`) — без авторизации, отдаёт
 * флаги порталу/мобильным клиентам. `AdminPromotionsFlagController`
 * (`GET/PATCH /admin/promotions-flag`) — ADMIN-управление флагом продвижения.
 * `RolesModule` импортируется ради Bearer-аутентификации/ролей
 * ({@link JwtAuthGuard}/{@link RolesGuard}) admin-контроллера — тот же приём,
 * что в ExchangeRateModule/AdminModule. `PromotionsFlagService` экспортируется
 * на случай серверного гейта будущего клиентского promote-эндпоинта.
 */
@Module({
  imports: [RolesModule],
  controllers: [PublicSettingsController, AdminPromotionsFlagController],
  providers: [PromotionsFlagService],
  exports: [PromotionsFlagService],
})
export class SettingsModule {}
