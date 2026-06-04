import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../common/guards';
import { JwtAuthGuard } from '../common/guards';
import {
  ListingTranslationsResponse,
  TranslationsService,
} from './translations.service';

/**
 * TranslationsController — переводы объявления (TASK-070, API.md §7).
 *
 * `GET /api/v1/listings/:id/translations` доступен только владельцу/MODERATOR/
 * ADMIN: Bearer (`JwtAuthGuard`) + ownership-гейт в сервисе (посторонний → 403).
 * Версионирование URI обязательно (CLAUDE.md §14); префикс `api` ставит main.ts.
 */
@Controller({ path: 'listings/:listingId/translations', version: '1' })
export class TranslationsController {
  constructor(private readonly translationsService: TranslationsService) {}

  /** `GET /api/v1/listings/:id/translations` — все переводы листинга. */
  @Get()
  @UseGuards(JwtAuthGuard)
  list(
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListingTranslationsResponse> {
    return this.translationsService.listByListing(listingId, user);
  }
}
