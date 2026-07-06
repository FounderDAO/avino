import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications';
import { RolesModule } from '../roles';
import { SearchModule } from '../search';
import { UploadsModule } from '../uploads';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/**
 * ChatModule — внутренний чат: треды (TASK-110) и сообщения (TASK-111, M11).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) одним импортом
 * (TASK-044); `SearchModule` — {@link SearchService.cardsByIds} для `listing_preview`
 * в карточках тредов «как в /search» (API.md §13); `NotificationsModule` —
 * {@link NotificationsService.queueChatMessage} для `NEW_CHAT_MESSAGE` при отправке
 * сообщения. Prisma — глобальный модуль, импорт не нужен.
 */
@Module({
  imports: [RolesModule, SearchModule, NotificationsModule, UploadsModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
