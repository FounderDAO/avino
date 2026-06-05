import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../common/guards';
import { JwtAuthGuard } from '../common/guards';
import {
  ChatService,
  MessageListResponse,
  MessageResponse,
  ThreadListResponse,
  ThreadResponse,
} from './chat.service';
import { CreateThreadDto } from './dto/create-thread.dto';
import { ListMessagesQueryDto } from './dto/list-messages.dto';
import { ListThreadsQueryDto } from './dto/list-threads.dto';
import { SendMessageDto } from './dto/send-message.dto';

/**
 * ChatController — внутренний чат, треды (TASK-110, API.md §13).
 *
 * Все эндпоинты под `JwtAuthGuard` (класс-уровень): `GUEST` без Bearer → `401`
 * (CLAUDE.md §10/§11). Версионирование URI обязательно (CLAUDE.md §14); префикс
 * `api` ставит main.ts → `/api/v1/chat/threads`. Треды — TASK-110; сообщения
 * (`GET/POST /chat/threads/:id/messages`) и отметка прочтения
 * (`POST /chat/threads/:id/read`) — TASK-111.
 */
@Controller({ path: 'chat', version: '1' })
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * `GET /api/v1/chat/threads` — треды пользователя (как initiator или owner),
   * keyset-пагинация, свежая активность сверху.
   */
  @Get('threads')
  listThreads(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListThreadsQueryDto,
    @Query('lang') lang?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<ThreadListResponse> {
    return this.chatService.listThreads(
      user,
      query.limit,
      query.cursor,
      lang,
      acceptLanguage,
    );
  }

  /**
   * `POST /api/v1/chat/threads` — создать/получить тред с создателем листинга.
   * Идемпотентно: новый тред → `201`, существующий → `200` (по unique-ключу
   * `listing_id + initiator_id + owner_id`). `403` (себе/`GUEST`), `404` (нет
   * листинга), `422 LISTING_NOT_AVAILABLE` (`DELETED`/непубличный).
   */
  @Post('threads')
  async createThread(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateThreadDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ThreadResponse> {
    const { thread, created } = await this.chatService.createThread(
      user,
      dto.listing_id,
    );
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return thread;
  }

  /**
   * `GET /api/v1/chat/threads/:id/messages` — сообщения треда, keyset-пагинация,
   * свежие сверху. Доступ: участник треда ИЛИ `MODERATOR`/`ADMIN` (complaint-flow).
   * `404` (нет треда), `403` (не участник и не модератор).
   */
  @Get('threads/:id/messages')
  listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<MessageListResponse> {
    return this.chatService.listMessages(user, id, query.limit, query.cursor);
  }

  /**
   * `POST /api/v1/chat/threads/:id/messages` — отправить сообщение. Доступ —
   * только участник треда. `201` → объект сообщения. `404`, `403`,
   * `422 LISTING_NOT_AVAILABLE` (листинг `DELETED`). Создаёт `NEW_CHAT_MESSAGE`.
   */
  @Post('threads/:id/messages')
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageResponse> {
    return this.chatService.createMessage(user, id, dto.body);
  }

  /**
   * `POST /api/v1/chat/threads/:id/read` — отметить входящие прочитанными. Доступ
   * — только участник. → `204`. `404` (нет треда), `403` (не участник).
   * Маршрут — `POST` per API.md §13 (карточка TASK-111 пишет `PATCH`, но API.md
   * авторитетен по формулировке маршрутов — как в ADR-0036 для notifications).
   */
  @Post('threads/:id/read')
  @HttpCode(204)
  read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.chatService.markRead(user, id);
  }
}
