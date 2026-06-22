import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { AdminNotificationSettingsService } from './admin-notification-settings.service';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';

/**
 * Runtime-управление доставкой уведомлений (ADMIN, ADR-0102). GET — текущее
 * состояние email/push тогглов; PATCH — включить/выключить без пересборки
 * (пишет app_settings). Выключенный канал оставляет доставки PENDING —
 * они будут доставлены при включении. Зеркалит AdminSmsSettingsController.
 */
@Controller({ path: 'admin/notification-settings', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminNotificationSettingsController {
  constructor(private readonly service: AdminNotificationSettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Patch()
  update(
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.service.update(adminId, dto);
  }
}
