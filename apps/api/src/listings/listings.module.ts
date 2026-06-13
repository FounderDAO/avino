import { Module } from '@nestjs/common';
import { RolesModule } from '../roles';
import { TranslationsModule } from '../translations';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

/**
 * ListingsModule — создание/обновление объявлений (TASK-050, M5).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) и проверку
 * ролей ({@link RolesGuard}) одним импортом (TASK-044); `TranslationsModule` —
 * {@link TranslationsService} для построения авторской строки и выбора языка
 * (TASK-070). Prisma — глобальный модуль, импорт не нужен.
 */
@Module({
  imports: [RolesModule, TranslationsModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
