import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { AdminPromotionsService, PromotionResponse } from '../promotions';
import { CancelPromotionDto } from '../promotions/dto/cancel-promotion.dto';
import { ExtendPromotionDto } from '../promotions/dto/extend-promotion.dto';

/**
 * AdminListingPromotionsController — управление существующей промо: отмена и
 * продление (TASK-122, API.md §15). Ключ роутов — `id` самой промо-строки
 * (`/admin/listing-promotions/:id`), в отличие от активации/истории, которые
 * адресуются по листингу (`/admin/listings/:id/promotions`).
 *
 * Монетизация → только ADMIN (API.md §15; `MODERATOR` сюда не входит).
 * `JwtAuthGuard` + `RolesGuard` на классе. Версионирование URI обязательно
 * (CLAUDE.md §14); префикс `api` ставит main.ts → `/api/v1/admin/...`.
 */
@Controller({ path: 'admin/listing-promotions', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminListingPromotionsController {
  constructor(
    private readonly adminPromotionsService: AdminPromotionsService,
  ) {}

  /**
   * `PATCH /api/v1/admin/listing-promotions/:id/cancel` — отменить промо.
   * 200 → обновлённая строка ledger'а (`status = CANCELLED`).
   */
  @Patch(':id/cancel')
  cancel(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) promotionId: string,
    @Body() dto: CancelPromotionDto,
  ): Promise<PromotionResponse> {
    return this.adminPromotionsService.cancel(adminId, promotionId, dto);
  }

  /**
   * `PATCH /api/v1/admin/listing-promotions/:id/extend` — продлить промо.
   * 200 → обновлённая строка ledger'а (новый `expires_at`).
   */
  @Patch(':id/extend')
  extend(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) promotionId: string,
    @Body() dto: ExtendPromotionDto,
  ): Promise<PromotionResponse> {
    return this.adminPromotionsService.extend(adminId, promotionId, dto);
  }
}
