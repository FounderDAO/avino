import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { ActiveListingLimitService } from './active-listing-limit.service';
import { UpdateActiveListingLimitDto } from './dto/update-active-listing-limit.dto';

/**
 * Runtime-настройка лимита активных объявлений обычного клиента (ADMIN).
 * GET — текущее значение; PATCH — задать без пересборки (пишет app_settings).
 * Зеркалит AdminPromotionsFlagController. Клиент читает значение через
 * GET /settings/public. Зарегистрирован в AdminModule (его DTO не должны
 * просачиваться в публичный OpenAPI-документ).
 */
@Controller({ path: 'admin/active-listing-limit', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminActiveListingLimitController {
  constructor(private readonly limit: ActiveListingLimitService) {}

  @Get()
  async get(): Promise<{ activeListingLimit: number }> {
    return { activeListingLimit: await this.limit.getLimit() };
  }

  @Patch()
  async update(
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateActiveListingLimitDto,
  ): Promise<{ activeListingLimit: number }> {
    return {
      activeListingLimit: await this.limit.setLimit(adminId, dto.limit),
    };
  }
}
