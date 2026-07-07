import { Controller, Get } from '@nestjs/common';
import { PromotionsFlagService } from './promotions-flag.service';
import { ActiveListingLimitService } from './active-listing-limit.service';
import { MapHoverRecenterFlagService } from './map-hover-recenter-flag.service';
import { LegalConsentFlagService } from './legal-consent-flag.service';
import { PublicSettingsView } from './dto/public-settings-view.dto';

/**
 * `GET /api/v1/settings/public` — публичные флаги без авторизации. Точка
 * расширения для будущих клиентских флагов (добавляется поле, не эндпоинт).
 */
@Controller({ path: 'settings/public', version: '1' })
export class PublicSettingsController {
  constructor(
    private readonly flags: PromotionsFlagService,
    private readonly activeLimit: ActiveListingLimitService,
    private readonly mapHover: MapHoverRecenterFlagService,
    private readonly legalConsent: LegalConsentFlagService,
  ) {}

  @Get()
  async get(): Promise<PublicSettingsView> {
    return {
      promotionsEnabled: await this.flags.isEnabled(),
      activeListingLimit: await this.activeLimit.getLimit(),
      mapHoverRecenter: await this.mapHover.isEnabled(),
      legalConsentRequired: await this.legalConsent.isRequired(),
      legalConsentVersion: await this.legalConsent.currentVersion(),
    };
  }
}
