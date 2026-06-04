import { Module } from '@nestjs/common';
import { RolesModule } from '../roles';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

/**
 * ListingsModule — создание/обновление объявлений (TASK-050, M5).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) и проверку
 * ролей ({@link RolesGuard}) одним импортом (TASK-044). Prisma — глобальный
 * модуль, импорт не нужен.
 */
@Module({
  imports: [RolesModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
