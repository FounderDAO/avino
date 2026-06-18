import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { AdminSmsSettingsService } from './admin-sms-settings.service';
import { UpdateSmsSettingsDto } from './dto/update-sms-settings.dto';

/**
 * Runtime-управление отправкой SMS (ADMIN, API.md §6). GET — текущее состояние;
 * PATCH — включить/выключить без пересборки (пишет app_settings). На выключенном
 * канале запрос OTP·SMS отвечает 503 AUTH_PROVIDER_UNAVAILABLE (OtpService).
 */
@Controller({ path: 'admin/sms-settings', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSmsSettingsController {
  constructor(private readonly service: AdminSmsSettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Patch()
  update(
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateSmsSettingsDto,
  ) {
    return this.service.update(adminId, dto);
  }
}
