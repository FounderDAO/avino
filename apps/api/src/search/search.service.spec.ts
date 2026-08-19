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
import { DistrictsService } from '../geo';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
import type { SearchListingsQueryDto } from './dto/search-listings.dto';
import { clusterCellSizeDeg, SearchService } from './search.service';

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
  const REGION_ID = '44444444-4444-4444-4444-444444444444';
  const OWNER_ID = '55555555-5555-5555-5555-555555555555';

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
      // sort_val — вторичный ключ сортировки (TASK-207); для date_desc = created_at.
      sort_val: new Date('2026-06-01T12:00:00.000Z'),
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
      isBasement: false,
      cityId: CITY_ID,
      districtId: DISTRICT_ID,
      address: 'ул. Амира Темура, 15',
      latitude: new Prisma.Decimal('41.311111'),
      longitude: new Prisma.Decimal('69.281111'),
      promotionType: PromotionType.NORMAL,
      promotionExpiresAt: null,
      originalLanguage: Language.RU,
      createdAt: new Date('2026-06-01T12:00:00.000Z'),
      viewsCount: 0,
      _count: { favorites: 0 },
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
      // Курс ЦБУ для FX-нормализации ценового фильтра; по умолчанию нет курса
      // (деградация к сравнению в пределах одной валюты). Тесты FX его переопределяют.
      exchangeRate: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    // DistrictsService застаблен — резолв district_name проверяется в int-spec.
    const districts = {
      namesByIds: jest.fn().mockResolvedValue(new Map()),
      pickName: jest.fn().mockReturnValue(null),
    } as unknown as DistrictsService;
    // UploadsService застаблен: обложка всегда через свежий presigned URL
    // (ADR-0086). Echo (key ?? url) — существующие thumbnail-ассерты валидны.
    const uploads = {
      resolveMediaUrl: jest.fn((key: string | null | undefined, url: string) =>
        Promise.resolve(key ?? url),
      ),
    } as unknown as UploadsService;
    service = new SearchService(
      prisma,
      new TranslationsService(prisma),
      districts,
      uploads,
    );
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
      bathrooms: null,
      is_basement: false,
      area: null,
      lot_area: null,
      city_id: CITY_ID,
      district_id: DISTRICT_ID,
      address: 'ул. Амира Темура, 15',
      latitude: '41.311111',
      longitude: '69.281111',
      promotion_type: PromotionType.NORMAL,
      promotion_expires_at: null,
      effective_tier: PromotionType.NORMAL,
      language: Language.RU,
      title: '3-комн в центре',
      thumbnail_url: 'https://cdn/l1_t.webp',
      thumbnails: ['https://cdn/l1_t.webp'],
      district_name: null,
      created_at: '2026-06-01T12:00:00.000Z',
      views_count: 0,
      likes_count: 0,
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
    // TASK-207: вторичный ключ обёрнут в () для поддержки произвольных выражений (COALESCE и т.д.).
    expect(text).toContain('DESC, (created_at) DESC, id DESC');
  });

  it('builds basic filters and an FX-normalized cross-currency price range', async () => {
    // Курс есть → цена каждого листинга приводится к валюте фильтра (USD), а не
    // отсекается равенством currency=USD (иначе UZS-объявления, показанные юзеру
    // как «≈ $X», молча выпадали бы из выдачи).
    prisma.exchangeRate.findFirst.mockResolvedValue({ rate: '12000' });
    mockQuery([], 0);

    await service.search({
      transaction_type: TransactionType.RENT,
      property_type: [PropertyType.HOUSE],
      price_min: '1000.00',
      price_max: '5000.00',
      currency: Currency.USD,
      city_id: CITY_ID,
      district_id: DISTRICT_ID,
    });

    const pageSql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    const text = sqlText(pageSql);
    // FX-нормализация UZS→USD в самом условии диапазона.
    expect(text).toContain("CASE WHEN currency = 'UZS' THEN price /");
    // Валюта участвует только как курс/направление — БЕЗ жёсткого равенства,
    // которое исключало бы вторую валюту.
    expect(text).not.toContain('currency::text =');
    expect(pageSql.values).toEqual(
      expect.arrayContaining([
        TransactionType.RENT,
        PropertyType.HOUSE,
        CITY_ID,
        DISTRICT_ID,
        '12000',
        '1000.00',
        '5000.00',
      ]),
    );
  });

  it('degrades a price range to a single-currency compare when no FX rate exists', async () => {
    // Нет строки курса → безопасная деградация: сравнение в пределах одной валюты
    // (кросс-валютное сравнение сырых чисел было бы бессмысленным).
    prisma.exchangeRate.findFirst.mockResolvedValue(null);
    mockQuery([], 0);

    await service.search({
      price_min: '1000.00',
      price_max: '5000.00',
      currency: Currency.USD,
    });

    const pageSql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    const text = sqlText(pageSql);
    expect(text).toContain('currency::text =');
    expect(text).toContain('price >=');
    expect(text).toContain('price <=');
    expect(pageSql.values).toEqual(
      expect.arrayContaining([Currency.USD, '1000.00', '5000.00']),
    );
  });

  it('filters by region_id using a districts sub-select', async () => {
    mockQuery([], 0);

    await service.search({ region_id: REGION_ID } as any);

    const pageSql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sqlText(pageSql)).toContain(
      'district_id IN (SELECT id FROM districts WHERE region_id =',
    );
    expect(pageSql.values).toEqual(expect.arrayContaining([REGION_ID]));
  });

  it('filters by agent_id (owner) — страница агента (ADR-0140)', async () => {
    mockQuery([], 0);

    await service.search({ agent_id: OWNER_ID } as any);

    const pageSql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sqlText(pageSql)).toContain('owner_id =');
    expect(pageSql.values).toEqual(expect.arrayContaining([OWNER_ID]));
  });

  it('does not add an owner_id condition when agent_id is absent', async () => {
    mockQuery([], 0);

    await service.search({});

    const pageSql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sqlText(pageSql)).not.toContain('owner_id');
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
        sort_val: new Date('2026-06-01T00:00:00.000Z'),
      }),
      pageRow({
        id: 'l1',
        created_at: new Date('2026-06-02T00:00:00.000Z'),
        tier_rank: 1,
        sort_val: new Date('2026-06-02T00:00:00.000Z'),
      }),
      pageRow({
        id: 'l2',
        created_at: new Date('2026-06-03T00:00:00.000Z'),
        tier_rank: 0,
        sort_val: new Date('2026-06-03T00:00:00.000Z'),
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

    // TASK-207: курсор содержит { rank, val, id }; val — ISO-дата (date_desc).
    // Последний показанный элемент — l1 (rank=1, sort_val=2026-06-02).
    const decoded = JSON.parse(
      Buffer.from(first.meta.next_cursor as string, 'base64url').toString(
        'utf8',
      ),
    );
    expect(decoded).toEqual({
      rank: 1,
      val: '2026-06-02T00:00:00.000Z',
      id: 'l1',
    });

    mockQuery([], 9);
    await service.search({
      cursor: first.meta.next_cursor as string,
      limit: 2,
    });
    const nextPageSql = prisma.$queryRaw.mock.calls[2][0] as Prisma.Sql;
    // Keyset «строго после позиции» по (tier_rank, secondary, id): rank, val, id в params.
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

  it('rejects a structurally-invalid cursor (missing rank and/or val)', async () => {
    // TASK-207: новая форма курсора { rank, val, id }; отсутствие rank → 400.
    const token = Buffer.from(
      JSON.stringify({ val: '2026-06-02T00:00:00.000Z', id: 'l1' }),
      'utf8',
    ).toString('base64url');
    await expectCode(
      service.search({ cursor: token }),
      ApiErrorCode.VALIDATION_ERROR,
    );
  });

  it('returns thumbnails[] with up to 3 signed URLs, thumbnail_url === thumbnails[0]', async () => {
    mockQuery([pageRow()], 1);
    prisma.listing.findMany.mockResolvedValue([
      dbRow({
        media: [
          { url: 'https://cdn/l1.webp', thumbnailUrl: 'https://cdn/l1_t.webp', storageKey: null },
          { url: 'https://cdn/l1b.webp', thumbnailUrl: null, storageKey: 'media/l1b.webp' },
          { url: 'https://cdn/l1c.webp', thumbnailUrl: 'https://cdn/l1c_t.webp', storageKey: null },
        ],
      }),
    ]);

    const result = await service.search({});
    const item = result.data[0];

    // uploads mock: (null, url) → url; (key, url) → key
    expect(item.thumbnails).toEqual([
      'https://cdn/l1_t.webp',
      'media/l1b.webp',
      'https://cdn/l1c_t.webp',
    ]);
    expect(item.thumbnail_url).toBe(item.thumbnails[0]);
  });

  it('returns thumbnails: [] and thumbnail_url: null when listing has no media', async () => {
    mockQuery([pageRow()], 1);
    prisma.listing.findMany.mockResolvedValue([dbRow({ media: [] })]);

    const result = await service.search({});
    const item = result.data[0];

    expect(item.thumbnails).toEqual([]);
    expect(item.thumbnail_url).toBeNull();
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

  describe('searchBounds', () => {
    // sw — юго-западный угол, ne — северо-восточный (Ташкент).
    const BOX = { sw_lat: 41.2, sw_lng: 69.1, ne_lat: 41.4, ne_lng: 69.4 };

    it('filters by the map envelope and keeps promotion ordering + keyset', async () => {
      mockQuery([pageRow()], 1);
      prisma.listing.findMany.mockResolvedValue([dbRow()]);

      await service.searchBounds(BOX);

      const pageSql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
      const text = sqlText(pageSql);
      // bbox-предикат: NULL-location отсекается, envelope + точный ST_Within.
      expect(text).toContain('location IS NOT NULL');
      expect(text).toContain('ST_MakeEnvelope(');
      expect(text).toContain('ST_Within(location::geometry,');
      // Базовый ACTIVE-фильтр и promotion-приоритетный ORDER BY сохранены.
      expect(text).toContain("status = 'ACTIVE'");
      expect(text).toContain('DESC, created_at DESC, id DESC');
      // Параметры envelope биндятся в порядке (xmin=sw_lng, ymin=sw_lat, xmax=ne_lng, ymax=ne_lat).
      expect(pageSql.values).toEqual(
        expect.arrayContaining([
          BOX.sw_lng,
          BOX.sw_lat,
          BOX.ne_lng,
          BOX.ne_lat,
        ]),
      );
    });

    it('does not attach distance_m (no center point in bounds)', async () => {
      mockQuery([pageRow()], 1);
      prisma.listing.findMany.mockResolvedValue([dbRow()]);

      const result = await service.searchBounds(BOX);

      expect(result.data[0].distance_m).toBeUndefined();
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

      const result = await service.searchBounds({ ...BOX, limit: 2 });

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

  describe('фильтр блокировок (Apple 1.2)', () => {
    const VIEWER_ID = '66666666-6666-6666-6666-666666666666';
    const baseQuery = (): SearchListingsQueryDto =>
      ({}) as SearchListingsQueryDto;

    it('с viewerId в WHERE добавляется подзапрос user_blocks', () => {
      const sql = (
        service as unknown as {
          buildWhereSql: (...args: unknown[]) => Prisma.Sql;
        }
      ).buildWhereSql(baseQuery(), undefined, VIEWER_ID);
      expect(sql.strings.join('?')).toContain(
        'owner_id NOT IN (SELECT blocked_id FROM user_blocks WHERE blocker_id =',
      );
      expect(sql.values).toContain(VIEWER_ID);
    });

    it('без viewerId подзапроса нет (гость)', () => {
      const sql = (
        service as unknown as {
          buildWhereSql: (...args: unknown[]) => Prisma.Sql;
        }
      ).buildWhereSql(baseQuery(), undefined, undefined);
      expect(sql.strings.join('?')).not.toContain('user_blocks');
    });
  });
});

describe('clusterCellSizeDeg (TASK-225)', () => {
  it('is ~8 cells per 256px tile and halves with each zoom step', () => {
    expect(clusterCellSizeDeg(0)).toBeCloseTo(45); // 360 / 1 / 8
    expect(clusterCellSizeDeg(1)).toBeCloseTo(22.5);
    expect(clusterCellSizeDeg(5)).toBeCloseTo(360 / 32 / 8);
    for (let z = 0; z < 22; z += 1) {
      expect(clusterCellSizeDeg(z + 1)).toBeCloseTo(clusterCellSizeDeg(z) / 2);
    }
  });
});
