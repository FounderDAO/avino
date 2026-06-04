import { Module } from '@nestjs/common';
import { RolesModule } from '../roles';
import { TranslationsController } from './translations.controller';
import { TranslationsService } from './translations.service';

/**
 * TranslationsModule — хранение/выдача переводов объявления (TASK-070, M7).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) одним импортом
 * (TASK-044). Экспортирует {@link TranslationsService}, чтобы ListingsModule
 * делегировал ему построение авторской строки и выбор языка. Prisma — глобальный
 * модуль, импорт не нужен.
 */
@Module({
  imports: [RolesModule],
  controllers: [TranslationsController],
  providers: [TranslationsService],
  exports: [TranslationsService],
})
export class TranslationsModule {}
