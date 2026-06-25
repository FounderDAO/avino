import { Controller, Get } from '@nestjs/common';
import { PromotionsFlagService } from './promotions-flag.service';
import { MapHoverRecenterFlagService } from './map-hover-recenter-flag.service';
import { PublicSettingsView } from './dto/public-settings-view.dto';

/**
 * `GET /api/v1/settings/public` — публичные флаги без авторизации. Точка
 * расширения для будущих клиентских флагов (добавляется поле, не эндпоинт).
 */
@Controller({ path: 'settings/public', version: '1' })
export class PublicSettingsController {
  constructor(
    private readonly flags: PromotionsFlagService,
    private readonly mapHover: MapHoverRecenterFlagService,
  ) {}

  @Get()
  async get(): Promise<PublicSettingsView> {
    return {
      promotionsEnabled: await this.flags.isEnabled(),
      mapHoverRecenter: await this.mapHover.isEnabled(),
    };
  }
}
