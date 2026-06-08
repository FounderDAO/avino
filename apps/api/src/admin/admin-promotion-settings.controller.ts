import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { AdminPromotionSettingsService } from './admin-promotion-settings.service';
import { UpdatePromotionSettingsDto } from './dto/update-promotion-settings.dto';

@Controller({ path: 'admin/promotion-settings', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPromotionSettingsController {
  constructor(private readonly service: AdminPromotionSettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Patch()
  update(@CurrentUser('id') adminId: string, @Body() dto: UpdatePromotionSettingsDto) {
    return this.service.update(adminId, dto);
  }
}
