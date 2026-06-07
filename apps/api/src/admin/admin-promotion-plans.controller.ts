import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { AdminPromotionPlansService } from './admin-promotion-plans.service';
import { UpdatePromotionPlanDto } from './dto/update-promotion-plan.dto';

/**
 * AdminPromotionPlansController — редактирование тарифной матрицы VIP/TOP
 * (цена + isActive). Только ADMIN. `/api/v1/admin/promotion-plans`.
 */
@Controller({ path: 'admin/promotion-plans', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPromotionPlansController {
  constructor(private readonly service: AdminPromotionPlansService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Patch(':id')
  update(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromotionPlanDto,
  ) {
    return this.service.updatePlan(adminId, id, dto);
  }
}
