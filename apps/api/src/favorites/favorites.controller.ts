import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../common/guards';
import { JwtAuthGuard } from '../common/guards';
import type {
  CursorPaginatedResponse,
  SearchListItem,
} from '../search';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { ListFavoritesQueryDto } from './dto/list-favorites.dto';
import { FavoriteResponse, FavoritesService } from './favorites.service';

/**
 * FavoritesController — избранные объявления (TASK-090, API.md §11).
 *
 * Все эндпоинты под `JwtAuthGuard` (класс-уровень): `GUEST` без Bearer → `401`
 * (CLAUDE.md §11). Версионирование URI обязательно (CLAUDE.md §14); префикс `api`
 * ставит main.ts → `/api/v1/favorites`. Карточки списка — как в `/search`,
 * язык по `?lang`/`Accept-Language` с фолбэком на оригинал.
 */
@Controller({ path: 'favorites', version: '1' })
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  /** `GET /api/v1/favorites` — избранное пользователя (keyset, свежие сверху). */
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListFavoritesQueryDto,
    @Query('lang') lang?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<CursorPaginatedResponse<SearchListItem>> {
    return this.favoritesService.list(
      user,
      query.limit,
      query.cursor,
      lang,
      acceptLanguage,
    );
  }

  /**
   * `POST /api/v1/favorites` — добавить в избранное. Body: `{ "listing_id": "..." }`.
   * → `201`. `409 ALREADY_FAVORITED` при дубликате, `404` если листинга нет.
   */
  @Post()
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFavoriteDto,
  ): Promise<FavoriteResponse> {
    return this.favoritesService.add(user, dto.listing_id);
  }

  /** `DELETE /api/v1/favorites/:listingId` — убрать из избранного. → `204`. */
  @Delete(':listingId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ): Promise<void> {
    return this.favoritesService.remove(user, listingId);
  }
}
