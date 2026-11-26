import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { MinAppBuild, MinAppBuildService } from './min-app-build.service';
import { UpdateMinAppBuildDto } from './dto/update-min-app-build.dto';

/**
 * Runtime-настройка минимальной сборки мобильного приложения (ADMIN).
 * GET — текущие значения; PATCH — задать iOS и/или Android без пересборки
 * (пишет app_settings). Приложение читает значения через GET /settings/public
 * (minAppBuildIos / minAppBuildAndroid). Зеркалит
 * AdminActiveListingLimitController; зарегистрирован в AdminModule (его DTO не
 * должны просачиваться в публичный OpenAPI-документ).
 */
@Controller({ path: 'admin/min-app-build', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminMinAppBuildController {
  constructor(private readonly minBuild: MinAppBuildService) {}

  @Get()
  async get(): Promise<MinAppBuild> {
    return this.minBuild.get();
  }

  @Patch()
  async update(
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateMinAppBuildDto,
  ): Promise<MinAppBuild> {
    return this.minBuild.set(adminId, { ios: dto.ios, android: dto.android });
  }
}
