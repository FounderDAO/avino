import { Module } from '@nestjs/common';
import { GeoModule } from '../geo';
import { RolesModule } from '../roles';
import { SettingsModule } from '../settings';
import { TranslationsModule } from '../translations';
import { UploadsModule } from '../uploads';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

/**
 * ListingsModule — создание/обновление объявлений (TASK-050, M5).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) и проверку
 * ролей ({@link RolesGuard}) одним импортом (TASK-044); `TranslationsModule` —
 * {@link TranslationsService} для построения авторской строки и выбора языка
 * (TASK-070); `GeoModule` — {@link DistrictsService} для `district_name` в
 * детальной (TASK-209); `UploadsModule` — {@link UploadsService} для свежей
 * presigned-подписи медиа на чтении (ADR-0086). Prisma — глобальный модуль.
 */
@Module({
  imports: [RolesModule, TranslationsModule, GeoModule, UploadsModule, SettingsModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
