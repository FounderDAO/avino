import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../common/guards';
import { JwtAuthGuard } from '../common/guards';
import { CreateSavedSearchDto } from './dto/create-saved-search.dto';
import { ListSavedSearchesQueryDto } from './dto/list-saved-searches.dto';
import { UpdateSavedSearchDto } from './dto/update-saved-search.dto';
import {
  SavedSearchesService,
  SavedSearchListResponse,
  SavedSearchResponse,
} from './saved-searches.service';

/**
 * SavedSearchesController — сохранённые поиски (TASK-091, API.md §12).
 *
 * Все эндпоинты под `JwtAuthGuard` (класс-уровень): `GUEST` без Bearer → `401`.
 * Версионирование URI обязательно (CLAUDE.md §14); префикс `api` ставит main.ts
 * → `/api/v1/saved-searches`. Владение поиском enforced в сервисе.
 */
@Controller({ path: 'saved-searches', version: '1' })
@UseGuards(JwtAuthGuard)
export class SavedSearchesController {
  constructor(private readonly savedSearchesService: SavedSearchesService) {}

  /** `GET /api/v1/saved-searches` — поиски пользователя (свежие сверху). */
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListSavedSearchesQueryDto,
  ): Promise<SavedSearchListResponse> {
    return this.savedSearchesService.list(user, query.limit);
  }

  /**
   * `POST /api/v1/saved-searches` — создать поиск. → `201`.
   * `422 UNSUPPORTED_FILTER_SCHEMA` при неизвестной `schemaVersion`.
   */
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSavedSearchDto,
  ): Promise<SavedSearchResponse> {
    return this.savedSearchesService.create(user, dto);
  }

  /**
   * `PATCH /api/v1/saved-searches/:id` — обновить `name` / `filters_json` /
   * `is_active`. → `200`. Чужой/несуществующий → `404`.
   */
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSavedSearchDto,
  ): Promise<SavedSearchResponse> {
    return this.savedSearchesService.update(user, id, dto);
  }

  /** `DELETE /api/v1/saved-searches/:id` — удалить свой поиск. → `204`. */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.savedSearchesService.remove(user, id);
  }
}
