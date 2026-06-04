import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { ListAdminListingsQueryDto } from '../moderation/dto/list-admin-listings.dto';
import { ModerateListingDto } from '../moderation/dto/moderate-listing.dto';
import {
  AdminListingListItem,
  ModerationLogResponse,
  ModerationResultResponse,
  ModerationService,
  PaginatedResponse,
} from '../moderation';

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
  constructor(private readonly moderationService: ModerationService) {}

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
}
