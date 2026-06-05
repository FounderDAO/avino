import { Module } from '@nestjs/common';
import { RolesModule } from '../roles';
import { SearchModule } from '../search';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/**
 * ChatModule — внутренний чат, треды (TASK-110, M11).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) одним импортом
 * (TASK-044); `SearchModule` — {@link SearchService.cardsByIds} для `listing_preview`
 * в карточках тредов «как в /search» (API.md §13). Prisma — глобальный модуль,
 * импорт не нужен. Сообщения и уведомления чата — TASK-111.
 */
@Module({
  imports: [RolesModule, SearchModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
