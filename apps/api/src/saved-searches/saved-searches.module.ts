import { Module } from '@nestjs/common';
import { RolesModule } from '../roles';
import { SavedSearchesController } from './saved-searches.controller';
import { SavedSearchesService } from './saved-searches.service';

/**
 * SavedSearchesModule — сохранённые поиски (TASK-091, M9).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) одним импортом
 * (TASK-044). Prisma — глобальный модуль, импорт не нужен. Карточки листингов
 * здесь не гидратируются (в отличие от `/favorites`), поэтому `SearchModule` не
 * требуется. `SavedSearchesService` экспортируется для будущего polling-матчера.
 */
@Module({
  imports: [RolesModule],
  controllers: [SavedSearchesController],
  providers: [SavedSearchesService],
  exports: [SavedSearchesService],
})
export class SavedSearchesModule {}
