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
 * Юнит-тесты SearchService (TASK-080 + TASK-081). Prisma мокается.
 *
 * Сортировка/keyset считаются raw-SQL (ORDER BY по time-guarded тиру — ADR-0004),
 * поэтому ранжирование проверяется по форме сгенерированного SQL (ранг-CASE,
 * ORDER BY, keyset-условие с тиром), а гидратация/маппинг карточки — через
 * `listing.findMany`. Проверяются: фильтр `status = ACTIVE` + базовые фильтры,
 * диапазон цены в пределах валюты, promotion-приоритетный ORDER BY, keyset с
 * тиром (next_cursor, условие следующей страницы), time-guarded `effective_tier`,
 * snake_case карточка и 400 на повреждённый cursor.
 */
describe('SearchService', () => {
  const CITY_ID = '22222222-2222-2222-2222-222222222222';
  const DISTRICT_ID = '33333333-3333-3333-3333-333333333333';

  let prisma: any;
  let service: SearchService;

  /** Статический SQL верхнеуровневого Prisma.Sql (без значений параметров). */
  function sqlText(sql: Prisma.Sql): string {
    return sql.strings.join(' ');
  }

  function pageRow(over: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'l1',
      created_at: new Date('2026-06-01T12:00:00.000Z'),
      tier_rank: 0,
      ...over,
    };
  }

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
      media: [
        { url: 'https://cdn/l1.webp', thumbnailUrl: 'https://cdn/l1_t.webp' },
      ],
      ...over,
    };
  }

  /** Очередь ответов $queryRaw: [page, count] на каждый вызов search(). */
  function mockQuery(page: unknown[], total: number) {
    prisma.$queryRaw
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce([{ count: total }]);
  }

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      listing: {
        findMany: jest.fn().mockResolvedValue([]),
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
    mockQuery([pageRow()], 1);
    prisma.listing.findMany.mockResolvedValue([dbRow()]);

    const result = await service.search({});

    const pageSql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sqlText(pageSql)).toContain("status = 'ACTIVE'");
    expect(prisma.listing.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['l1'] },
    });
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

  it('orders by a time-guarded promotion tier, then created_at desc, id desc', async () => {
    mockQuery([pageRow()], 1);
    prisma.listing.findMany.mockResolvedValue([dbRow()]);

    await service.search({});

    const text = sqlText(prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql);
    // Time-guarded ранг: активный VIP=2 > активный TOP=1 > всё остальное=0.
    expect(text).toContain("promotion_type = 'VIP'");
    expect(text).toContain("promotion_type = 'TOP'");
    expect(text).toContain('promotion_expires_at > now()');
    expect(text).toContain('ORDER BY');
    expect(text).toContain('DESC, created_at DESC, id DESC');
  });

  it('builds basic filters and a currency-scoped price range as SQL params', async () => {
    mockQuery([], 0);

    await service.search({
      transaction_type: TransactionType.RENT,
      property_type: PropertyType.HOUSE,
      price_min: '1000.00',
      price_max: '5000.00',
      currency: Currency.USD,
      city_id: CITY_ID,
      district_id: DISTRICT_ID,
    });

    const pageSql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(pageSql.values).toEqual(
      expect.arrayContaining([
        TransactionType.RENT,
        PropertyType.HOUSE,
        Currency.USD,
        CITY_ID,
        DISTRICT_ID,
        '1000.00',
        '5000.00',
      ]),
    );
    expect(sqlText(pageSql)).toContain('price >=');
    expect(sqlText(pageSql)).toContain('price <=');
  });

  it('treats an expired promotion as NORMAL but keeps an active one (card)', async () => {
    mockQuery(
      [pageRow({ id: 'expired' }), pageRow({ id: 'active', tier_rank: 1 })],
      2,
    );
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

  it('emits a tier-aware next_cursor and applies the keyset on the next page', async () => {
    const rows = [
      pageRow({
        id: 'l0',
        created_at: new Date('2026-06-01T00:00:00.000Z'),
        tier_rank: 2,
      }),
      pageRow({
        id: 'l1',
        created_at: new Date('2026-06-02T00:00:00.000Z'),
        tier_rank: 1,
      }),
      pageRow({
        id: 'l2',
        created_at: new Date('2026-06-03T00:00:00.000Z'),
        tier_rank: 0,
      }),
    ];
    mockQuery(rows, 9); // limit 2 → take 3, hasMore
    prisma.listing.findMany.mockResolvedValue([
      dbRow({ id: 'l0' }),
      dbRow({ id: 'l1' }),
    ]);

    const first = await service.search({ limit: 2 });
    expect(first.data).toHaveLength(2);
    expect((prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql).values).toContain(
      3,
    ); // take = limit + 1
    expect(first.meta).toMatchObject({ limit: 2, total: 9 });
    expect(first.meta.next_cursor).toBeTruthy();

    // Курсор указывает на последний показанный элемент (l1, rank 1, 2026-06-02).
    const decoded = JSON.parse(
      Buffer.from(first.meta.next_cursor as string, 'base64url').toString(
        'utf8',
      ),
    );
    expect(decoded).toEqual({
      rank: 1,
      createdAt: '2026-06-02T00:00:00.000Z',
      id: 'l1',
    });

    mockQuery([], 9);
    await service.search({
      cursor: first.meta.next_cursor as string,
      limit: 2,
    });
    const nextPageSql = prisma.$queryRaw.mock.calls[2][0] as Prisma.Sql;
    // Keyset «строго после позиции» по (tier_rank, created_at, id).
    expect(nextPageSql.values).toEqual(
      expect.arrayContaining([1, '2026-06-02T00:00:00.000Z', 'l1']),
    );
  });

  it('rejects a malformed cursor with VALIDATION_ERROR', async () => {
    await expectCode(
      service.search({ cursor: 'not-a-valid-token' }),
      ApiErrorCode.VALIDATION_ERROR,
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects a structurally-invalid cursor (missing tier rank)', async () => {
    const token = Buffer.from(
      JSON.stringify({ createdAt: '2026-06-02T00:00:00.000Z', id: 'l1' }),
      'utf8',
    ).toString('base64url');
    await expectCode(
      service.search({ cursor: token }),
      ApiErrorCode.VALIDATION_ERROR,
    );
  });

  describe('searchRadius', () => {
    const POINT = { lat: 41.31, lng: 69.28, radius_m: 2000 };

    it('filters by ST_DWithin around the point and keeps promotion ordering + keyset', async () => {
      mockQuery([pageRow()], 1);
      prisma.listing.findMany.mockResolvedValue([dbRow()]);

      await service.searchRadius(POINT);

      const pageSql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
      const text = sqlText(pageSql);
      // Гео-предикат по GIST: NULL-location отсекается, ST_DWithin в метрах.
      expect(text).toContain('location IS NOT NULL');
      expect(text).toContain('ST_DWithin(location,');
      // Точка строится как geography(Point,4326) с порядком (lng, lat).
      expect(text).toContain('ST_SetSRID(ST_MakePoint(');
      expect(text).toContain('4326)::geography');
      // Базовый ACTIVE-фильтр и promotion-приоритетный ORDER BY сохранены.
      expect(text).toContain("status = 'ACTIVE'");
      expect(text).toContain('DESC, created_at DESC, id DESC');
      // Параметры точки/радиуса биндятся (lng первой, затем lat), radius_m в метрах.
      expect(pageSql.values).toEqual(
        expect.arrayContaining([POINT.lng, POINT.lat, POINT.radius_m]),
      );
    });

    it('attaches a rounded distance_m to each card', async () => {
      mockQuery([pageRow({ distance_m: 1234.56 })], 1);
      prisma.listing.findMany.mockResolvedValue([dbRow()]);

      const result = await service.searchRadius(POINT);

      expect(result.data[0].distance_m).toBe(1235);
    });

    it('emits a tier-aware next_cursor like /search (limit + 1 fetched)', async () => {
      mockQuery(
        [
          pageRow({ id: 'l0', tier_rank: 2 }),
          pageRow({ id: 'l1', tier_rank: 1 }),
          pageRow({ id: 'l2', tier_rank: 0 }),
        ],
        9,
      );
      prisma.listing.findMany.mockResolvedValue([
        dbRow({ id: 'l0' }),
        dbRow({ id: 'l1' }),
      ]);

      const result = await service.searchRadius({ ...POINT, limit: 2 });

      expect(
        (prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql).values,
      ).toContain(3); // take = limit + 1
      expect(result.data).toHaveLength(2);
      expect(result.meta.next_cursor).toBeTruthy();
    });
  });

  describe('searchNearMe', () => {
    const POINT = { lat: 41.31, lng: 69.28 };

    it('orders by ST_Distance ascending with promotion as a tie-breaker, single page', async () => {
      mockQuery([pageRow({ distance_m: 50.4 })], 1);
      prisma.listing.findMany.mockResolvedValue([dbRow()]);

      const result = await service.searchNearMe(POINT);

      const pageSql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
      const text = sqlText(pageSql);
      expect(text).toContain('location IS NOT NULL');
      // Дистанция — первичный ключ сортировки (ST_Distance ASC), промо вторичен.
      expect(text).toContain('ORDER BY ST_Distance(location,');
      expect(text).toContain('ASC,');
      expect(text).toContain('DESC, created_at DESC, id DESC');
      // near-me — одна страница, keyset не применяется.
      expect(result.meta.next_cursor).toBeNull();
      expect(result.data[0].distance_m).toBe(50);
    });

    it('does not fetch an extra row (no keyset look-ahead)', async () => {
      mockQuery([], 0);

      await service.searchNearMe({ ...POINT, limit: 5 });

      const pageSql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
      // LIMIT — ровно limit (без +1), курсорного условия нет.
      expect(pageSql.values).toContain(5);
      expect(pageSql.values).not.toContain(6);
      expect(sqlText(pageSql)).not.toContain('ST_DWithin');
    });
  });
});
