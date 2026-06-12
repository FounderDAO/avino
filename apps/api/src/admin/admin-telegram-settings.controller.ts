import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { AdminTelegramSettingsService } from './admin-telegram-settings.service';
import { UpdateTelegramSettingsDto } from './dto/update-telegram-settings.dto';

/**
 * Runtime-управление Telegram-алертами (ADMIN, API.md §6). GET — текущее
 * состояние; PATCH — включить/выключить без пересборки (пишет app_settings).
 */
@Controller({ path: 'admin/telegram-settings', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminTelegramSettingsController {
  constructor(private readonly service: AdminTelegramSettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Patch()
  update(
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateTelegramSettingsDto,
  ) {
    return this.service.update(adminId, dto);
  }
}
