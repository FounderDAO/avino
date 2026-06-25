import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { MapHoverRecenterFlagService } from './map-hover-recenter-flag.service';
import { UpdateMapHoverRecenterFlagDto } from './dto/update-map-hover-recenter-flag.dto';

/**
 * Runtime-тоггл центрирования карты при наведении на карточку (ADMIN). GET —
 * текущее состояние; PATCH — вкл/выкл без пересборки (пишет app_settings).
 * Зеркалит AdminPromotionsFlagController. Клиент читает значение через
 * GET /settings/public.
 */
@Controller({ path: 'admin/map-hover-recenter-flag', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminMapHoverRecenterFlagController {
  constructor(private readonly flags: MapHoverRecenterFlagService) {}

  @Get()
  async get(): Promise<{ mapHoverRecenter: boolean }> {
    return { mapHoverRecenter: await this.flags.isEnabled() };
  }

  @Patch()
  async update(
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateMapHoverRecenterFlagDto,
  ): Promise<{ mapHoverRecenter: boolean }> {
    return {
      mapHoverRecenter: await this.flags.setEnabled(adminId, dto.enabled),
    };
  }
}
