import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { PaginatedResponse } from '../moderation';
import {
  AdminPromotionRow,
  AdminPromotionsOverviewService,
  AdminPromotionsSummaryResponse,
} from './admin-promotions-overview.service';
import { ListAdminPromotionsQueryDto } from './dto/list-admin-promotions.dto';

/**
 * AdminPromotionsOverviewController — глобальная история и сводка промо
 * (ADMIN-16). Монетизация → только ADMIN (API.md §15, как активация/cancel/
 * extend; `MODERATOR` сюда не входит). `JwtAuthGuard` + `RolesGuard` на классе;
 * версионирование URI обязательно (CLAUDE.md §14) → `/api/v1/admin/promotions`.
 */
@Controller({ path: 'admin/promotions', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPromotionsOverviewController {
  constructor(private readonly service: AdminPromotionsOverviewService) {}

  /** `GET /api/v1/admin/promotions` — история промо (фильтры `status`/`type`). */
  @Get()
  list(
    @Query() query: ListAdminPromotionsQueryDto,
  ): Promise<PaginatedResponse<AdminPromotionRow>> {
    return this.service.list(query);
  }

  /** `GET /api/v1/admin/promotions/summary` — активные и выручка (месяц/всего). */
  @Get('summary')
  summary(): Promise<AdminPromotionsSummaryResponse> {
    return this.service.summary();
  }
}
