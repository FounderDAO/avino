import { Injectable, NotFoundException } from '@nestjs/common';
import { PromotionPlan } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { UpdatePromotionPlanDto } from './dto/update-promotion-plan.dto';

export interface AdminPromotionPlanView {
  id: string;
  type: string;
  period_days: number;
  price: string;
  currency: string;
  isActive: boolean;
}

@Injectable()
export class AdminPromotionPlansService {
  constructor(private readonly prisma: PrismaService) {}

  /** Все планы (включая неактивные) для админ-таблицы. */
  async list(): Promise<AdminPromotionPlanView[]> {
    const rows = await this.prisma.promotionPlan.findMany({
      orderBy: [{ type: 'asc' }, { periodDays: 'asc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  async updatePlan(
    adminId: string,
    id: string,
    dto: UpdatePromotionPlanDto,
  ): Promise<AdminPromotionPlanView> {
    const existing = await this.prisma.promotionPlan.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ code: ApiErrorCode.NOT_FOUND, message: 'Plan not found' });
    }
    const data: { price?: string; isActive?: boolean } = {};
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.promotionPlan.update({ where: { id }, data });
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'PROMOTION_PLAN_UPDATE',
          entityType: 'promotion_plan',
          entityId: id,
          metadata: {
            old_price: existing.price.toFixed(2),
            new_price: updated.price.toFixed(2),
            old_is_active: existing.isActive,
            new_is_active: updated.isActive,
          },
        },
      });
      return this.toView(updated);
    });
  }

  private toView(r: PromotionPlan): AdminPromotionPlanView {
    return {
      id: r.id,
      type: r.type,
      period_days: r.periodDays,
      price: r.price.toFixed(2),
      currency: r.currency,
      isActive: r.isActive,
    };
  }
}
