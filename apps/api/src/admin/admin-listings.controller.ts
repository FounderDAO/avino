import {
  BadGatewayException,
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Language } from '@prisma/client';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser, JwtAuthGuard, RolesGuard } from '../common/guards';
import { ListAdminListingsQueryDto } from '../moderation/dto/list-admin-listings.dto';
import { ModerateListingDto } from '../moderation/dto/moderate-listing.dto';
import {
  AdminListingListItem,
  AdminListingOwner,
  ModerationLogResponse,
  ModerationResultResponse,
  ModerationService,
  PaginatedResponse,
} from '../moderation';
import {
  ListingAutoTranslator,
  ListingTranslationsResponse,
  TranslationsService,
  UpdateModeratorTranslationDto,
} from '../translations';

/**
 * AdminListingsController — модерация объявлений (TASK-053, API.md §16).
 *
 * Все роуты под `/api/v1/admin/listings` доступны только MODERATOR/ADMIN —
 * `JwtAuthGuard` + `RolesGuard` на классе (видимость одинаковая для всех
 * хендлеров). Версионирование URI обязательно (CLAUDE.md §14); префикс `api`
 * ставит main.ts.
 */
@Controller({ path: 'admin/listings', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MODERATOR, UserRole.ADMIN)
export class AdminListingsController {
  constructor(
    private readonly moderationService: ModerationService,
    private readonly translator: ListingAutoTranslator,
    private readonly translations: TranslationsService,
  ) {}

  /** `GET /api/v1/admin/listings` — очередь модерации и админ-список. */
  @Get()
  list(
    @Query() query: ListAdminListingsQueryDto,
  ): Promise<PaginatedResponse<AdminListingListItem>> {
    return this.moderationService.listListings(query);
  }

  /** `PATCH /api/v1/admin/listings/:id/status` — сменить статус (модерация). */
  @Patch(':id/status')
  changeStatus(
    @CurrentUser('id') moderatorId: string,
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body() dto: ModerateListingDto,
  ): Promise<ModerationResultResponse> {
    return this.moderationService.changeStatus(moderatorId, listingId, dto);
  }

  /** `GET /api/v1/admin/listings/:id/moderation-logs` — история модерации. */
  @Get(':id/moderation-logs')
  findLogs(
    @Param('id', ParseUUIDPipe) listingId: string,
  ): Promise<ModerationLogResponse[]> {
    return this.moderationService.findLogs(listingId);
  }

  /**
   * `GET /api/v1/admin/listings/:id/owner` — инлайн-профиль автора (item #6).
   * Публичная деталь `GET /listings/:id` отдаёт лишь `owner_id`; имя/контакт
   * автора для админ-детали берём отсюда (доступно MODERATOR и ADMIN).
   */
  @Get(':id/owner')
  findOwner(
    @Param('id', ParseUUIDPipe) listingId: string,
  ): Promise<AdminListingOwner> {
    return this.moderationService.getListingOwner(listingId);
  }

  /** `POST /api/v1/admin/listings/:id/translations/generate` — синхронная генерация (ADR-0091). */
  @Post(':id/translations/generate')
  async generateTranslations(
    @Param('id', ParseUUIDPipe) listingId: string,
    @CurrentUser() viewer: AuthenticatedUser,
  ): Promise<ListingTranslationsResponse> {
    try {
      await this.translator.generateTranslations(listingId);
    } catch {
      // Сбой внешнего провайдера перевода (Yandex 4xx/5xx) → 502, строки
      // неудачных языков не меняются (ADR-0091, спека §7).
      throw new BadGatewayException({
        code: ApiErrorCode.INTERNAL_ERROR,
        message: 'Translation provider failed',
      });
    }
    // Отсутствующий/DELETED листинг: generateTranslations молча выходит, а
    // listByListing бросит 404 — единый путь not-found.
    return this.translations.listByListing(listingId, viewer);
  }

  /** `PATCH /api/v1/admin/listings/:id/translations/:language` — ручная правка (ADR-0091). */
  @Patch(':id/translations/:language')
  async updateTranslation(
    @Param('id', ParseUUIDPipe) listingId: string,
    @Param('language', new ParseEnumPipe(Language)) language: Language,
    @Body() dto: UpdateModeratorTranslationDto,
    @CurrentUser() viewer: AuthenticatedUser,
  ): Promise<ListingTranslationsResponse> {
    await this.translations.updateModeratorTranslation(listingId, language, dto);
    return this.translations.listByListing(listingId, viewer);
  }
}
