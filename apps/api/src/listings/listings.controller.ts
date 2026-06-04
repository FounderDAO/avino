import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { ListingResponse, ListingsService } from './listings.service';

/**
 * ListingsController — создание/обновление объявлений (TASK-050, API.md §7).
 *
 * Все эндпоинты под `@UseGuards(JwtAuthGuard, RolesGuard)` (Auth: Bearer).
 * Создание требует роли с правом публикации (`@Roles(...)`); обновление доступно
 * любому аутентифицированному, но сервис разрешает менять только собственное
 * объявление (`ownerId` из access-токена). Версионирование URI обязательно
 * (CLAUDE.md §14); префикс `api` ставит main.ts.
 */
@Controller({ path: 'listings', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  /** `POST /api/v1/listings` — создать объявление (статус `NEW`). */
  @Post()
  @Roles(
    UserRole.OWNER,
    UserRole.AGENT,
    UserRole.AGENCY,
    UserRole.LANDLORD,
    UserRole.PROPERTY_MANAGER,
  )
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateListingDto,
  ): Promise<ListingResponse> {
    return this.listingsService.create(userId, dto);
  }

  /** `PATCH /api/v1/listings/:id` — обновить собственное объявление. */
  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body() dto: UpdateListingDto,
  ): Promise<ListingResponse> {
    return this.listingsService.update(userId, listingId, dto);
  }
}
