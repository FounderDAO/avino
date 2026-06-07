import { Injectable } from '@nestjs/common';
import { Currency, PromotionType } from '@prisma/client';
import { PrismaService } from '../prisma';

/** Публичная форма плана (snake_case, Decimal как строка) — контракт API.md §15. */
export interface PromotionPlanView {
  type: PromotionType;
  period_days: number;
  price: string;
  currency: Currency;
}

/**
 * PromotionPlansService — каталог промо-планов из БД (`promotion_plans`).
 * Заменяет статический PROMOTION_PLANS: цена редактируема админом, поэтому
 * единственный источник истины — таблица. `findPlan` отдаёт только активный план
 * (неактивный = нельзя купить новую промо этой комбинации).
 */
@Injectable()
export class PromotionPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans({ activeOnly }: { activeOnly: boolean }): Promise<PromotionPlanView[]> {
    const rows = await this.prisma.promotionPlan.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ type: 'asc' }, { periodDays: 'asc' }],
    });
    return rows.map((r) => ({
      type: r.type,
      period_days: r.periodDays,
      price: r.price.toFixed(2),
      currency: r.currency,
    }));
  }

  async findPlan(type: PromotionType, periodDays: number): Promise<PromotionPlanView | null> {
    const r = await this.prisma.promotionPlan.findFirst({
      where: { type, periodDays, isActive: true },
    });
    if (!r) return null;
    return { type: r.type, period_days: r.periodDays, price: r.price.toFixed(2), currency: r.currency };
  }
}
