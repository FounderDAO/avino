import { Module } from '@nestjs/common';
import { PublicSettingsController } from './public-settings.controller';
import { PromotionsFlagService } from './promotions-flag.service';
import { MapHoverRecenterFlagService } from './map-hover-recenter-flag.service';

/**
 * SettingsModule — публичные фиче-флаги платформы.
 *
 * `PublicSettingsController` (`GET /settings/public`) — без авторизации, отдаёт
 * флаги порталу/мобильным клиентам. `PromotionsFlagService` экспортируется
 * для использования в AdminModule (admin-тоггл `AdminPromotionsFlagController`
 * зарегистрирован там, чтобы его DTO не просачивались в публичный OpenAPI-документ).
 */
@Module({
  imports: [],
  controllers: [PublicSettingsController],
  providers: [PromotionsFlagService, MapHoverRecenterFlagService],
  exports: [PromotionsFlagService, MapHoverRecenterFlagService],
})
export class SettingsModule {}
