import {
  Currency,
  ExchangeRateSource,
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

  it('инвариант: сумма бакетов + overflow = числу учтённых (SALE); недеструктивно', async () => {
    // FX-путь (есть курс) считает ОБЕ валюты; без курса — только USD. Тест
    // устойчив к обоим (и к параллельным спекам, трогающим глобальный курс).
    const usdTotal = await prisma.listing.count({
      where: {
        status: ListingStatus.ACTIVE,
        currency: Currency.USD,
        transactionType: TransactionType.SALE,
      },
    });
    const allTotal = await prisma.listing.count({
      where: {
        status: ListingStatus.ACTIVE,
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
    // Сумма равна числу учтённых строк на активном пути (USD-only или все валюты).
    expect([usdTotal, allTotal]).toContain(summed);
    expect(usdTotal).toBeGreaterThanOrEqual(10); // как минимум наши 10 строк
  });
});

/**
 * FX-гистограмма (integration): при наличии курса распределение учитывает ОБЕ
 * валюты, приводя цену к валюте запроса — иначе UZS-объявления, показанные юзеру
 * как «≈ $X», не попадали бы в гистограмму под слайдером.
 */
describe('SearchService.priceDistribution FX (integration, live PostgreSQL)', () => {
  const prisma = new PrismaService();
  const service = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

  const CITY_ID = '11111111-2222-4333-8444-777777777777';
  let ownerId: string;
  let rateId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { phone: '+99891' + Date.now().toString().slice(-7) },
    });
    ownerId = owner.id;
    // Свежайший курс — гарантированно выбирается fxRate() (FX-путь активен).
    const rate = await prisma.exchangeRate.create({
      data: {
        base: Currency.USD,
        quote: Currency.UZS,
        rate: '12000',
        source: ExchangeRateSource.MANUAL,
        fetchedAt: new Date('2099-06-01T00:00:00.000Z'),
      },
    });
    rateId = rate.id;
    // Один USD и один эквивалентный UZS листинг (600M UZS ≈ 50k USD), оба SALE.
    for (const [price, currency] of [
      ['50000.00', Currency.USD],
      ['600000000.00', Currency.UZS],
    ] as const) {
      await prisma.listing.create({
        data: {
          ownerId,
          transactionType: TransactionType.SALE,
          propertyType: PropertyType.APARTMENT,
          status: ListingStatus.ACTIVE,
          originalLanguage: Language.RU,
          price,
          currency,
          cityId: CITY_ID,
          promotionType: PromotionType.NORMAL,
          translations: {
            create: [
              { language: Language.RU, title: 'fx', source: TranslationSource.USER },
            ],
          },
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });
    if (rateId) await prisma.exchangeRate.delete({ where: { id: rateId } });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it('учитывает объявления обеих валют (сумма = всем SALE, включая UZS)', async () => {
    const usdTotal = await prisma.listing.count({
      where: {
        status: ListingStatus.ACTIVE,
        currency: Currency.USD,
        transactionType: TransactionType.SALE,
      },
    });
    const allTotal = await prisma.listing.count({
      where: {
        status: ListingStatus.ACTIVE,
        transactionType: TransactionType.SALE,
      },
    });

    const res = await service.priceDistribution({
      currency: Currency.USD,
      transaction_type: TransactionType.SALE,
    });

    const summed =
      res.buckets.reduce((s, b) => s + b.count, 0) + res.overflow_count;
    // Курс есть → учтены ОБЕ валюты: сумма = всем SALE, а не только USD.
    expect(summed).toBe(allTotal);
    // Мы засеяли UZS-строку → всего строго больше, чем только USD.
    expect(allTotal).toBeGreaterThan(usdTotal);
  });
});
