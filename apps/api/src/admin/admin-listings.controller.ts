import {
  BadGatewayException,
  Body,
  Controller,
  Get,
  Header,
  Logger,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Language } from '@prisma/client';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser, JwtAuthGuard, RolesGuard } from '../common/guards';
import { ExportAdminListingsQueryDto } from '../moderation/dto/export-admin-listings.dto';
import { ListAdminListingsQueryDto } from '../moderation/dto/list-admin-listings.dto';
import { ModerateListingDto } from '../moderation/dto/moderate-listing.dto';
import {
  AdminListingDuplicate,
  AdminListingListItem,
  AdminListingOwner,
  ModerationLogResponse,
  ModerationResultResponse,
  ModerationService,
  PaginatedResponse,
} from '../moderation';
import {
  GenerateTranslationsDto,
  GenerateTranslationsResponse,
  GenerateTranslationsResult,
  ListingAutoTranslator,
  ListingTranslationsResponse,
  TranslationsService,
  UpdateModeratorTranslationDto,
  UpdateOriginalListingDto,
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
  private readonly logger = new Logger(AdminListingsController.name);

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

  /**
   * `GET /api/v1/admin/listings/export` — выгрузка списка в `.xlsx` по тем же
   * фильтрам, что и список (`page`/`limit` игнорируются), либо только отмеченных
   * объявлений (`ids`). Только ADMIN: файл разом отдаёт телефоны и email
   * авторов — как и импорт (ADR-0162).
   */
  @Get('export')
  @Roles(UserRole.ADMIN)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="avino-listings.xlsx"')
  async export(
    @Query() query: ExportAdminListingsQueryDto,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.moderationService.exportListings(query));
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

  /**
   * `GET /api/v1/admin/listings/:id/duplicates` — возможные дубликаты для
   * карточки модерации: та же цена + площадь + этажность + адрес (без учёта
   * регистра/лишних пробелов) среди NEW/ACTIVE. Пустой массив — совпадений нет.
   */
  @Get(':id/duplicates')
  findDuplicates(
    @Param('id', ParseUUIDPipe) listingId: string,
  ): Promise<AdminListingDuplicate[]> {
    return this.moderationService.findDuplicates(listingId);
  }

  /**
   * `POST /api/v1/admin/listings/:id/translations/generate` — синхронная
   * генерация (ADR-0091). Тело `{ force? }`: `force=true` перезаписывает даже
   * правленные вручную целевые языки (оригинал не трогается). Ответ включает
   * `regenerated`/`skipped`, чтобы UI показал честный результат.
   */
  @Post(':id/translations/generate')
  async generateTranslations(
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body() dto: GenerateTranslationsDto,
    @CurrentUser() viewer: AuthenticatedUser,
  ): Promise<GenerateTranslationsResponse> {
    let result: GenerateTranslationsResult;
    try {
      result = await this.translator.generateTranslations(listingId, {
        force: dto.force,
      });
    } catch (error) {
      // Сбой внешнего провайдера перевода (Yandex 4xx/5xx) → 502, строки
      // неудачных языков не меняются (ADR-0091, спека §7). Причину логируем и
      // отдаём модератору: HttpException глобальный фильтр не логирует, и без
      // этого истёкший/неверный ключ неотличим от любого другого сбоя.
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Translation generation failed for listing ${listingId}: ${reason}`,
      );
      throw new BadGatewayException({
        code: ApiErrorCode.INTERNAL_ERROR,
        message: `Translation provider failed: ${reason}`,
      });
    }
    // Отсутствующий/DELETED листинг: generateTranslations молча выходит (пустой
    // result), а listByListing бросит 404 — единый путь not-found.
    const translations = await this.translations.listByListing(listingId, viewer);
    return { ...translations, ...result };
  }

  /**
   * `PATCH /api/v1/admin/listings/:id/original` — правка авторского оригинала:
   * текст + язык, на котором он написан (ADR-0156). Смена языка переносит текст в
   * правильный слот и очищает производные переводы; UI затем жмёт «Сгенерировать
   * переводы», и пустые языки заполняются из исправленного оригинала.
   */
  @Patch(':id/original')
  async updateOriginal(
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body() dto: UpdateOriginalListingDto,
    @CurrentUser() viewer: AuthenticatedUser,
  ): Promise<ListingTranslationsResponse> {
    const { original_language, ...text } = dto;
    await this.translations.updateOriginalTranslation(
      listingId,
      original_language,
      text,
    );
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
