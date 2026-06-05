import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
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
  ThreadListResponse,
  ThreadResponse,
} from './chat.service';
import { CreateThreadDto } from './dto/create-thread.dto';
import { ListThreadsQueryDto } from './dto/list-threads.dto';

/**
 * ChatController — внутренний чат, треды (TASK-110, API.md §13).
 *
 * Все эндпоинты под `JwtAuthGuard` (класс-уровень): `GUEST` без Bearer → `401`
 * (CLAUDE.md §10/§11). Версионирование URI обязательно (CLAUDE.md §14); префикс
 * `api` ставит main.ts → `/api/v1/chat/threads`. Сообщения тредов
 * (`GET/POST /chat/threads/:id/messages`, read-status) — TASK-111.
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
}
