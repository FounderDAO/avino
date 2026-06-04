import {
  Currency,
  Language,
  ListingStatus,
  PromotionType,
  PropertyType,
  TransactionType,
  TranslationSource,
} from '@prisma/client';
import { PrismaService } from '../prisma';
import { TranslationsService } from '../translations';
import { SearchService } from './search.service';

/**
 * Integration-тесты SearchService на живом PostgreSQL (TASK-081). В отличие от
 * `search.service.spec.ts` (Prisma мокается, проверяется форма SQL), здесь
 * проверяется фактический результат `ORDER BY`: promotion-приоритетная
 * сортировка (`effective_tier DESC, created_at DESC, id DESC`), time-guarded
 * трактовка истёкшей промо как `NORMAL` и стабильность keyset-пагинации.
 *
 * Требует БД из `DATABASE_URL` с применёнными миграциями (см. jest.int.config.js).
 * Изоляция от прочих данных — уникальный `city_id`; данные удаляются в afterAll.
 */
describe('SearchService (integration, live PostgreSQL)', () => {
  const prisma = new PrismaService();
  const service = new SearchService(prisma, new TranslationsService(prisma));

  // Уникальный город этого прогона — фильтр изолирует выдачу от чужих строк.
  const CITY_ID = '11111111-2222-4333-8444-555555555555';

  // Фиксированные id для детерминированных проверок (включая tie-break по id DESC).
  const ID = {
    vip: 'aaaaaaaa-0000-4000-8000-000000000001',
    top: 'bbbbbbbb-0000-4000-8000-000000000001',
    expiredVip: 'cccccccc-0000-4000-8000-000000000001',
    normalNew: 'dddddddd-0000-4000-8000-000000000001',
    tieHi: 'ffffffff-0000-4000-8000-000000000002',
    tieLo: 'ffffffff-0000-4000-8000-000000000001',
  };

  // Ожидаемый полный порядок: тир ↓, затем created_at ↓, затем id ↓.
  // Истёкший VIP (expiredVip) проваливается в NORMAL-группу; tieHi/tieLo делят
  // created_at, поэтому решает id DESC (..02 раньше ..01).
  const EXPECTED_ORDER = [
    ID.vip,
    ID.top,
    ID.normalNew,
    ID.expiredVip,
    ID.tieHi,
    ID.tieLo,
  ];

  let ownerId: string;

  async function createListing(params: {
    id: string;
    promotionType: PromotionType;
    promotionExpiresAt: Date | null;
    createdAt: Date;
  }): Promise<void> {
    await prisma.listing.create({
      data: {
        id: params.id,
        ownerId,
        transactionType: TransactionType.SALE,
        propertyType: PropertyType.APARTMENT,
        status: ListingStatus.ACTIVE,
        originalLanguage: Language.RU,
        price: '100000.00',
        currency: Currency.UZS,
        cityId: CITY_ID,
        promotionType: params.promotionType,
        promotionExpiresAt: params.promotionExpiresAt,
        createdAt: params.createdAt,
        translations: {
          create: [
            {
              language: Language.RU,
              title: `listing-${params.id.slice(0, 8)}`,
              source: TranslationSource.USER,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    // Чистим возможные остатки прошлого прогона перед сидингом.
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });

    // users_contact_present_check требует наличия phone или email.
    const owner = await prisma.user.create({
      data: { phone: '+998900000081' },
    });
    ownerId = owner.id;

    const future = new Date('2027-01-01T00:00:00.000Z');
    const past = new Date('2020-01-01T00:00:00.000Z');

    await createListing({
      id: ID.vip,
      promotionType: PromotionType.VIP,
      promotionExpiresAt: future,
      createdAt: new Date('2026-05-10T00:00:00.000Z'),
    });
    await createListing({
      id: ID.top,
      promotionType: PromotionType.TOP,
      promotionExpiresAt: future,
      createdAt: new Date('2026-05-11T00:00:00.000Z'),
    });
    await createListing({
      id: ID.expiredVip,
      promotionType: PromotionType.VIP, // истёкший → трактуется как NORMAL
      promotionExpiresAt: past,
      createdAt: new Date('2026-05-12T00:00:00.000Z'),
    });
    await createListing({
      id: ID.normalNew,
      promotionType: PromotionType.NORMAL,
      promotionExpiresAt: null,
      createdAt: new Date('2026-05-13T00:00:00.000Z'),
    });
    // tieHi/tieLo — одинаковый created_at, решает финальный tie-break id DESC.
    await createListing({
      id: ID.tieHi,
      promotionType: PromotionType.NORMAL,
      promotionExpiresAt: null,
      createdAt: new Date('2026-05-09T00:00:00.000Z'),
    });
    await createListing({
      id: ID.tieLo,
      promotionType: PromotionType.NORMAL,
      promotionExpiresAt: null,
      createdAt: new Date('2026-05-09T00:00:00.000Z'),
    });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });
    if (ownerId) {
      await prisma.user.delete({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  });

  it('ranks VIP > TOP > NORMAL, treats an expired promotion as NORMAL, with stable tie-breakers', async () => {
    const result = await service.search({ city_id: CITY_ID, limit: 100 });

    expect(result.meta.total).toBe(EXPECTED_ORDER.length);
    expect(result.data.map((d) => d.id)).toEqual(EXPECTED_ORDER);

    const byId = new Map(result.data.map((d) => [d.id, d]));
    expect(byId.get(ID.vip)?.effective_tier).toBe(PromotionType.VIP);
    expect(byId.get(ID.top)?.effective_tier).toBe(PromotionType.TOP);
    // Истёкший VIP: в ответе сырой promotion_type сохранён, но effective_tier=NORMAL.
    expect(byId.get(ID.expiredVip)?.promotion_type).toBe(PromotionType.VIP);
    expect(byId.get(ID.expiredVip)?.effective_tier).toBe(PromotionType.NORMAL);
    expect(byId.get(ID.normalNew)?.effective_tier).toBe(PromotionType.NORMAL);
  });

  it('keeps the ranking order stable across keyset pages with no gaps or duplicates', async () => {
    const collected: string[] = [];
    let cursor: string | null | undefined;
    let pages = 0;

    do {
      const page = await service.search({
        city_id: CITY_ID,
        limit: 2,
        cursor: cursor ?? undefined,
      });
      collected.push(...page.data.map((d) => d.id));
      cursor = page.meta.next_cursor;
      pages += 1;
      expect(pages).toBeLessThanOrEqual(10); // защита от зацикливания
    } while (cursor);

    expect(pages).toBe(3); // 6 строк по 2 на страницу
    expect(collected).toEqual(EXPECTED_ORDER);
    expect(new Set(collected).size).toBe(EXPECTED_ORDER.length); // без дублей
  });
});
