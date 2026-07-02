import { Prisma, PromotionStatus, PromotionType } from '@prisma/client';
import { AdminPromotionsOverviewService } from './admin-promotions-overview.service';

/**
 * Юнит-тесты AdminPromotionsOverviewService (ADMIN-16, API.md §15/§16).
 * Prisma мокается — проверяются where-фильтры, пагинация, выбор title на
 * `original_language` и snake_case/Decimal-строка маппинг ответов.
 */
describe('AdminPromotionsOverviewService', () => {
  let prisma: any;
  let service: AdminPromotionsOverviewService;

  beforeEach(() => {
    prisma = {
      listingPromotion: {
        findMany: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
      },
    };
    service = new AdminPromotionsOverviewService(prisma);
  });

  describe('list', () => {
    const row = {
      id: 'promo-1',
      listingId: 'listing-1',
      userId: 'admin-1',
      type: PromotionType.VIP,
      status: PromotionStatus.ACTIVE,
      periodDays: 30,
      price: new Prisma.Decimal('350000'),
      currency: 'UZS',
      startsAt: new Date('2026-06-01T00:00:00.000Z'),
      expiresAt: new Date('2026-07-01T00:00:00.000Z'),
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      listing: {
        originalLanguage: 'RU',
        translations: [
          { language: 'UZ', title: 'UZ sarlavha' },
          { language: 'RU', title: 'Просторная 3-комнатная' },
        ],
      },
    };

    it('maps ledger rows to snake_case with title on original_language', async () => {
      prisma.listingPromotion.findMany.mockResolvedValue([row]);
      prisma.listingPromotion.count.mockResolvedValue(1);

      const result = await service.list({});

      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
      expect(result.data).toEqual([
        {
          id: 'promo-1',
          listing_id: 'listing-1',
          listing_title: 'Просторная 3-комнатная',
          user_id: 'admin-1',
          type: PromotionType.VIP,
          status: PromotionStatus.ACTIVE,
          period_days: 30,
          price: '350000',
          currency: 'UZS',
          starts_at: '2026-06-01T00:00:00.000Z',
          expires_at: '2026-07-01T00:00:00.000Z',
          created_at: '2026-06-01T00:00:00.000Z',
        },
      ]);

      // Детерминированная сортировка: created_at DESC, id DESC (как жалобы).
      expect(prisma.listingPromotion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: 0,
          take: 20,
        }),
      );
    });

    it('combines status/type filters and applies pagination', async () => {
      prisma.listingPromotion.findMany.mockResolvedValue([]);
      prisma.listingPromotion.count.mockResolvedValue(0);

      await service.list({
        status: PromotionStatus.EXPIRED,
        type: PromotionType.TOP,
        page: 3,
        limit: 10,
      });

      expect(prisma.listingPromotion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: PromotionStatus.EXPIRED, type: PromotionType.TOP },
          skip: 20,
          take: 10,
        }),
      );
      expect(prisma.listingPromotion.count).toHaveBeenCalledWith({
        where: { status: PromotionStatus.EXPIRED, type: PromotionType.TOP },
      });
    });

    it('falls back to empty title and null price/dates', async () => {
      prisma.listingPromotion.findMany.mockResolvedValue([
        {
          ...row,
          price: null,
          currency: null,
          startsAt: null,
          expiresAt: null,
          userId: null,
          listing: { originalLanguage: 'EN', translations: [] },
        },
      ]);
      prisma.listingPromotion.count.mockResolvedValue(1);

      const result = await service.list({});

      expect(result.data[0]).toMatchObject({
        listing_title: '',
        user_id: null,
        price: null,
        currency: null,
        starts_at: null,
        expires_at: null,
      });
    });
  });

  describe('summary', () => {
    it('counts active promos and sums started revenue (total + current month)', async () => {
      prisma.listingPromotion.count.mockResolvedValue(4);
      prisma.listingPromotion.aggregate
        .mockResolvedValueOnce({ _sum: { price: new Prisma.Decimal('140000') } })
        .mockResolvedValueOnce({ _sum: { price: new Prisma.Decimal('1050000') } });

      const result = await service.summary();

      expect(result).toEqual({
        active_count: 4,
        revenue_month: '140000',
        revenue_total: '1050000',
      });

      expect(prisma.listingPromotion.count).toHaveBeenCalledWith({
        where: { status: PromotionStatus.ACTIVE },
      });
      // Выручка «запущенных» промо: starts_at проставлен, REFUNDED/PENDING_PAYMENT
      // исключены (не запускались или деньги возвращены).
      const startedStatuses = {
        in: [
          PromotionStatus.ACTIVE,
          PromotionStatus.EXPIRED,
          PromotionStatus.CANCELLED,
        ],
      };
      expect(prisma.listingPromotion.aggregate).toHaveBeenNthCalledWith(1, {
        _sum: { price: true },
        where: {
          status: startedStatuses,
          startsAt: { not: null, gte: expect.any(Date) },
        },
      });
      expect(prisma.listingPromotion.aggregate).toHaveBeenNthCalledWith(2, {
        _sum: { price: true },
        where: { status: startedStatuses, startsAt: { not: null } },
      });
    });

    it('returns zero strings when the ledger is empty', async () => {
      prisma.listingPromotion.count.mockResolvedValue(0);
      prisma.listingPromotion.aggregate.mockResolvedValue({ _sum: { price: null } });

      await expect(service.summary()).resolves.toEqual({
        active_count: 0,
        revenue_month: '0',
        revenue_total: '0',
      });
    });
  });
});
