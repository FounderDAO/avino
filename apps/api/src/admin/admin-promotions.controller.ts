import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { AdminPromotionsService, PromotionResponse } from '../promotions';
import { ActivatePromotionDto } from '../promotions/dto/activate-promotion.dto';

/**
 * AdminPromotionsController — ручная активация и история промо VIP/TOP
 * (TASK-121, API.md §15). Монетизация → только ADMIN (API.md §15;
 * `MODERATOR` сюда не входит, в отличие от очереди модерации). `JwtAuthGuard` +
 * `RolesGuard` на классе. Версионирование URI обязательно (CLAUDE.md §14);
 * префикс `api` ставит main.ts → `/api/v1/admin/...`.
 */
@Controller({ path: 'admin/listings', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPromotionsController {
  constructor(
    private readonly adminPromotionsService: AdminPromotionsService,
  ) {}

  /** `GET /api/v1/admin/listings/:id/promotions` — история промо листинга. */
  @Get(':id/promotions')
  history(
    @Param('id', ParseUUIDPipe) listingId: string,
  ): Promise<PromotionResponse[]> {
    return this.adminPromotionsService.listHistory(listingId);
  }

  /**
   * `POST /api/v1/admin/listings/:id/promotions` — активировать VIP/TOP вручную.
   * Идемпотентно по заголовку `Idempotency-Key` (API.md §24); ответ — 201 с
   * созданной (или, при повторе, ранее созданной) строкой ledger'а.
   */
  @Post(':id/promotions')
  @HttpCode(HttpStatus.CREATED)
  activate(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body() dto: ActivatePromotionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PromotionResponse> {
    return this.adminPromotionsService.activate(
      adminId,
      listingId,
      dto,
      idempotencyKey,
    );
  }
}
