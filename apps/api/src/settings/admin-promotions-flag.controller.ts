import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { PromotionsFlagService } from './promotions-flag.service';
import { UpdatePromotionsFlagDto } from './dto/update-promotions-flag.dto';

/**
 * Runtime-тоггл доступности продвижения объявлений (ADMIN). GET — текущее
 * состояние; PATCH — включить/выключить без пересборки (пишет app_settings).
 * Зеркалит AdminSmsSettingsController. Клиент читает значение через
 * GET /settings/public.
 */
@Controller({ path: 'admin/promotions-flag', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPromotionsFlagController {
  constructor(private readonly flags: PromotionsFlagService) {}

  @Get()
  async get(): Promise<{ promotionsEnabled: boolean }> {
    return { promotionsEnabled: await this.flags.isEnabled() };
  }

  @Patch()
  async update(
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdatePromotionsFlagDto,
  ): Promise<{ promotionsEnabled: boolean }> {
    return {
      promotionsEnabled: await this.flags.setEnabled(adminId, dto.enabled),
    };
  }
}
