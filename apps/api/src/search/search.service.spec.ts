import { HttpException } from '@nestjs/common';
import {
  Currency,
  Language,
  ListingStatus,
  Prisma,
  PromotionType,
  PropertyType,
  TransactionType,
} from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { TranslationsService } from '../translations';
import { SearchService } from './search.service';

/**
 * Юнит-тесты SearchService (TASK-080). Prisma мокается — проверяются: фильтр
 * `status = ACTIVE` + базовые фильтры, диапазон цены в пределах валюты, keyset-
 * пагинация (take limit+1, next_cursor), time-guarded `effective_tier`, snake_case
 * карточка и 400 на повреждённый cursor.
 */
describe('SearchService', () => {
  const CITY_ID = '22222222-2222-2222-2222-222222222222';
  const DISTRICT_ID = '33333333-3333-3333-3333-333333333333';

  let prisma: any;
  let service: SearchService;

  function dbRow(over: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'l1',
      status: ListingStatus.ACTIVE,
      transactionType: TransactionType.SALE,
      propertyType: PropertyType.APARTMENT,
      price: new Prisma.Decimal('950000000.00'),
      currency: Currency.UZS,
      rooms: 3,
      cityId: CITY_ID,
      districtId: DISTRICT_ID,
      latitude: new Prisma.Decimal('41.311111'),
      longitude: new Prisma.Decimal('69.281111'),
      promotionType: PromotionType.NORMAL,
      promotionExpiresAt: null,
      originalLanguage: Language.RU,
      createdAt: new Date('2026-06-01T12:00:00.000Z'),
      translations: [{ language: Language.RU, title: '3-комн в центре' }],
      media: [{ url: 'https://cdn/l1.webp', thumbnailUrl: 'https://cdn/l1_t.webp' }],
      ...over,
    };
  }

  beforeEach(() => {
    prisma = {
      listing: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    service = new SearchService(prisma, new TranslationsService(prisma));
  });

  async function expectCode(promise: Promise<unknown>, code: ApiErrorCode) {
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    try {
      await promise;
    } catch (e) {
      const res = (e as HttpException).getResponse() as { code: string };
      expect(res.code).toBe(code);
    }
  }

  it('always restricts to ACTIVE and maps the snake_case card', async () => {
    prisma.listing.findMany.mockResolvedValue([dbRow()]);
    prisma.listing.count.mockResolvedValue(1);

    const result = await service.search({});

    const where = prisma.listing.findMany.mock.calls[0][0].where;
    expect(where.status).toBe(ListingStatus.ACTIVE);
    expect(prisma.listing.findMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
    expect(result.data[0]).toEqual({
      id: 'l1',
      status: ListingStatus.ACTIVE,
      transaction_type: TransactionType.SALE,
      property_type: PropertyType.APARTMENT,
      price: '950000000.00',
      currency: Currency.UZS,
      rooms: 3,
      city_id: CITY_ID,
      district_id: DISTRICT_ID,
      latitude: '41.311111',
      longitude: '69.281111',
      promotion_type: PromotionType.NORMAL,
      promotion_expires_at: null,
      effective_tier: PromotionType.NORMAL,
      language: Language.RU,
      title: '3-комн в центре',
      thumbnail_url: 'https://cdn/l1_t.webp',
      created_at: '2026-06-01T12:00:00.000Z',
    });
    expect(result.meta).toEqual({ limit: 20, total: 1, next_cursor: null });
  });

  it('builds basic filters and a currency-scoped price range', async () => {
    await service.search({
      transaction_type: TransactionType.RENT,
      property_type: PropertyType.HOUSE,
      price_min: '1000.00',
      price_max: '5000.00',
      currency: Currency.USD,
      city_id: CITY_ID,
      district_id: DISTRICT_ID,
    });

    const where = prisma.listing.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      status: ListingStatus.ACTIVE,
      transactionType: TransactionType.RENT,
      propertyType: PropertyType.HOUSE,
      currency: Currency.USD,
      cityId: CITY_ID,
      districtId: DISTRICT_ID,
      price: { gte: '1000.00', lte: '5000.00' },
    });
  });

  it('treats an expired promotion as NORMAL but keeps an active one', async () => {
    prisma.listing.findMany.mockResolvedValue([
      dbRow({
        id: 'expired',
        promotionType: PromotionType.VIP,
        promotionExpiresAt: new Date('2000-01-01T00:00:00.000Z'),
      }),
      dbRow({
        id: 'active',
        promotionType: PromotionType.TOP,
        promotionExpiresAt: new Date('2999-01-01T00:00:00.000Z'),
      }),
    ]);

    const result = await service.search({});

    expect(result.data[0].effective_tier).toBe(PromotionType.NORMAL);
    expect(result.data[1].effective_tier).toBe(PromotionType.TOP);
  });

  it('emits next_cursor only when an extra row exists and applies keyset on the next page', async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      dbRow({ id: `l${i}`, createdAt: new Date(`2026-06-0${i + 1}T00:00:00.000Z`) }),
    );
    prisma.listing.findMany.mockResolvedValue(rows); // limit 2 → take 3, hasMore
    prisma.listing.count.mockResolvedValue(9);

    const first = await service.search({ limit: 2 });
    expect(first.data).toHaveLength(2);
    expect(prisma.listing.findMany.mock.calls[0][0].take).toBe(3);
    expect(first.meta).toMatchObject({ limit: 2, total: 9 });
    expect(first.meta.next_cursor).toBeTruthy();

    prisma.listing.findMany.mockResolvedValue([]);
    await service.search({ cursor: first.meta.next_cursor as string });
    const nextWhere = prisma.listing.findMany.mock.calls[1][0].where;
    expect(nextWhere.OR).toHaveLength(2);
    // Курсор указывает на 2-й элемент (l1, 2026-06-02) — последний на странице.
    expect(nextWhere.OR[0].createdAt.lt).toEqual(new Date('2026-06-02T00:00:00.000Z'));
    expect(nextWhere.OR[1].id.lt).toBe('l1');
  });

  it('rejects a malformed cursor with VALIDATION_ERROR', async () => {
    await expectCode(
      service.search({ cursor: 'not-a-valid-token' }),
      ApiErrorCode.VALIDATION_ERROR,
    );
  });
});
