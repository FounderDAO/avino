import { Module } from '@nestjs/common';
import { RolesModule } from '../roles';
import { ComplaintsController } from './complaints.controller';
import { ComplaintsService } from './complaints.service';

/**
 * ComplaintsModule — жалобы на объявления (TASK-132, API.md §16, M5).
 *
 * Владеет бизнес-логикой ({@link ComplaintsService}) и пользовательским роутом
 * `POST /complaints` ({@link ComplaintsController}). `RolesModule` даёт
 * Bearer-аутентификацию ({@link JwtAuthGuard}) одним импортом (TASK-044); Prisma —
 * глобальный модуль, импорт не нужен. Сервис экспортируется для админ-роутов
 * (`AdminComplaintsController` в {@link AdminModule}).
 */
@Module({
  imports: [RolesModule],
  controllers: [ComplaintsController],
  providers: [ComplaintsService],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
