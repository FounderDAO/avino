import {
  Currency,
  ExchangeRateSource,
  Language,
  ListingStatus,
  ParkingType,
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

// Медиа-подпись здесь не тестируется (ADR-0086) — echo сохранённого url, без S3.
const uploadsStub = {
  resolveMediaUrl: async (_key: string | null | undefined, url: string) => url,
} as unknown as UploadsService;

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
  const service = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

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
  const service = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

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

    // ADR-0117: page 1 = закреплённое промо (vip+top, ≤ N=3) + первая страница
    // строгого потока (limit=2) = 4 элемента; далее поток по 2 → 2+1. Итого 3 страницы.
    expect(pages).toBe(3);
    expect(collected).toHaveLength(7);
    expect(new Set(collected).size).toBe(7); // без дублей

    // Первые два — закреплённые промо VIP/TOP; остальные 5 — NORMAL по price ASC.
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

/**
 * Integration-тесты ГИБРИДНОЙ явной сортировки + FX-нормализации (ADR-0117).
 *
 * Поведение: при ЯВНОМ `sort` (price/area/date) промо-приоритет НЕ доминирует над
 * всей выдачей — закрепляются только топ-N=3 промо, остальное строго по выбранному
 * ключу. Для `price_*` вторичный ключ нормализуется в базовую валюту (USD) по
 * текущему курсу ЦБУ, чтобы UZS/USD сравнивались по реальной стоимости.
 *
 * Дефолт (без `sort`, «Рекомендуемые») — старое поведение (полный промо-приоритет).
 *
 * Изоляция — отдельный `CITY` + собственная строка курса (удаляются в afterAll).
 */
describe('SearchService explicit-sort hybrid pin + FX (integration, ADR-0117)', () => {
  const prisma = new PrismaService();
  const service = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

  const CITY = '44444444-5555-4666-8777-000000000044';
  const future = new Date('2027-01-01T00:00:00.000Z');

  // Валидные UUID; суффикс ...a4 изолирует от прочих наборов.
  const ID = {
    vipNew: 'a0000001-0000-4000-8000-0000000000a4', // VIP, новее → закреплён #1
    vipOld: 'a0000002-0000-4000-8000-0000000000a4', // VIP, старее → закреплён #2
    topNew: 'b0000001-0000-4000-8000-0000000000a4', // TOP, новее → закреплён #3
    topOld: 'b0000002-0000-4000-8000-0000000000a4', // TOP, 4-е промо → в общий поток
    nmUzs: 'c0000001-0000-4000-8000-0000000000a4', // NORMAL 12M UZS  → норм. 1200
    nmUsd: 'c0000002-0000-4000-8000-0000000000a4', // NORMAL 5000 USD → норм. 5000
    nmUsd2: 'c0000003-0000-4000-8000-0000000000a4', // NORMAL 8000 USD → норм. 8000
  };

  let ownerId: string;
  let rateId: string;

  async function seed(p: {
    id: string;
    promo: PromotionType;
    expiresAt: Date | null;
    createdAt: Date;
    price: string;
    currency: Currency;
  }): Promise<void> {
    await prisma.listing.create({
      data: {
        id: p.id,
        ownerId,
        transactionType: TransactionType.SALE,
        propertyType: PropertyType.APARTMENT,
        status: ListingStatus.ACTIVE,
        originalLanguage: Language.RU,
        price: p.price,
        currency: p.currency,
        cityId: CITY,
        promotionType: p.promo,
        promotionExpiresAt: p.expiresAt,
        createdAt: p.createdAt,
        translations: {
          create: [
            {
              language: Language.RU,
              title: `fx-${p.id.slice(0, 8)}`,
              source: TranslationSource.USER,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.listing.deleteMany({ where: { cityId: CITY } });
    const owner = await prisma.user.create({
      data: { phone: '+998900000044' },
    });
    ownerId = owner.id;

    // Контролируемый курс: 1 USD = 10 000 UZS. fetched_at в будущем → «текущий».
    const rate = await prisma.exchangeRate.create({
      data: {
        base: Currency.USD,
        quote: Currency.UZS,
        rate: '10000',
        source: ExchangeRateSource.MANUAL,
        fetchedAt: new Date('2099-01-01T00:00:00.000Z'),
      },
    });
    rateId = rate.id;

    // 4 промо (> N=3): vipNew/vipOld/topNew закрепятся; topOld — в общий поток.
    await seed({ id: ID.vipNew, promo: PromotionType.VIP, expiresAt: future, createdAt: new Date('2026-05-22T00:00:00.000Z'), price: '50000000.00', currency: Currency.UZS });
    await seed({ id: ID.vipOld, promo: PromotionType.VIP, expiresAt: future, createdAt: new Date('2026-05-21T00:00:00.000Z'), price: '50000000.00', currency: Currency.UZS });
    await seed({ id: ID.topNew, promo: PromotionType.TOP, expiresAt: future, createdAt: new Date('2026-05-24T00:00:00.000Z'), price: '50000000.00', currency: Currency.UZS });
    // topOld: 4-е промо → строгий поток. Норм. цена 100M/10000 = 10000 (дороже всех NORMAL).
    await seed({ id: ID.topOld, promo: PromotionType.TOP, expiresAt: future, createdAt: new Date('2026-05-23T00:00:00.000Z'), price: '100000000.00', currency: Currency.UZS });
    // NORMAL смешанные валюты: nmUzs дешевле всех по РЕАЛЬНОЙ стоимости, но дороже по сырому числу.
    await seed({ id: ID.nmUzs, promo: PromotionType.NORMAL, expiresAt: null, createdAt: new Date('2026-05-10T00:00:00.000Z'), price: '12000000.00', currency: Currency.UZS });
    await seed({ id: ID.nmUsd, promo: PromotionType.NORMAL, expiresAt: null, createdAt: new Date('2026-05-11T00:00:00.000Z'), price: '5000.00', currency: Currency.USD });
    await seed({ id: ID.nmUsd2, promo: PromotionType.NORMAL, expiresAt: null, createdAt: new Date('2026-05-12T00:00:00.000Z'), price: '8000.00', currency: Currency.USD });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY } });
    if (rateId) {
      await prisma.exchangeRate.delete({ where: { id: rateId } });
    }
    if (ownerId) {
      await prisma.user.delete({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  });

  it('price_asc: pins exactly N=3 promoted, then orders the rest by FX-normalized price (UZS converted)', async () => {
    const res = await service.search({ city_id: CITY, sort: 'price_asc', limit: 100 });
    const ids = res.data.map((d) => d.id);

    // Ровно 3 закреплённых промо сверху (4-е промо topOld — НЕ закреплено).
    expect(ids.slice(0, 3)).toEqual([ID.vipNew, ID.vipOld, ID.topNew]);

    // Хвост — строго по РЕАЛЬНОЙ (нормализованной) цене:
    //   nmUzs (12M/10000=1200) < nmUsd (5000) < nmUsd2 (8000) < topOld (100M/10000=10000)
    expect(ids.slice(3)).toEqual([ID.nmUzs, ID.nmUsd, ID.nmUsd2, ID.topOld]);

    // Ключевая проверка нормализации: UZS-объявление (сырое 12 000 000) идёт
    // РАНЬШЕ USD-объявления (сырое 5 000), т.к. реально дешевле.
    expect(ids.indexOf(ID.nmUzs)).toBeLessThan(ids.indexOf(ID.nmUsd));
    expect(ids).toHaveLength(7);
    expect(res.meta.total).toBe(7);
  });

  it('price_desc: pins N=3 promoted, then orders the rest by FX-normalized price DESC', async () => {
    const res = await service.search({ city_id: CITY, sort: 'price_desc', limit: 100 });
    const ids = res.data.map((d) => d.id);
    expect(ids.slice(0, 3)).toEqual([ID.vipNew, ID.vipOld, ID.topNew]);
    // topOld(10000) > nmUsd2(8000) > nmUsd(5000) > nmUzs(1200)
    expect(ids.slice(3)).toEqual([ID.topOld, ID.nmUsd2, ID.nmUsd, ID.nmUzs]);
  });

  it('default (no explicit sort): keeps FULL promotion priority — all 4 promoted on top', async () => {
    const res = await service.search({ city_id: CITY, limit: 100 });
    const ids = res.data.map((d) => d.id);
    // Без явного сорта — старое поведение: ВСЕ промо сверху (тир ↓, дата ↓).
    expect(ids.slice(0, 4)).toEqual([ID.vipNew, ID.vipOld, ID.topNew, ID.topOld]);
  });

  it('keyset: pinned promo are never duplicated across pages, all 7 returned once', async () => {
    const collected: string[] = [];
    let cursor: string | null | undefined;
    let pages = 0;
    do {
      const page = await service.search({
        city_id: CITY,
        sort: 'price_asc',
        limit: 3,
        cursor: cursor ?? undefined,
      });
      collected.push(...page.data.map((d) => d.id));
      cursor = page.meta.next_cursor;
      pages += 1;
      expect(pages).toBeLessThanOrEqual(10);
    } while (cursor);

    expect(new Set(collected).size).toBe(collected.length); // без дублей
    expect(collected.filter((id) => id === ID.vipNew)).toHaveLength(1);
    expect(new Set(collected)).toEqual(new Set(Object.values(ID))); // все 7 ровно один раз
  });
});

/**
 * Integration-тесты bathrooms_min фильтра SearchService (Zillow Phase 2).
 * Проверяет: bathrooms >= N фильтрует корректно, NULL bathrooms исключается.
 *
 * Изоляция — уникальный `CITY_ID_BATHS`; данные удаляются в afterAll.
 */
describe('SearchService bathrooms_min filter (integration, Zillow Phase 2)', () => {
  const prisma = new PrismaService();
  const service = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

  const CITY_ID_BATHS = '44444444-5555-4444-8777-000000000ba7';

  // Фиксированные UUIDs для детерминированных проверок.
  const ID = {
    baths1: 'aaaaaaaa-0001-4000-8000-0000000ba701', // bathrooms=1
    baths2: 'bbbbbbbb-0001-4000-8000-0000000ba702', // bathrooms=2
    baths3: 'cccccccc-0001-4000-8000-0000000ba703', // bathrooms=3
    bathsNull: 'dddddddd-0001-4000-8000-0000000ba704', // bathrooms=null
  };

  let ownerId: string;

  async function createListing(params: {
    id: string;
    bathrooms: number | null;
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
        cityId: CITY_ID_BATHS,
        bathrooms: params.bathrooms,
        translations: {
          create: [
            {
              language: Language.RU,
              title: `baths-${params.id.slice(0, 8)}`,
              source: TranslationSource.USER,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_BATHS } });

    const owner = await prisma.user.create({
      data: { phone: '+998900000BAT' },
    });
    ownerId = owner.id;

    await createListing({ id: ID.baths1, bathrooms: 1 });
    await createListing({ id: ID.baths2, bathrooms: 2 });
    await createListing({ id: ID.baths3, bathrooms: 3 });
    await createListing({ id: ID.bathsNull, bathrooms: null });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_BATHS } });
    if (ownerId) {
      await prisma.user.delete({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  });

  it('bathrooms_min фильтрует bathrooms >= N, NULL исключает', async () => {
    const res = await service.search({ city_id: CITY_ID_BATHS, bathrooms_min: 2, limit: 100 } as any);
    const ids = res.data.map((l) => l.id);
    expect(ids).toContain(ID.baths2);
    expect(ids).toContain(ID.baths3);
    expect(ids).not.toContain(ID.baths1);
    expect(ids).not.toContain(ID.bathsNull);
  });
});

/**
 * Integration-тесты свободнотекстового поиска `q` (TASK-208, ADR-0067).
 * Проверяет ILIKE-подстрочный поиск (pg_trgm) по title/description/address,
 * любой язык, case-insensitive, LIKE-экранирование `%`, пересечение с другими
 * фильтрами.
 *
 * Изоляция — уникальный `CITY_ID_208`; данные удаляются в afterAll.
 * Индексы не обязательны для прохождения тестов (ILIKE работает без них);
 * они нужны только для производительности в prod.
 */
describe('SearchService text query q (integration, TASK-208)', () => {
  const prisma = new PrismaService();
  const service = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

  // Уникальный город для этого набора — не пересекается с тестами выше.
  const CITY_ID_208 = '33333333-4444-4444-8666-000000000208';

  // Фиксированные UUIDs — суффикс -208 исключает коллизию с другими наборами.
  const ID = {
    ruTitle:    'aaaaaaaa-0003-4000-8000-000000000208', // RU title: «Квартира в центре Ташкента»
    uzTitle:    'bbbbbbbb-0003-4000-8000-000000000208', // UZ title: «Toshkent shahrida xonadon»
    enDesc:     'cccccccc-0003-4000-8000-000000000208', // EN description: «Spacious penthouse apartment»
    address:    'dddddddd-0003-4000-8000-000000000208', // address: «ул. Амира Темура, 5»
    noMatch:    'eeeeeeee-0003-4000-8000-000000000208', // ничего совпадающего
    rentSale:   'ffffffff-0003-4000-8000-000000000208', // для теста пересечения q + transaction_type
  };

  let ownerId: string;

  interface CreateParams {
    id: string;
    address?: string;
    translations: Array<{
      language: Language;
      title: string;
      description?: string;
    }>;
    transactionType?: TransactionType;
  }

  async function createListing(params: CreateParams): Promise<void> {
    await prisma.listing.create({
      data: {
        id: params.id,
        ownerId,
        transactionType: params.transactionType ?? TransactionType.SALE,
        propertyType: PropertyType.APARTMENT,
        status: ListingStatus.ACTIVE,
        originalLanguage: params.translations[0].language,
        price: '500000.00',
        currency: Currency.UZS,
        cityId: CITY_ID_208,
        promotionType: PromotionType.NORMAL,
        promotionExpiresAt: null,
        address: params.address ?? null,
        translations: {
          create: params.translations.map((t) => ({
            language: t.language,
            title: t.title,
            description: t.description ?? null,
            source: TranslationSource.USER,
          })),
        },
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_208 } });

    const owner = await prisma.user.create({
      data: { phone: '+998900000208' },
    });
    ownerId = owner.id;

    // Листинг с RU-заголовком.
    await createListing({
      id: ID.ruTitle,
      translations: [
        { language: Language.RU, title: 'Квартира в центре Ташкента' },
      ],
    });

    // Листинг с UZ-заголовком.
    await createListing({
      id: ID.uzTitle,
      translations: [
        { language: Language.UZ, title: 'Toshkent shahrida xonadon' },
      ],
    });

    // Листинг с EN-описанием.
    await createListing({
      id: ID.enDesc,
      translations: [
        {
          language: Language.EN,
          title: 'Luxury flat',
          description: 'Spacious penthouse apartment with panoramic views',
        },
      ],
    });

    // Листинг с адресом на кириллице.
    await createListing({
      id: ID.address,
      address: 'ул. Амира Темура, 5',
      translations: [
        { language: Language.RU, title: 'Без особых слов в заголовке' },
      ],
    });

    // Листинг без совпадений — «пустой» контент.
    await createListing({
      id: ID.noMatch,
      translations: [
        { language: Language.RU, title: 'Совершенно другой объект' },
      ],
    });

    // Листинг для теста пересечения q + transaction_type (RENT).
    await createListing({
      id: ID.rentSale,
      transactionType: TransactionType.RENT,
      translations: [
        { language: Language.RU, title: 'Квартира для аренды' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_208 } });
    if (ownerId) {
      await prisma.user.delete({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  });

  it('q matches a full word in title (case-insensitive — mixed case)', async () => {
    // «КВАРТИРА» — верхний регистр, должно найти RU-заголовок и листинг аренды.
    const result = await service.search({
      city_id: CITY_ID_208,
      q: 'КВАРТИРА',
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toContain(ID.ruTitle);
    expect(ids).toContain(ID.rentSale);
    // Записи без слова «квартира» не должны попасть.
    expect(ids.has(ID.noMatch)).toBe(false);
    expect(ids.has(ID.address)).toBe(false);
  });

  it('q matches a partial word (substring) in title', async () => {
    // «шахр» — подстрока «shahrida» в UZ-заголовке.
    const result = await service.search({
      city_id: CITY_ID_208,
      q: 'shahri',
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toContain(ID.uzTitle);
    expect(ids.has(ID.noMatch)).toBe(false);
  });

  it('q matches listings.address', async () => {
    // «Амира» — в address листинга ID.address.
    const result = await service.search({
      city_id: CITY_ID_208,
      q: 'Амира',
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toContain(ID.address);
    expect(ids.has(ID.noMatch)).toBe(false);
    expect(ids.has(ID.uzTitle)).toBe(false);
  });

  it('q matches description (any language)', async () => {
    // «penthouse» — в EN-description листинга ID.enDesc.
    const result = await service.search({
      city_id: CITY_ID_208,
      q: 'penthouse',
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toContain(ID.enDesc);
    expect(ids.has(ID.noMatch)).toBe(false);
  });

  it('q with no match returns empty result', async () => {
    const result = await service.search({
      city_id: CITY_ID_208,
      q: 'xyznonexistentterm99887766',
      limit: 100,
    });

    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
  });

  it('q combined with transaction_type intersects correctly', async () => {
    // «квартира» + RENT — должен вернуть только ID.rentSale (не ruTitle, который SALE).
    const result = await service.search({
      city_id: CITY_ID_208,
      q: 'квартира',
      transaction_type: TransactionType.RENT,
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toContain(ID.rentSale);
    // ruTitle имеет «Квартира» но transaction_type=SALE → не попадает.
    expect(ids.has(ID.ruTitle)).toBe(false);
    expect(ids.size).toBe(1);
  });

  it('q containing a literal % does NOT behave as a wildcard (LIKE-escaped)', async () => {
    // Если % не экранирован, он совпал бы со всеми строками. С экранированием —
    // только те, у кого в тексте буквально есть символ %; таких нет → 0 результатов.
    const result = await service.search({
      city_id: CITY_ID_208,
      q: '%',
      limit: 100,
    });

    // Ни один листинг не содержит литеральный % в title/description/address.
    expect(result.data).toHaveLength(0);
  });
});

/**
 * Integration-тесты Zillow-фильтров Phase 1 (TASK-Zillow).
 * Проверяет: property_type IN-массив, rooms_min, area_min/max, floor+not_first/last,
 * year_min/max, listing_source OWNER/AGENCY, tours_enabled.
 *
 * Изоляция — уникальный CITY_ID_ZILLOW; данные удаляются в afterAll.
 */
describe('GET /search — Zillow filters (Phase 1)', () => {
  const prisma = new PrismaService();
  const service = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

  const CITY_ID_ZILLOW = '44444444-5555-4444-8777-000000000901';

  // Фиксированные UUIDs — суффикс -0901 исключает коллизию с другими наборами.
  const ID = {
    apt:    'aaaaaaaa-0004-4000-8000-000000000901', // APARTMENT, rooms=2, area=75, floor=5/9, year=2010, agencyId=null, tours=false
    house:  'bbbbbbbb-0004-4000-8000-000000000901', // HOUSE,     rooms=5, area=120,floor=1/1, year=1990, agencyId=null, tours=false
    land:   'cccccccc-0004-4000-8000-000000000901', // LAND,      rooms=1, area=40, floor=9/9, year=2024, agencyId=<uuid>, tours=false
    comm:   'dddddddd-0004-4000-8000-000000000901', // COMMERCIAL,rooms=3, area=40, floor=3/9, year=2010, agencyId=<uuid>, tours=true
  };

  // UUID агентства (не существует в agencies-таблице — просто ненулевой FK)
  const AGENCY_UUID = 'a0000000-0000-4000-8000-000000000901';

  let ownerId: string;

  interface ZCreateParams {
    id: string;
    propertyType: PropertyType;
    rooms: number;
    area: string;
    floor: number;
    totalFloors: number;
    yearBuilt: number;
    agencyId: string | null;
    toursEnabled: boolean;
  }

  async function createZListing(params: ZCreateParams): Promise<void> {
    await prisma.listing.create({
      data: {
        id: params.id,
        ownerId,
        transactionType: TransactionType.SALE,
        propertyType: params.propertyType,
        status: ListingStatus.ACTIVE,
        originalLanguage: Language.RU,
        price: '100000.00',
        currency: Currency.UZS,
        cityId: CITY_ID_ZILLOW,
        promotionType: PromotionType.NORMAL,
        promotionExpiresAt: null,
        rooms: params.rooms,
        area: params.area,
        floor: params.floor,
        totalFloors: params.totalFloors,
        yearBuilt: params.yearBuilt,
        agencyId: params.agencyId,
        toursEnabled: params.toursEnabled,
        translations: {
          create: [
            {
              language: Language.RU,
              title: `zillow-${params.id.slice(0, 8)}`,
              source: TranslationSource.USER,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_ZILLOW } });

    const owner = await prisma.user.create({ data: { phone: '+998900000901' } });
    ownerId = owner.id;

    await createZListing({ id: ID.apt,  propertyType: PropertyType.APARTMENT,  rooms: 2, area: '75.00',  floor: 5, totalFloors: 9, yearBuilt: 2010, agencyId: null,        toursEnabled: false });
    await createZListing({ id: ID.house,propertyType: PropertyType.HOUSE,       rooms: 5, area: '120.00', floor: 1, totalFloors: 1, yearBuilt: 1990, agencyId: null,        toursEnabled: false });
    await createZListing({ id: ID.land, propertyType: PropertyType.LAND,        rooms: 1, area: '40.00',  floor: 9, totalFloors: 9, yearBuilt: 2024, agencyId: AGENCY_UUID, toursEnabled: false });
    await createZListing({ id: ID.comm, propertyType: PropertyType.COMMERCIAL,  rooms: 3, area: '40.00',  floor: 3, totalFloors: 9, yearBuilt: 2010, agencyId: AGENCY_UUID, toursEnabled: true  });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_ZILLOW } });
    if (ownerId) {
      await prisma.user.delete({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  });

  it('property_type мультивыбор → IN', async () => {
    const result = await service.search({
      city_id: CITY_ID_ZILLOW,
      property_type: [PropertyType.APARTMENT, PropertyType.HOUSE],
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toContain(ID.apt);
    expect(ids).toContain(ID.house);
    expect(ids.has(ID.land)).toBe(false);
    expect(ids.has(ID.comm)).toBe(false);
    expect(ids.size).toBe(2);
  });

  it('rooms_min = «≥N»', async () => {
    // rooms: apt=2, house=5, land=1, comm=3; rooms_min=3 → house(5)+comm(3) = 2
    const result = await service.search({
      city_id: CITY_ID_ZILLOW,
      rooms_min: 3,
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toContain(ID.house);
    expect(ids).toContain(ID.comm);
    expect(ids.has(ID.apt)).toBe(false);
    expect(ids.has(ID.land)).toBe(false);
    expect(ids.size).toBe(2);
  });

  it('area_min/area_max — диапазон м²', async () => {
    // area: apt=75, house=120, land=40, comm=40; [50,100] → apt(75) = 1
    const result = await service.search({
      city_id: CITY_ID_ZILLOW,
      area_min: 50,
      area_max: 100,
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toContain(ID.apt);
    expect(ids.has(ID.house)).toBe(false);
    expect(ids.has(ID.land)).toBe(false);
    expect(ids.has(ID.comm)).toBe(false);
    expect(ids.size).toBe(1);
  });

  it('not_first_floor исключает первый этаж', async () => {
    // floor: apt=5, house=1, land=9, comm=3; not_first_floor → apt+land+comm = 3
    const result = await service.search({
      city_id: CITY_ID_ZILLOW,
      not_first_floor: true,
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toContain(ID.apt);
    expect(ids).toContain(ID.land);
    expect(ids).toContain(ID.comm);
    expect(ids.has(ID.house)).toBe(false); // floor=1
    expect(ids.size).toBe(3);
  });

  it('not_last_floor исключает последний этаж (floor < total_floors)', async () => {
    // (floor,total): apt=(5,9), house=(1,1), land=(9,9), comm=(3,9)
    // not_last_floor: apt(5<9✓) + comm(3<9✓) = 2; house(1=1✗) + land(9=9✗)
    const result = await service.search({
      city_id: CITY_ID_ZILLOW,
      not_last_floor: true,
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toContain(ID.apt);
    expect(ids).toContain(ID.comm);
    expect(ids.has(ID.house)).toBe(false);
    expect(ids.has(ID.land)).toBe(false);
    expect(ids.size).toBe(2);
  });

  it('year_min/year_max — диапазон года постройки', async () => {
    // yearBuilt: apt=2010, house=1990, land=2024, comm=2010; [2000,2020] → apt+comm = 2
    const result = await service.search({
      city_id: CITY_ID_ZILLOW,
      year_min: 2000,
      year_max: 2020,
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toContain(ID.apt);
    expect(ids).toContain(ID.comm);
    expect(ids.has(ID.house)).toBe(false); // 1990
    expect(ids.has(ID.land)).toBe(false);  // 2024
    expect(ids.size).toBe(2);
  });

  it('listing_source OWNER → agency_id IS NULL', async () => {
    // agencyId: apt=null, house=null, land=AGENCY, comm=AGENCY
    const result = await service.search({
      city_id: CITY_ID_ZILLOW,
      listing_source: ['OWNER'],
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toContain(ID.apt);
    expect(ids).toContain(ID.house);
    expect(ids.has(ID.land)).toBe(false);
    expect(ids.has(ID.comm)).toBe(false);
    expect(ids.size).toBe(2);
  });

  it('listing_source AGENCY → agency_id IS NOT NULL', async () => {
    const result = await service.search({
      city_id: CITY_ID_ZILLOW,
      listing_source: ['AGENCY'],
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toContain(ID.land);
    expect(ids).toContain(ID.comm);
    expect(ids.has(ID.apt)).toBe(false);
    expect(ids.has(ID.house)).toBe(false);
    expect(ids.size).toBe(2);
  });

  it('listing_source [OWNER, AGENCY] → без фильтра по источнику', async () => {
    const result = await service.search({
      city_id: CITY_ID_ZILLOW,
      listing_source: ['OWNER', 'AGENCY'],
      limit: 100,
    });

    // Оба значения → фильтр не применяется → все 4 листинга
    expect(result.data).toHaveLength(4);
  });

  it('tours_enabled=true', async () => {
    // toursEnabled: только comm=true
    const result = await service.search({
      city_id: CITY_ID_ZILLOW,
      tours_enabled: true,
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toContain(ID.comm);
    expect(ids.has(ID.apt)).toBe(false);
    expect(ids.has(ID.house)).toBe(false);
    expect(ids.has(ID.land)).toBe(false);
    expect(ids.size).toBe(1);
  });
});

/**
 * Integration-тесты parking_type фильтра SearchService (Zillow Phase 2).
 * Проверяет: parking_type IN фильтрует корректно, NULL исключается.
 *
 * Изоляция — уникальный `CITY_ID_PARKING`; данные удаляются в afterAll.
 */
describe('SearchService parking_type filter (integration, Zillow Phase 2)', () => {
  const prisma = new PrismaService();
  const service = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

  const CITY_ID_PARKING = '55555555-6666-4555-8888-00000000a111';

  const ID = {
    garage: 'aaaaaaaa-0001-4000-8000-00000000a101',  // parkingType=GARAGE
    yard: 'bbbbbbbb-0001-4000-8000-00000000a102',    // parkingType=YARD
    nullParking: 'cccccccc-0001-4000-8000-00000000a103', // parkingType=null
  };

  let ownerId: string;

  async function createListing(params: {
    id: string;
    parkingType: ParkingType | null;
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
        cityId: CITY_ID_PARKING,
        parkingType: params.parkingType,
        translations: {
          create: [
            {
              language: Language.RU,
              title: `parking-${params.id.slice(0, 8)}`,
              source: TranslationSource.USER,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_PARKING } });

    const owner = await prisma.user.create({
      data: { phone: '+998900000A01' },
    });
    ownerId = owner.id;

    await createListing({ id: ID.garage, parkingType: ParkingType.GARAGE });
    await createListing({ id: ID.yard, parkingType: ParkingType.YARD });
    await createListing({ id: ID.nullParking, parkingType: null });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_PARKING } });
    if (ownerId) {
      await prisma.user.delete({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  });

  it('parking_type фильтрует IN, NULL исключает', async () => {
    const res = await service.search({ city_id: CITY_ID_PARKING, parking_type: [ParkingType.GARAGE], limit: 100 } as any);
    const ids = res.data.map((l) => l.id);
    expect(ids).toContain(ID.garage);
    expect(ids).not.toContain(ID.yard);
    expect(ids).not.toContain(ID.nullParking);
  });

  it('parking_type мультивыбор — IN([GARAGE, YARD]) возвращает оба', async () => {
    const res = await service.search({
      city_id: CITY_ID_PARKING,
      parking_type: [ParkingType.GARAGE, ParkingType.YARD],
      limit: 100,
    } as any);
    const ids = res.data.map((l) => l.id);
    expect(ids).toContain(ID.garage);
    expect(ids).toContain(ID.yard);
    expect(ids).not.toContain(ID.nullParking);
  });

  it('результат содержит поле parking_type', async () => {
    const res = await service.search({ city_id: CITY_ID_PARKING, limit: 100 } as any);
    const garageCard = res.data.find((l) => l.id === ID.garage);
    expect(garageCard).toBeDefined();
    expect(garageCard!.parking_type).toBe(ParkingType.GARAGE);
    const nullCard = res.data.find((l) => l.id === ID.nullParking);
    expect(nullCard).toBeDefined();
    expect(nullCard!.parking_type).toBeNull();
  });
});

/**
 * Integration-тесты lot_area_min/lot_area_max фильтра SearchService (Zillow Phase 2).
 * Проверяет: lot_area >= / <= диапазон фильтрует корректно, NULL исключается.
 *
 * Изоляция — уникальный `CITY_ID_LOT`; данные удаляются в afterAll.
 */
describe('SearchService lot_area_min/max filter (integration, Zillow Phase 2)', () => {
  const prisma = new PrismaService();
  const service = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

  const CITY_ID_LOT = '66666666-7777-4666-8999-000000001001';

  const ID = {
    lot3: 'aaaaaaaa-0001-4000-8000-000000001301',   // lotArea=3.00
    lot6: 'bbbbbbbb-0001-4000-8000-000000001601',   // lotArea=6.00
    lot12: 'cccccccc-0001-4000-8000-000000001121',  // lotArea=12.00
    lotNull: 'dddddddd-0001-4000-8000-000000001001', // lotArea=null
  };

  let ownerId: string;

  async function createListing(params: {
    id: string;
    lotArea: string | null;
  }): Promise<void> {
    await prisma.listing.create({
      data: {
        id: params.id,
        ownerId,
        transactionType: TransactionType.SALE,
        propertyType: PropertyType.LAND,
        status: ListingStatus.ACTIVE,
        originalLanguage: Language.RU,
        price: '100000.00',
        currency: Currency.UZS,
        cityId: CITY_ID_LOT,
        lotArea: params.lotArea,
        translations: {
          create: [
            {
              language: Language.RU,
              title: `lot-${params.id.slice(0, 8)}`,
              source: TranslationSource.USER,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_LOT } });

    const owner = await prisma.user.create({
      data: { phone: '+998900000L01' },
    });
    ownerId = owner.id;

    await createListing({ id: ID.lot3, lotArea: '3.00' });
    await createListing({ id: ID.lot6, lotArea: '6.00' });
    await createListing({ id: ID.lot12, lotArea: '12.00' });
    await createListing({ id: ID.lotNull, lotArea: null });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_LOT } });
    if (ownerId) {
      await prisma.user.delete({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  });

  it('lot_area_min/max фильтрует диапазон, NULL исключает', async () => {
    const res = await service.search({ city_id: CITY_ID_LOT, lot_area_min: 5, lot_area_max: 10, limit: 100 } as any);
    const ids = res.data.map((l) => l.id);
    expect(ids).toContain(ID.lot6);
    expect(ids).not.toContain(ID.lot3);
    expect(ids).not.toContain(ID.lot12);
    expect(ids).not.toContain(ID.lotNull);
  });

  it('результат содержит поле lot_area', async () => {
    const res = await service.search({ city_id: CITY_ID_LOT, limit: 100 } as any);
    const card6 = res.data.find((l) => l.id === ID.lot6);
    expect(card6).toBeDefined();
    expect(card6!.lot_area).toBe('6.00');
    const cardNull = res.data.find((l) => l.id === ID.lotNull);
    expect(cardNull).toBeDefined();
    expect(cardNull!.lot_area).toBeNull();
  });
});

/**
 * Integration-тесты amenities AND-containment фильтра SearchService (Zillow Phase 2).
 * Проверяет: amenities @>-AND фильтрует корректно (есть ВСЕ выбранные),
 * пустой массив не фильтрует.
 *
 * Изоляция — уникальный `CITY_ID_AMENITIES`; данные удаляются в afterAll.
 */
describe('SearchService amenities filter (integration, Zillow Phase 2)', () => {
  const prisma = new PrismaService();
  const service = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

  const CITY_ID_AMENITIES = '77777777-8888-4777-9000-00000000A001';

  const ID = {
    both: 'aaaaaaaa-0002-4000-8000-00000000a101',  // amenities=[ELEVATOR, AIR_CONDITIONING]
    elevatorOnly: 'bbbbbbbb-0002-4000-8000-00000000a102', // amenities=[ELEVATOR]
    empty: 'cccccccc-0002-4000-8000-00000000a103',  // amenities=[]
  };

  let ownerId: string;

  async function createListing(params: {
    id: string;
    amenities: string[];
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
        cityId: CITY_ID_AMENITIES,
        amenities: params.amenities as any,
        translations: {
          create: [
            {
              language: Language.RU,
              title: `amenity-${params.id.slice(0, 8)}`,
              source: TranslationSource.USER,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_AMENITIES } });

    const owner = await prisma.user.create({
      data: { phone: '+998900000AM1' },
    });
    ownerId = owner.id;

    await createListing({ id: ID.both, amenities: ['ELEVATOR', 'AIR_CONDITIONING'] });
    await createListing({ id: ID.elevatorOnly, amenities: ['ELEVATOR'] });
    await createListing({ id: ID.empty, amenities: [] });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_AMENITIES } });
    if (ownerId) {
      await prisma.user.delete({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  });

  it('amenities AND — один параметр включает все, у кого он есть', async () => {
    const res = await service.search({
      city_id: CITY_ID_AMENITIES,
      amenities: ['ELEVATOR'],
      limit: 100,
    } as any);
    const ids = res.data.map((l) => l.id);
    expect(ids).toContain(ID.both);
    expect(ids).toContain(ID.elevatorOnly);
    expect(ids).not.toContain(ID.empty);
  });

  it('amenities AND — два параметра возвращает только те, где есть оба', async () => {
    const res = await service.search({
      city_id: CITY_ID_AMENITIES,
      amenities: ['ELEVATOR', 'AIR_CONDITIONING'],
      limit: 100,
    } as any);
    const ids = res.data.map((l) => l.id);
    expect(ids).toContain(ID.both);
    expect(ids).not.toContain(ID.elevatorOnly);
    expect(ids).not.toContain(ID.empty);
  });

  it('без параметра amenities возвращает все', async () => {
    const res = await service.search({
      city_id: CITY_ID_AMENITIES,
      limit: 100,
    } as any);
    const ids = res.data.map((l) => l.id);
    expect(ids).toContain(ID.both);
    expect(ids).toContain(ID.elevatorOnly);
    expect(ids).toContain(ID.empty);
  });
});

/**
 * Integration-тесты is_basement фильтра SearchService (баглист мобилки #4).
 * Проверяет: is_basement=true возвращает только цокольные листинги;
 * без параметра фильтр не применяется (цокольные и обычные вместе).
 *
 * Изоляция — уникальный `CITY_ID_BASEMENT`; данные удаляются в afterAll.
 */
describe('SearchService is_basement filter (integration, мобилка #4)', () => {
  const prisma = new PrismaService();
  const service = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

  const CITY_ID_BASEMENT = '88888888-9999-4888-8000-000000000ba1';

  const ID = {
    basement: 'aaaaaaaa-0001-4000-8000-000000000ba1', // isBasement=true
    normal: 'bbbbbbbb-0001-4000-8000-000000000ba1', // isBasement=false (default)
  };

  let ownerId: string;

  async function createListing(params: {
    id: string;
    isBasement: boolean;
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
        cityId: CITY_ID_BASEMENT,
        isBasement: params.isBasement,
        translations: {
          create: [
            {
              language: Language.RU,
              title: `basement-${params.id.slice(0, 8)}`,
              source: TranslationSource.USER,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_BASEMENT } });

    const owner = await prisma.user.create({
      data: { phone: '+998900000BA1' },
    });
    ownerId = owner.id;

    await createListing({ id: ID.basement, isBasement: true });
    await createListing({ id: ID.normal, isBasement: false });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_BASEMENT } });
    if (ownerId) {
      await prisma.user.delete({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  });

  it('is_basement=true возвращает только цокольные листинги', async () => {
    const res = await service.search({
      city_id: CITY_ID_BASEMENT,
      is_basement: true,
      limit: 100,
    } as any);
    const ids = res.data.map((l) => l.id);
    expect(ids).toContain(ID.basement);
    expect(ids).not.toContain(ID.normal);
    expect(ids).toHaveLength(1);
  });

  it('без параметра is_basement фильтр не применяется — цокольные и обычные вместе', async () => {
    const res = await service.search({
      city_id: CITY_ID_BASEMENT,
      limit: 100,
    } as any);
    const ids = res.data.map((l) => l.id);
    expect(ids).toContain(ID.basement);
    expect(ids).toContain(ID.normal);
    expect(ids).toHaveLength(2);
  });
});

/**
 * FX-нормализация ценового фильтра (баг-репорт: диапазон 45k–110k показывал
 * только несколько объявлений, снижение нижней границы не добавляло результатов).
 *
 * Корень: цена показывается пользователю КОНВЕРТИРОВАННОЙ в выбранную валюту, а
 * фильтр отсекал объявления другой валюты равенством `currency = X`. Теперь цену
 * каждого листинга приводим к валюте фильтра по курсу ЦБУ — в диапазон попадают
 * объявления ОБЕИХ валют, как их и видит пользователь.
 *
 * Сид: два эквивалентных по стоимости листинга ($50k USD и 600M UZS при
 * 1 USD = 12000 UZS), плюс два вне диапазона.
 */
describe('SearchService price filter FX-normalization (integration)', () => {
  const prisma = new PrismaService();
  const service = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

  const CITY_ID_FX = '22222222-3333-4444-8555-000000000199';
  const RATE = '12000'; // 1 USD = 12000 UZS

  const ID = {
    usdIn:  'aaaaaaaa-0199-4000-8000-000000000001', // 50 000 USD  (в диапазоне)
    uzsIn:  'bbbbbbbb-0199-4000-8000-000000000001', // 600 000 000 UZS ≈ 50 000 USD (в диапазоне)
    usdOut: 'cccccccc-0199-4000-8000-000000000001', // 10 000 USD  (ниже диапазона)
    uzsOut: 'dddddddd-0199-4000-8000-000000000001', // 2 400 000 000 UZS ≈ 200 000 USD (выше диапазона)
  };

  let ownerId: string;
  let rateId: string;

  async function createListing(params: {
    id: string;
    price: string;
    currency: Currency;
  }): Promise<void> {
    await prisma.listing.create({
      data: {
        id: params.id,
        ownerId,
        transactionType: TransactionType.SALE,
        propertyType: PropertyType.APARTMENT,
        status: ListingStatus.ACTIVE,
        originalLanguage: Language.RU,
        price: params.price,
        currency: params.currency,
        cityId: CITY_ID_FX,
        promotionType: PromotionType.NORMAL,
        translations: {
          create: [
            {
              language: Language.RU,
              title: `fx-${params.id.slice(0, 8)}`,
              source: TranslationSource.USER,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_FX } });

    const owner = await prisma.user.create({ data: { phone: '+998900000199' } });
    ownerId = owner.id;

    // Свежайший курс (future fetchedAt) — гарантированно выбирается fxRate().
    const rate = await prisma.exchangeRate.create({
      data: {
        base: Currency.USD,
        quote: Currency.UZS,
        rate: RATE,
        source: ExchangeRateSource.MANUAL,
        fetchedAt: new Date('2099-01-01T00:00:00.000Z'),
      },
    });
    rateId = rate.id;

    await createListing({ id: ID.usdIn,  price: '50000.00',    currency: Currency.USD });
    await createListing({ id: ID.uzsIn,  price: '600000000.00', currency: Currency.UZS });
    await createListing({ id: ID.usdOut, price: '10000.00',    currency: Currency.USD });
    await createListing({ id: ID.uzsOut, price: '2400000000.00', currency: Currency.UZS });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_FX } });
    if (rateId) await prisma.exchangeRate.delete({ where: { id: rateId } });
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it('диапазон в USD включает эквивалентный по стоимости UZS-листинг (FX)', async () => {
    const res = await service.search({
      city_id: CITY_ID_FX,
      price_min: '45000',
      price_max: '110000',
      currency: Currency.USD,
      limit: 100,
    });
    const ids = res.data.map((l) => l.id);
    expect(ids).toContain(ID.usdIn);
    expect(ids).toContain(ID.uzsIn); // ключевое: раньше молча выпадал
    expect(ids).not.toContain(ID.usdOut);
    expect(ids).not.toContain(ID.uzsOut);
    expect(ids).toHaveLength(2);
  });

  it('диапазон в UZS включает эквивалентный по стоимости USD-листинг (FX)', async () => {
    const res = await service.search({
      city_id: CITY_ID_FX,
      price_min: '540000000', // 45k USD в UZS
      price_max: '1320000000', // 110k USD в UZS
      currency: Currency.UZS,
      limit: 100,
    });
    const ids = res.data.map((l) => l.id);
    expect(ids).toContain(ID.uzsIn);
    expect(ids).toContain(ID.usdIn);
    expect(ids).not.toContain(ID.usdOut);
    expect(ids).not.toContain(ID.uzsOut);
    expect(ids).toHaveLength(2);
  });
});
