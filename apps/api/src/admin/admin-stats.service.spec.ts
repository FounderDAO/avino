import { ComplaintStatus, ListingStatus, PromotionStatus } from '@prisma/client';
import { AdminStatsService } from './admin-stats.service';

/**
 * Юнит-тесты AdminStatsService (ADMIN-15, API.md §16). Prisma мокается —
 * проверяются where-фильтры каждого COUNT и snake_case маппинг ответа.
 */
describe('AdminStatsService', () => {
  let prisma: any;
  let service: AdminStatsService;

  beforeEach(() => {
    prisma = {
      listing: { count: jest.fn() },
      complaint: { count: jest.fn() },
      user: { count: jest.fn() },
      listingPromotion: { count: jest.fn() },
    };
    service = new AdminStatsService(prisma);
  });

  it('counts each metric with the right filter and maps to snake_case', async () => {
    prisma.listing.count.mockResolvedValue(12);
    prisma.complaint.count.mockResolvedValue(3);
    prisma.user.count.mockResolvedValue(148);
    prisma.listingPromotion.count.mockResolvedValue(5);

    const result = await service.getStats();

    expect(result).toEqual({
      listings_new: 12,
      complaints_new: 3,
      users_total: 148,
      promotions_active: 5,
    });

    expect(prisma.listing.count).toHaveBeenCalledWith({
      where: { status: ListingStatus.NEW },
    });
    expect(prisma.complaint.count).toHaveBeenCalledWith({
      where: { status: ComplaintStatus.NEW },
    });
    // users_total — все пользователи, без where (как meta.total в /admin/users).
    expect(prisma.user.count).toHaveBeenCalledWith();
    expect(prisma.listingPromotion.count).toHaveBeenCalledWith({
      where: { status: PromotionStatus.ACTIVE },
    });
  });

  it('returns zeros when nothing matches', async () => {
    prisma.listing.count.mockResolvedValue(0);
    prisma.complaint.count.mockResolvedValue(0);
    prisma.user.count.mockResolvedValue(0);
    prisma.listingPromotion.count.mockResolvedValue(0);

    await expect(service.getStats()).resolves.toEqual({
      listings_new: 0,
      complaints_new: 0,
      users_total: 0,
      promotions_active: 0,
    });
  });
});
