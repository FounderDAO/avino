import {
  Currency,
  Language,
  ListingStatus,
  PromotionType,
  PropertyType,
  TransactionType,
  TranslationSource,
} from '@prisma/client';
import { DistrictsService } from '../geo';
import { PrismaService } from '../prisma';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
import { SearchService } from './search.service';

const uploadsStub = {
  resolveMediaUrl: async (_k: string | null | undefined, url: string) => url,
} as unknown as UploadsService;

/**
 * Integration-тест SearchService.priceDistribution на живом PostgreSQL.
 *
 * priceDistribution — ГЛОБАЛЬНЫЙ запрос (без фильтра по городу), поэтому
 * изолировать выборку по cityId, как в search.service.int-spec, нельзя. Тест
 * НЕ удаляет чужие/seed-данные: проверяет инвариант, устойчивый к любому
 * содержимому БД — сумма бакетов + overflow равна числу видимых (currency, tx)
 * объявлений. Детерминированная логика (пустой путь, построение бакетов,
 * niceCeil, overflow) покрыта unit-ом search.service.distribution.spec.ts.
 */
describe('SearchService.priceDistribution (integration, live PostgreSQL)', () => {
  const prisma = new PrismaService();
  const service = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

  // Уникальный город — только для очистки СВОИХ строк в afterAll.
  const CITY_ID = '11111111-2222-4333-8444-666666666666';
  let ownerId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { phone: '+99890' + Date.now().toString().slice(-7) },
    });
    ownerId = owner.id;
    // 10 известных USD/SALE-объявлений (10k..100k) ПОВЕРХ любых seed-данных.
    for (let i = 1; i <= 10; i++) {
      await prisma.listing.create({
        data: {
          ownerId,
          transactionType: TransactionType.SALE,
          propertyType: PropertyType.APARTMENT,
          status: ListingStatus.ACTIVE,
          originalLanguage: Language.RU,
          price: `${i * 10000}.00`,
          currency: Currency.USD,
          cityId: CITY_ID,
          promotionType: PromotionType.NORMAL,
          translations: {
            create: [
              { language: Language.RU, title: 'd', source: TranslationSource.USER },
            ],
          },
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it('инвариант: сумма бакетов + overflow = числу видимых (USD, SALE); недеструктивно', async () => {
    const liveTotal = await prisma.listing.count({
      where: {
        status: ListingStatus.ACTIVE,
        currency: Currency.USD,
        transactionType: TransactionType.SALE,
      },
    });

    const res = await service.priceDistribution({
      currency: Currency.USD,
      transaction_type: TransactionType.SALE,
    });

    expect(res.currency).toBe('USD');
    expect(res.transaction_type).toBe('SALE');
    expect(res.min).toBe(0);
    expect(res.max).toBeGreaterThan(0);
    expect(res.buckets.length).toBe(30);

    const summed = res.buckets.reduce((s, b) => s + b.count, 0) + res.overflow_count;
    expect(summed).toBe(liveTotal);
    expect(liveTotal).toBeGreaterThanOrEqual(10); // как минимум наши 10 строк
  });
});
