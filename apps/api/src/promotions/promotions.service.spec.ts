import { Currency, PromotionType } from '@prisma/client';
import { PromotionsService } from './promotions.service';

describe('PromotionsService', () => {
  const plansSvc = { listPlans: jest.fn() };
  let service: PromotionsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new PromotionsService(plansSvc as never);
  });

  it('returns only active plans from PromotionPlansService', async () => {
    plansSvc.listPlans.mockResolvedValue([
      { type: PromotionType.TOP, period_days: 7, price: '50000.00', currency: Currency.UZS },
    ]);
    const { plans } = await service.getPlans();
    expect(plansSvc.listPlans).toHaveBeenCalledWith({ activeOnly: true });
    expect(plans).toHaveLength(1);
  });
});
