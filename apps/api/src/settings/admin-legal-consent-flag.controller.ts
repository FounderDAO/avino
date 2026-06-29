import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { LegalConsentFlagService } from './legal-consent-flag.service';
import { UpdateLegalConsentFlagDto } from './dto/update-legal-consent-flag.dto';

interface LegalConsentFlagView {
  legalConsentRequired: boolean;
  legalConsentVersion: number;
}

/**
 * Runtime-управление согласием с юр-документами (ADMIN). GET — текущее состояние;
 * PATCH — включить/выключить требование и/или поднять версию документов без
 * пересборки (пишет app_settings). Клиент читает значения через GET /settings/public.
 * Зеркалит AdminPromotionsFlagController; регистрируется в AdminModule.
 */
@Controller({ path: 'admin/legal-consent-flag', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminLegalConsentFlagController {
  constructor(private readonly flags: LegalConsentFlagService) {}

  @Get()
  async get(): Promise<LegalConsentFlagView> {
    return {
      legalConsentRequired: await this.flags.isRequired(),
      legalConsentVersion: await this.flags.currentVersion(),
    };
  }

  @Patch()
  async update(
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateLegalConsentFlagDto,
  ): Promise<LegalConsentFlagView> {
    if (dto.required !== undefined) {
      await this.flags.setRequired(adminId, dto.required);
    }
    if (dto.version !== undefined) {
      await this.flags.setVersion(adminId, dto.version);
    }
    return {
      legalConsentRequired: await this.flags.isRequired(),
      legalConsentVersion: await this.flags.currentVersion(),
    };
  }
}
