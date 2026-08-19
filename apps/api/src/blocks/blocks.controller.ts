import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../common/guards';
import { JwtAuthGuard } from '../common/guards';
import {
  BlockListResponse,
  BlockResponse,
  BlocksService,
} from './blocks.service';
import { CreateBlockDto } from './dto/create-block.dto';

/**
 * BlocksController — блокировка пользователей (Apple Guideline 1.2, спека
 * 2026-08-19). Все эндпоинты под `JwtAuthGuard`: `GUEST` без Bearer → `401`.
 * Версионирование URI обязательно (CLAUDE.md §14) → `/api/v1/blocks`.
 */
@Controller({ path: 'blocks', version: '1' })
@UseGuards(JwtAuthGuard)
export class BlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  /** `GET /api/v1/blocks` — заблокированные текущим пользователем. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<BlockListResponse> {
    return this.blocksService.list(user);
  }

  /**
   * `POST /api/v1/blocks` — заблокировать. Body: `{ "user_id": "..." }` →
   * `201`; повтор идемпотентен, self-block → `400`, нет юзера → `404`.
   */
  @Post()
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBlockDto,
  ): Promise<BlockResponse> {
    return this.blocksService.add(user, dto.user_id);
  }

  /** `DELETE /api/v1/blocks/:userId` — разблокировать. → `204` (идемпотентно). */
  @Delete(':userId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.blocksService.remove(user, userId);
  }
}
