import { Module } from '@nestjs/common';
import { EmailModule } from '../email';
import { NotificationsModule } from '../notifications';
import { RolesModule } from '../roles';
import { SearchModule } from '../search';
import { SavedSearchAlertService } from './saved-search-alert.service';
import { SavedSearchWorker } from './saved-search.worker';
import { SavedSearchesController } from './saved-searches.controller';
import { SavedSearchesService } from './saved-searches.service';

/**
 * SavedSearchesModule — сохранённые поиски (TASK-091, M9) + polling-матчер
 * алертов (TASK-102, M10).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) одним импортом
 * (TASK-044) для CRUD-контроллера. Prisma — глобальный модуль, импорт не нужен.
 *
 * Матчер (TASK-102): {@link SavedSearchAlertService} — бизнес-логика проверки,
 * {@link SavedSearchWorker} — консьюмер `saved_search_queue` (расписание ставит
 * глобальный {@link SavedSearchQueue} из QueuesModule). Импорты: `SearchModule`
 * ({@link SearchService.matchNewlyActiveListings} — те же фильтры, что и
 * `/search`), `NotificationsModule` (постановка PENDING-уведомлений),
 * `EmailModule` (дайджест-письмо через `email_queue`).
 */
@Module({
  imports: [RolesModule, SearchModule, NotificationsModule, EmailModule],
  controllers: [SavedSearchesController],
  providers: [SavedSearchesService, SavedSearchAlertService, SavedSearchWorker],
  exports: [SavedSearchesService, SavedSearchAlertService],
})
export class SavedSearchesModule {}
