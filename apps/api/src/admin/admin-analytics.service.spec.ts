import { ListingStatus, ModerationAction, TransactionType } from '@prisma/client';
import { AdminAnalyticsService } from './admin-analytics.service';

/**
 * Юнит-тесты AdminAnalyticsService (ADMIN-15+, API.md §16). Prisma мокается:
 * проверяются проброс помесячного ряда, where-фильтры buy/rent, джойн имён
 * районов с сохранением порядка topN и маппинг ленты действий (заголовок на
 * исходном языке, фолбэки имени модератора, null-связи).
 */
describe('AdminAnalyticsService', () => {
  let prisma: any;
  let service: AdminAnalyticsService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      listing: { count: jest.fn(), groupBy: jest.fn() },
      district: { findMany: jest.fn() },
      moderationLog: { findMany: jest.fn() },
    };
    // Дефолты «пусто», чтобы каждый тест переопределял только своё.
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.listing.count.mockResolvedValue(0);
    prisma.listing.groupBy.mockResolvedValue([]);
    prisma.district.findMany.mockResolvedValue([]);
    prisma.moderationLog.findMany.mockResolvedValue([]);
    service = new AdminAnalyticsService(prisma);
  });

  it('maps the monthly series through (coercing count to number)', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { month: '2025-07', count: 5 },
      { month: '2025-08', count: 0 },
    ]);

    const { listings_over_time } = await service.getAnalytics();

    expect(listings_over_time).toEqual([
      { month: '2025-07', count: 5 },
      { month: '2025-08', count: 0 },
    ]);
  });

  it('counts buy/rent excluding DELETED', async () => {
    prisma.listing.count
      .mockResolvedValueOnce(64) // SALE
      .mockResolvedValueOnce(36); // RENT

    const { buy_rent } = await service.getAnalytics();

    expect(buy_rent).toEqual({ buy: 64, rent: 36 });
    expect(prisma.listing.count).toHaveBeenCalledWith({
      where: {
        transactionType: TransactionType.SALE,
        status: { not: ListingStatus.DELETED },
      },
    });
    expect(prisma.listing.count).toHaveBeenCalledWith({
      where: {
        transactionType: TransactionType.RENT,
        status: { not: ListingStatus.DELETED },
      },
    });
  });

  it('joins district names and preserves the groupBy (count desc) order', async () => {
    prisma.listing.groupBy.mockResolvedValue([
      { districtId: 'd-2', _count: { _all: 21 } },
      { districtId: 'd-1', _count: { _all: 18 } },
    ]);
    // findMany может вернуть в любом порядке — сервис обязан восстановить порядок topN.
    prisma.district.findMany.mockResolvedValue([
      { id: 'd-1', nameRu: 'Юнусабад', nameUz: 'Yunusobod', nameEn: 'Yunusabad' },
      { id: 'd-2', nameRu: 'Чиланзар', nameUz: 'Chilonzor', nameEn: 'Chilanzar' },
    ]);

    const { by_district } = await service.getAnalytics();

    expect(by_district).toEqual([
      { district_id: 'd-2', name_ru: 'Чиланзар', name_uz: 'Chilonzor', name_en: 'Chilanzar', count: 21 },
      { district_id: 'd-1', name_ru: 'Юнусабад', name_uz: 'Yunusobod', name_en: 'Yunusabad', count: 18 },
    ]);
    expect(prisma.listing.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['districtId'],
        where: {
          districtId: { not: null },
          status: { not: ListingStatus.DELETED },
        },
        take: 6,
      }),
    );
  });

  it('skips a grouped district that has no reference row (no null name leaks)', async () => {
    prisma.listing.groupBy.mockResolvedValue([
      { districtId: 'd-1', _count: { _all: 10 } },
      { districtId: 'ghost', _count: { _all: 7 } },
    ]);
    prisma.district.findMany.mockResolvedValue([
      { id: 'd-1', nameRu: 'Юнусабад', nameUz: 'Yunusobod', nameEn: 'Yunusabad' },
    ]);

    const { by_district } = await service.getAnalytics();

    expect(by_district).toEqual([
      { district_id: 'd-1', name_ru: 'Юнусабад', name_uz: 'Yunusobod', name_en: 'Yunusabad', count: 10 },
    ]);
  });

  it('builds recent activity: original-language title + moderator display name', async () => {
    prisma.moderationLog.findMany.mockResolvedValue([
      {
        id: 'log-1',
        action: ModerationAction.APPROVE,
        newStatus: ListingStatus.ACTIVE,
        listingId: 'lst-1',
        createdAt: new Date('2026-06-20T10:00:00.000Z'),
        listing: {
          originalLanguage: 'RU',
          translations: [
            { language: 'EN', title: 'Apartment' },
            { language: 'RU', title: '2-комн квартира' },
          ],
        },
        moderator: {
          email: 'mod@avino.uz',
          profile: { displayName: 'Алишер У.', firstName: 'Алишер', lastName: 'У.' },
        },
      },
    ]);

    const { recent_activity } = await service.getAnalytics();

    expect(recent_activity).toEqual([
      {
        id: 'log-1',
        action: ModerationAction.APPROVE,
        new_status: ListingStatus.ACTIVE,
        listing_id: 'lst-1',
        listing_title: '2-комн квартира',
        moderator_name: 'Алишер У.',
        created_at: '2026-06-20T10:00:00.000Z',
      },
    ]);
  });

  it('falls back to email then null when the moderator profile/account is missing', async () => {
    prisma.moderationLog.findMany.mockResolvedValue([
      {
        id: 'log-2',
        action: ModerationAction.REJECT,
        newStatus: ListingStatus.REJECTED,
        listingId: 'lst-2',
        createdAt: new Date('2026-06-19T09:00:00.000Z'),
        listing: null,
        moderator: { email: 'mod2@avino.uz', profile: null },
      },
      {
        id: 'log-3',
        action: ModerationAction.DELETE,
        newStatus: ListingStatus.DELETED,
        listingId: 'lst-3',
        createdAt: new Date('2026-06-18T09:00:00.000Z'),
        listing: null,
        moderator: null,
      },
    ]);

    const { recent_activity } = await service.getAnalytics();

    expect(recent_activity[0]).toMatchObject({
      listing_title: null,
      moderator_name: 'mod2@avino.uz',
    });
    expect(recent_activity[1]).toMatchObject({
      listing_title: null,
      moderator_name: null,
    });
  });
});
