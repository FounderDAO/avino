import { NotFoundException } from '@nestjs/common';
import { Currency, PromotionType } from '@prisma/client';
import { AdminPromotionPlansService } from './admin-promotion-plans.service';

describe('AdminPromotionPlansService', () => {
  const prisma = {
    promotionPlan: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: AdminPromotionPlansService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(async (cb: never) =>
      (cb as (t: typeof prisma) => unknown)(prisma),
    );
    service = new AdminPromotionPlansService(prisma as never);
  });

  it('updatePlan writes new price and an audit log with old→new', async () => {
    const existing = {
      id: 'p1', type: PromotionType.TOP, periodDays: 7,
      price: { toFixed: () => '50000.00' }, currency: Currency.UZS, isActive: true,
    };
    prisma.promotionPlan.findUnique.mockResolvedValue(existing);
    prisma.promotionPlan.update.mockResolvedValue({
      ...existing, price: { toFixed: () => '60000.00' },
    });

    await service.updatePlan('admin1', 'p1', { price: '60000.00' });

    expect(prisma.promotionPlan.update).toHaveBeenCalledWith({
      where: { id: 'p1' }, data: { price: '60000.00' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'PROMOTION_PLAN_UPDATE',
          entityType: 'promotion_plan',
          entityId: 'p1',
          metadata: expect.objectContaining({ old_price: '50000.00', new_price: '60000.00' }),
        }),
      }),
    );
  });

  it('updatePlan throws 404 for unknown id', async () => {
    prisma.promotionPlan.findUnique.mockResolvedValue(null);
    await expect(service.updatePlan('a', 'nope', { price: '1.00' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
