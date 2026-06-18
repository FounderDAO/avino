import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthenticatedUser } from '../common/guards';
import {
  JwtAuthGuard,
  OptionalJwtAuthGuard,
  RolesGuard,
} from '../common/guards';
import { CreateListingDto } from './dto/create-listing.dto';
import { ListMyListingsQueryDto } from './dto/list-my-listings.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { OwnerStatusDto } from './dto/owner-status.dto';
import {
  ListingDetailResponse,
  ListingListItem,
  ListingResponse,
  ListingsService,
  PaginatedResponse,
} from './listings.service';

/**
 * ListingsController — CRUD объявлений (TASK-050/051, API.md §7).
 *
 * Guards подключаются ПОэндпоинтно (не на классе), т.к. видимость разная:
 * create/update — Bearer (`JwtAuthGuard`); публичная карточка `GET :id` —
 * `OptionalJwtAuthGuard` (гость видит ACTIVE, владелец/MODERATOR/ADMIN — и
 * непубличные статусы). Версионирование URI обязательно (CLAUDE.md §14);
 * префикс `api` ставит main.ts.
 */
@Controller({ path: 'listings', version: '1' })
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  /**
   * `POST /api/v1/listings` — создать объявление (статус `NEW`).
   *
   * Любой аутентифицированный пользователь (включая свежий `USER`) может
   * публиковать: при первом объявлении автор без продавцовской роли авто-
   * апгрейдится до `OWNER` в сервисе (ADR-0083). `USER` здесь — низкий порог
   * входа; остальные роли перечислены явно, чтобы список владельцев был виден.
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.USER,
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

  /**
   * `GET /api/v1/listings/mine` — листинги текущего пользователя (любой статус,
   * кроме DELETED). Объявлен ДО `:id`, чтобы статический путь не перехватывался
   * параметрическим роутом. Query: `status`, `page`, `limit` (page-based).
   */
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  findMine(
    @CurrentUser('id') userId: string,
    @Query() query: ListMyListingsQueryDto,
  ): Promise<PaginatedResponse<ListingListItem>> {
    return this.listingsService.findMine(userId, query);
  }

  /**
   * `GET /api/v1/listings/:id` — публичная карточка объявления.
   * Перевод выбирается по `?lang`/`Accept-Language` с фолбэком на
   * `original_language`; медиа включены.
   */
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(
    @Param('id', ParseUUIDPipe) listingId: string,
    @CurrentUser() viewer: AuthenticatedUser | undefined,
    @Query('lang') lang?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<ListingDetailResponse> {
    return this.listingsService.findOne(
      listingId,
      viewer,
      lang,
      acceptLanguage,
    );
  }

  /** `PATCH /api/v1/listings/:id` — обновить собственное объявление. */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body() dto: UpdateListingDto,
  ): Promise<ListingResponse> {
    return this.listingsService.update(userId, listingId, dto);
  }

  /**
   * `PATCH /api/v1/listings/:id/status` — владельческая смена статуса своего
   * листинга: скрыть (ARCHIVED) / продано (SOLD) / сдано (RENTED) / вернуть в
   * продажу (REACTIVATE). Только Bearer; ownership проверяет сервис.
   */
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  setStatus(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body() dto: OwnerStatusDto,
  ): Promise<ListingResponse> {
    return this.listingsService.setOwnerStatus(userId, listingId, dto.action);
  }
}
