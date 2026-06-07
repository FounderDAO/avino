import { Currency, PromotionType } from '@prisma/client';
import { PromotionPlansService } from './promotion-plans.service';

function makePlan(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'p1',
    type: PromotionType.TOP,
    periodDays: 7,
    price: { toFixed: () => '50000.00' },
    currency: Currency.UZS,
    isActive: true,
    ...over,
  };
}

describe('PromotionPlansService', () => {
  const prisma = { promotionPlan: { findMany: jest.fn(), findFirst: jest.fn() } };
  let service: PromotionPlansService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new PromotionPlansService(prisma as never);
  });

  it('listPlans({activeOnly:true}) filters by isActive', async () => {
    prisma.promotionPlan.findMany.mockResolvedValue([makePlan()]);
    const plans = await service.listPlans({ activeOnly: true });
    expect(prisma.promotionPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].price).toBe('50000.00');
    expect(plans[0].period_days).toBe(7);
  });

  it('findPlan returns active plan, null when inactive/missing', async () => {
    prisma.promotionPlan.findFirst.mockResolvedValue(makePlan());
    const hit = await service.findPlan(PromotionType.TOP, 7);
    expect(prisma.promotionPlan.findFirst).toHaveBeenCalledWith({
      where: { type: PromotionType.TOP, periodDays: 7, isActive: true },
    });
    expect(hit?.price).toBe('50000.00');

    prisma.promotionPlan.findFirst.mockResolvedValue(null);
    expect(await service.findPlan(PromotionType.VIP, 99)).toBeNull();
  });
});
