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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../common/guards';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../common/guards';
import { ReorderMediaDto } from './dto/reorder-media.dto';
import {
  ListingMediaResponse,
  ListingMediaService,
  UploadedImageFile,
} from './listing-media.service';

/**
 * ListingMediaController — медиа объявления (TASK-061, API.md §8).
 *
 * Guards подключаются ПОэндпоинтно: модификация (upload/delete/reorder) — Bearer
 * (`JwtAuthGuard`) + ownership-гейт в сервисе (владелец/ADMIN); публичный список
 * `GET media` — `OptionalJwtAuthGuard` (ACTIVE виден гостю, непубличные статусы —
 * владельцу/MODERATOR/ADMIN). Версионирование URI обязательно (CLAUDE.md §14);
 * префикс `api` ставит main.ts.
 *
 * Целевой flow загрузки — direct-to-S3 (presigned PUT); здесь реализован
 * допустимый для MVP proxy через API (API.md §8).
 */
@Controller({ path: 'listings/:listingId/media', version: '1' })
export class ListingMediaController {
  constructor(private readonly listingMediaService: ListingMediaService) {}

  /** `GET /api/v1/listings/:id/media` — медиа листинга по `sort_order`. */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list(
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @CurrentUser() viewer: AuthenticatedUser | undefined,
  ): Promise<ListingMediaResponse[]> {
    return this.listingMediaService.list(listingId, viewer);
  }

  /**
   * `POST /api/v1/listings/:id/media` — proxy-загрузка изображения.
   * `multipart/form-data`, поле `file`. Auth: владелец/ADMIN.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedImageFile | undefined,
  ): Promise<ListingMediaResponse> {
    return this.listingMediaService.uploadFile(listingId, user, file);
  }

  /**
   * `PATCH /api/v1/listings/:id/media/reorder` — переупорядочить галерею.
   * Auth: владелец/ADMIN. Body: `{ "order": ["m2","m1",...] }`.
   */
  @Patch('reorder')
  @UseGuards(JwtAuthGuard)
  reorder(
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReorderMediaDto,
  ): Promise<ListingMediaResponse[]> {
    return this.listingMediaService.reorder(listingId, user, dto.order);
  }

  /**
   * `DELETE /api/v1/listings/:id/media/:mediaId` — удалить медиа. Auth:
   * владелец/ADMIN. → `204`.
   */
  @Delete(':mediaId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  remove(
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.listingMediaService.remove(listingId, user, mediaId);
  }
}
