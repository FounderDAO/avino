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

/**
 * Integration-тесты sort и rooms фильтров SearchService (TASK-207).
 * Проверяет: price_asc/price_desc/area_desc/date_desc сортировки с promotion
 * в приоритете; rooms=0..3 точное совпадение, rooms=4 => «4+»; keyset-стабильность
 * при sort=price_asc.
 *
 * Изоляция — отдельный `CITY_ID_207`; данные удаляются в afterAll.
 */
describe('SearchService sort + rooms (integration, TASK-207)', () => {
  const prisma = new PrismaService();
  const service = new SearchService(prisma, new TranslationsService(prisma));

  // Уникальный город для этого набора — не пересекается с тестами выше.
  const CITY_ID_207 = '22222222-3333-4444-8555-000000000207';

  const future = new Date('2027-01-01T00:00:00.000Z');

  // Фиксированные UUIDs; id вида ...-207 исключают коллизию с другими наборами.
  const ID = {
    vip:     'aaaaaaaa-0001-4000-8000-000000000207', // VIP, price=200, area=80,  rooms=2
    top:     'bbbbbbbb-0001-4000-8000-000000000207', // TOP, price=100, area=60,  rooms=1
    n1:      'cccccccc-0001-4000-8000-000000000207', // NORMAL, price=150, area=null, rooms=0
    n2:      'dddddddd-0001-4000-8000-000000000207', // NORMAL, price=300, area=40,  rooms=4
    n3:      'eeeeeeee-0001-4000-8000-000000000207', // NORMAL, price=250, area=120, rooms=5
    n4:      'ffffffff-0001-4000-8000-000000000207', // NORMAL, price=50,  area=90,  rooms=2
    n5:      'aaaaaaaa-0002-4000-8000-000000000207', // NORMAL, price=400, area=30,  rooms=3
  };

  let ownerId: string;

  interface CreateParams {
    id: string;
    promotionType: PromotionType;
    promotionExpiresAt: Date | null;
    price: string;
    area: string | null;
    rooms: number;
  }

  async function createListing(params: CreateParams): Promise<void> {
    await prisma.listing.create({
      data: {
        id: params.id,
        ownerId,
        transactionType: TransactionType.SALE,
        propertyType: PropertyType.APARTMENT,
        status: ListingStatus.ACTIVE,
        originalLanguage: Language.RU,
        price: params.price,
        currency: Currency.UZS,
        cityId: CITY_ID_207,
        promotionType: params.promotionType,
        promotionExpiresAt: params.promotionExpiresAt,
        area: params.area,
        rooms: params.rooms,
        translations: {
          create: [
            {
              language: Language.RU,
              title: `t207-${params.id.slice(0, 8)}`,
              source: TranslationSource.USER,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_207 } });

    const owner = await prisma.user.create({
      data: { phone: '+998900000207' },
    });
    ownerId = owner.id;

    await createListing({ id: ID.vip,  promotionType: PromotionType.VIP,    promotionExpiresAt: future,      price: '200.00', area: '80.00',  rooms: 2 });
    await createListing({ id: ID.top,  promotionType: PromotionType.TOP,    promotionExpiresAt: future,      price: '100.00', area: '60.00',  rooms: 1 });
    await createListing({ id: ID.n1,   promotionType: PromotionType.NORMAL, promotionExpiresAt: null,        price: '150.00', area: null,     rooms: 0 });
    await createListing({ id: ID.n2,   promotionType: PromotionType.NORMAL, promotionExpiresAt: null,        price: '300.00', area: '40.00',  rooms: 4 });
    await createListing({ id: ID.n3,   promotionType: PromotionType.NORMAL, promotionExpiresAt: null,        price: '250.00', area: '120.00', rooms: 5 });
    await createListing({ id: ID.n4,   promotionType: PromotionType.NORMAL, promotionExpiresAt: null,        price: '50.00',  area: '90.00',  rooms: 2 });
    await createListing({ id: ID.n5,   promotionType: PromotionType.NORMAL, promotionExpiresAt: null,        price: '400.00', area: '30.00',  rooms: 3 });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_207 } });
    if (ownerId) {
      await prisma.user.delete({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  });

  it('sort=price_asc: VIP/TOP stay on top, NORMAL rows ordered price ASC', async () => {
    const result = await service.search({
      city_id: CITY_ID_207,
      sort: 'price_asc',
      limit: 100,
    });

    const ids = result.data.map((d) => d.id);
    // VIP (tier=2) и TOP (tier=1) всегда первые независимо от цены.
    expect(ids[0]).toBe(ID.vip);
    expect(ids[1]).toBe(ID.top);
    // NORMAL-группа: n4(50) < n1(150) < n3(250) < n2(300) < n5(400).
    const normalIds = ids.slice(2);
    const normalPrices = normalIds.map(
      (id) => Number(result.data.find((d) => d.id === id)!.price),
    );
    for (let i = 1; i < normalPrices.length; i += 1) {
      expect(normalPrices[i]).toBeGreaterThanOrEqual(normalPrices[i - 1]);
    }
    expect(ids).toHaveLength(7);
  });

  it('sort=price_desc: VIP/TOP stay on top, NORMAL rows ordered price DESC', async () => {
    const result = await service.search({
      city_id: CITY_ID_207,
      sort: 'price_desc',
      limit: 100,
    });

    const ids = result.data.map((d) => d.id);
    expect(ids[0]).toBe(ID.vip);
    expect(ids[1]).toBe(ID.top);
    const normalIds = ids.slice(2);
    const normalPrices = normalIds.map(
      (id) => Number(result.data.find((d) => d.id === id)!.price),
    );
    for (let i = 1; i < normalPrices.length; i += 1) {
      expect(normalPrices[i]).toBeLessThanOrEqual(normalPrices[i - 1]);
    }
  });

  it('sort=area_desc: VIP/TOP stay on top, NORMAL rows ordered area DESC with NULL-area last', async () => {
    const result = await service.search({
      city_id: CITY_ID_207,
      sort: 'area_desc',
      limit: 100,
    });

    const ids = result.data.map((d) => d.id);
    expect(ids[0]).toBe(ID.vip);
    expect(ids[1]).toBe(ID.top);
    // В NORMAL-группе: n3(120) > n4(90) > n2(40) > n5(30) > n1(null=-1 sentinel).
    const normalIds = ids.slice(2);
    // Строка с NULL-area (n1) должна быть последней в NORMAL-группе.
    expect(normalIds[normalIds.length - 1]).toBe(ID.n1);
    // Остальные — по убыванию area (не null).
    const withArea = normalIds.slice(0, normalIds.length - 1);
    const areas = withArea.map(
      (id) => {
        const item = result.data.find((d) => d.id === id);
        return item ? 1 : 0; // просто проверяем порядок через id
      },
    );
    // Явная проверка порядка NORMAL c area: n3 > n4 > n2 > n5.
    expect(withArea[0]).toBe(ID.n3); // area=120
    expect(withArea[1]).toBe(ID.n4); // area=90
    expect(withArea[2]).toBe(ID.n2); // area=40
    expect(withArea[3]).toBe(ID.n5); // area=30
    void areas; // используется только для типизации, порядок проверен выше
  });

  it('sort=date_desc (default): VIP/TOP on top, NORMAL ordered by created_at DESC', async () => {
    // date_desc — поведение по умолчанию; явная передача sort и отсутствие — эквивалентны.
    const explicit = await service.search({
      city_id: CITY_ID_207,
      sort: 'date_desc',
      limit: 100,
    });
    const implicit = await service.search({
      city_id: CITY_ID_207,
      limit: 100,
    });

    expect(explicit.data.map((d) => d.id)).toEqual(
      implicit.data.map((d) => d.id),
    );
    // VIP/TOP первые.
    expect(explicit.data[0].id).toBe(ID.vip);
    expect(explicit.data[1].id).toBe(ID.top);
  });

  it('rooms=2: returns only listings with rooms == 2', async () => {
    const result = await service.search({
      city_id: CITY_ID_207,
      rooms: 2,
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    // rooms=2: vip(2), n4(2).
    expect(ids).toContain(ID.vip);
    expect(ids).toContain(ID.n4);
    expect(ids.size).toBe(2);
  });

  it('rooms=4: returns listings with rooms >= 4 (the 4+ bucket)', async () => {
    const result = await service.search({
      city_id: CITY_ID_207,
      rooms: 4,
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    // rooms=4: n2(4), n3(5) → оба >= 4.
    expect(ids).toContain(ID.n2);
    expect(ids).toContain(ID.n3);
    expect(ids.size).toBe(2);
    // Строки с rooms < 4 не должны попадать.
    expect(ids.has(ID.vip)).toBe(false); // rooms=2
    expect(ids.has(ID.top)).toBe(false); // rooms=1
    expect(ids.has(ID.n1)).toBe(false);  // rooms=0
    expect(ids.has(ID.n4)).toBe(false);  // rooms=2
    expect(ids.has(ID.n5)).toBe(false);  // rooms=3
  });

  it('rooms=0: returns only listings with rooms == 0 (exact match)', async () => {
    const result = await service.search({
      city_id: CITY_ID_207,
      rooms: 0,
      limit: 100,
    });

    expect(result.data.map((d) => d.id)).toEqual([ID.n1]);
  });

  it('keyset stability: sort=price_asc with limit=2 — no duplicates, no gaps', async () => {
    const collected: string[] = [];
    let cursor: string | null | undefined;
    let pages = 0;

    do {
      const page = await service.search({
        city_id: CITY_ID_207,
        sort: 'price_asc',
        limit: 2,
        cursor: cursor ?? undefined,
      });
      collected.push(...page.data.map((d) => d.id));
      cursor = page.meta.next_cursor;
      pages += 1;
      expect(pages).toBeLessThanOrEqual(10); // защита от зацикливания
    } while (cursor);

    expect(pages).toBe(4); // 7 записей по 2 → страницы: 2+2+2+1
    expect(collected).toHaveLength(7);
    expect(new Set(collected).size).toBe(7); // без дублей

    // Первые два — VIP/TOP (tier-первичный); остальные 5 — NORMAL по price ASC.
    expect(collected[0]).toBe(ID.vip);
    expect(collected[1]).toBe(ID.top);
    const normalCollected = collected.slice(2);
    const normalPrices = normalCollected.map(
      (id) => [ID.n4, ID.n1, ID.n3, ID.n2, ID.n5].indexOf(id), // expected order index
    );
    // Проверяем что порядок по price ASC (n4=50, n1=150, n3=250, n2=300, n5=400).
    expect(normalCollected[0]).toBe(ID.n4); // 50
    expect(normalCollected[1]).toBe(ID.n1); // 150
    expect(normalCollected[2]).toBe(ID.n3); // 250
    expect(normalCollected[3]).toBe(ID.n2); // 300
    expect(normalCollected[4]).toBe(ID.n5); // 400
    void normalPrices;
  });
});
