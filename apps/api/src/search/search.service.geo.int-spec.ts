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

// Медиа-подпись здесь не тестируется (ADR-0086) — echo сохранённого url, без S3.
const uploadsStub = {
  resolveMediaUrl: async (_key: string | null | undefined, url: string) => url,
} as unknown as UploadsService;

/**
 * Integration-тесты гео-поиска SearchService на живом PostgreSQL+PostGIS
 * (TASK-082). В отличие от `search.service.spec.ts` (Prisma мокается, проверяется
 * форма SQL), здесь проверяется фактический результат PostGIS:
 *   - `/search/radius` (`ST_DWithin`) отсекает листинги вне радиуса и листинги
 *     без координат (NULL `location`);
 *   - `/search/near-me` (`ST_Distance` ASC) сортирует по реальной дистанции;
 *   - `/search/bounds` (`ST_MakeEnvelope`/`ST_Within`) отсекает листинги вне
 *     видимой области карты и листинги без координат (NULL `location`);
 *   - `distance_m` возвращается и численно соответствует разносу координат.
 *
 * `location` заполняется sync-триггером из latitude/longitude (DB_SCHEMA §14,
 * ADR-0003) — тест полагается на него. Требует БД из `DATABASE_URL` с
 * применёнными миграциями (см. jest.int.config.js). Изоляция — уникальный
 * `city_id`; данные удаляются в afterAll.
 */
describe('SearchService geo (integration, live PostGIS)', () => {
  const prisma = new PrismaService();
  const service = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

  // Уникальный город этого прогона — фильтр изолирует выдачу от чужих строк.
  const CITY_ID = '11111111-2222-4333-8444-666666666666';

  // Центр поиска — ~центр Ташкента.
  const CENTER = { lat: 41.31, lng: 69.28 };

  const ID = {
    near: 'aaaaaaaa-0000-4000-8000-000000000082', // ~111 м севернее центра
    mid: 'bbbbbbbb-0000-4000-8000-000000000082', // ~1 км
    far: 'cccccccc-0000-4000-8000-000000000082', // ~5 км
    outside: 'dddddddd-0000-4000-8000-000000000082', // ~20 км (вне радиуса 3 км)
    noGeo: 'eeeeeeee-0000-4000-8000-000000000082', // без координат → NULL location
  };

  let ownerId: string;

  async function createListing(params: {
    id: string;
    latitude: string | null;
    longitude: string | null;
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
        latitude: params.latitude,
        longitude: params.longitude,
        promotionType: PromotionType.NORMAL,
        translations: {
          create: [
            {
              language: Language.RU,
              title: `geo-${params.id.slice(0, 8)}`,
              source: TranslationSource.USER,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });

    const owner = await prisma.user.create({
      data: { phone: '+998900000082' },
    });
    ownerId = owner.id;

    // Сдвиг по широте: ~111 км/градус (долгота фиксирована = центр).
    await createListing({
      id: ID.near,
      latitude: '41.311000',
      longitude: '69.280000',
    }); // ~111 м
    await createListing({
      id: ID.mid,
      latitude: '41.319000',
      longitude: '69.280000',
    }); // ~1 км
    await createListing({
      id: ID.far,
      latitude: '41.355000',
      longitude: '69.280000',
    }); // ~5 км
    await createListing({
      id: ID.outside,
      latitude: '41.490000',
      longitude: '69.280000',
    }); // ~20 км
    await createListing({ id: ID.noGeo, latitude: null, longitude: null }); // без гео
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });
    if (ownerId) {
      await prisma.user.delete({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  });

  it('radius (ST_DWithin) returns only listings inside the radius, excludes no-geo rows', async () => {
    const result = await service.searchRadius({
      ...CENTER,
      radius_m: 3000,
      city_id: CITY_ID,
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toEqual(new Set([ID.near, ID.mid]));
    expect(result.meta.total).toBe(2);
    // far/outside за радиусом; noGeo — NULL location, не проходит ST_DWithin.
    expect(ids.has(ID.far)).toBe(false);
    expect(ids.has(ID.outside)).toBe(false);
    expect(ids.has(ID.noGeo)).toBe(false);

    // Каждый элемент в пределах радиуса и несёт distance_m (метры).
    for (const item of result.data) {
      expect(item.distance_m).not.toBeUndefined();
      expect(item.distance_m as number).toBeLessThanOrEqual(3000);
    }
  });

  it('near-me (ST_Distance) sorts by ascending distance and excludes no-geo rows', async () => {
    const result = await service.searchNearMe({
      ...CENTER,
      city_id: CITY_ID,
      limit: 100,
    });

    // Гео-листинги по возрастанию дистанции; noGeo отсутствует. Курсора нет.
    expect(result.data.map((d) => d.id)).toEqual([
      ID.near,
      ID.mid,
      ID.far,
      ID.outside,
    ]);
    expect(result.meta.next_cursor).toBeNull();

    const distances = result.data.map((d) => d.distance_m as number);
    for (let i = 1; i < distances.length; i += 1) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
    }
    // Ближайший ~111 м (±50 м допуск на сферическую геометрию geography).
    expect(distances[0]).toBeGreaterThan(60);
    expect(distances[0]).toBeLessThan(170);
  });

  it('bounds (ST_MakeEnvelope/ST_Within) returns only listings inside the bbox, excludes no-geo rows', async () => {
    // bbox охватывает near/mid/far (41.31..41.36), но не outside (~41.49).
    const result = await service.searchBounds({
      sw_lat: 41.3,
      sw_lng: 69.27,
      ne_lat: 41.36,
      ne_lng: 69.29,
      city_id: CITY_ID,
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toEqual(new Set([ID.near, ID.mid, ID.far]));
    expect(result.meta.total).toBe(3);
    // outside за пределами bbox; noGeo — NULL location, не проходит ST_Within.
    expect(ids.has(ID.outside)).toBe(false);
    expect(ids.has(ID.noGeo)).toBe(false);

    // bounds не несёт distance_m (центральной точки нет).
    for (const item of result.data) {
      expect(item.distance_m).toBeUndefined();
    }
  });

  it('bounds keeps a stable keyset across pages with no gaps or duplicates', async () => {
    const collected: string[] = [];
    let cursor: string | null | undefined;
    let pages = 0;

    do {
      const page = await service.searchBounds({
        sw_lat: 41.3,
        sw_lng: 69.27,
        ne_lat: 41.5, // широкий bbox — все 4 гео-листинга
        ne_lng: 69.29,
        city_id: CITY_ID,
        limit: 2,
        cursor: cursor ?? undefined,
      });
      collected.push(...page.data.map((d) => d.id));
      cursor = page.meta.next_cursor;
      pages += 1;
      expect(pages).toBeLessThanOrEqual(10);
    } while (cursor);

    expect(pages).toBe(2); // 4 гео-листинга по 2 на страницу
    expect(collected).toHaveLength(4);
    expect(new Set(collected).size).toBe(4); // без дублей
    expect(collected).not.toContain(ID.noGeo);
  });

  it('bounds full-extent bbox (whole world) returns all geo listings (mobile bug 2026-07-04)', async () => {
    // Регресс: geography-каст envelope шириной 360° вырождается (рёбра (-180,lat)→(180,lat)
    // — одна точка сферы) → GIST-префильтр && отбрасывал всё, total: 0.
    const result = await service.searchBounds({
      sw_lat: -85,
      sw_lng: -180,
      ne_lat: 85,
      ne_lng: 180,
      city_id: CITY_ID,
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toEqual(new Set([ID.near, ID.mid, ID.far, ID.outside]));
    expect(result.meta.total).toBe(4);
    expect(ids.has(ID.noGeo)).toBe(false);
  });

  it('bounds bbox wider than 180° of longitude still matches listings inside', async () => {
    // span 200° ≥ 180°: «короткий путь» дуг инвертирует полигон в geography —
    // без чанкинга префильтр либо пуст, либо покрывает комплемент.
    const result = await service.searchBounds({
      sw_lat: -85,
      sw_lng: -100,
      ne_lat: 85,
      ne_lng: 100, // Ташкент (69.28) внутри
      city_id: CITY_ID,
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toEqual(new Set([ID.near, ID.mid, ID.far, ID.outside]));
    expect(result.meta.total).toBe(4);
  });

  it('bounds bbox of exactly 180° of longitude still matches listings inside', async () => {
    // Ровно 180°: Δlng=180° на одной широте — дуга «короткого пути» неоднозначна
    // (через полюс), одиночный geography-каст ненадёжен → тоже путь чанкинга.
    const result = await service.searchBounds({
      sw_lat: -85,
      sw_lng: -90,
      ne_lat: 85,
      ne_lng: 90, // span ровно 180; Ташкент (69.28) внутри
      city_id: CITY_ID,
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toEqual(new Set([ID.near, ID.mid, ID.far, ID.outside]));
    expect(result.meta.total).toBe(4);
  });

  it('radius keeps a stable keyset across pages with no gaps or duplicates', async () => {
    const collected: string[] = [];
    let cursor: string | null | undefined;
    let pages = 0;

    do {
      const page = await service.searchRadius({
        ...CENTER,
        radius_m: 100000, // широкий радиус — попадают все гео-листинги (4 шт.)
        city_id: CITY_ID,
        limit: 2,
        cursor: cursor ?? undefined,
      });
      collected.push(...page.data.map((d) => d.id));
      cursor = page.meta.next_cursor;
      pages += 1;
      expect(pages).toBeLessThanOrEqual(10);
    } while (cursor);

    expect(pages).toBe(2); // 4 гео-листинга по 2 на страницу
    expect(collected).toHaveLength(4);
    expect(new Set(collected).size).toBe(4); // без дублей
    expect(collected).not.toContain(ID.noGeo);
  });
});

// ─── SearchService.searchPolygon integration tests ────────────────────────────

/**
 * Integration-тесты `searchPolygon` на живом PostgreSQL+PostGIS (TASK-193).
 * Проверяет:
 *   - листинг внутри полигона возвращается;
 *   - листинг за границей полигона исключается (`ST_Within` точный);
 *   - листинг без гео (NULL location) исключается;
 *   - `distance_m` НЕ возвращается (центральной точки нет);
 *   - стабильный keyset-курсор для нескольких страниц.
 *
 * Уникальный `city_id` изолирует данные от остальных тестов. Данные очищаются в
 * `afterAll`.
 */
describe('SearchService.searchPolygon (integration, live PostGIS)', () => {
  const prisma = new PrismaService();
  const service = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

  // Уникальный city_id для изоляции.
  const CITY_ID_POLY = '22222222-3333-4444-8555-777777777777';

  /**
   * Квадрат для тестового полигона: 41.30..41.32 lat × 69.27..69.29 lng.
   * Вершины против часовой стрелки; бэк замкнёт кольцо.
   */
  const SQUARE_POINTS = '41.30,69.27;41.30,69.29;41.32,69.29;41.32,69.27';

  const POLY_ID = {
    inside1: 'a1111111-0000-4000-8000-000000000193', // 41.31, 69.28 — внутри
    inside2: 'a2222222-0000-4000-8000-000000000193', // 41.305, 69.275 — внутри
    outside: 'a3333333-0000-4000-8000-000000000193', // 41.50, 69.28 — за периметром
    edgeOut: 'a4444444-0000-4000-8000-000000000193', // 41.33, 69.28 — чуть севернее
    noGeo: 'a5555555-0000-4000-8000-000000000193', // NULL location
  };

  let ownerIdPoly: string;

  async function createPolyListing(params: {
    id: string;
    latitude: string | null;
    longitude: string | null;
  }): Promise<void> {
    await prisma.listing.create({
      data: {
        id: params.id,
        ownerId: ownerIdPoly,
        transactionType: TransactionType.SALE,
        propertyType: PropertyType.APARTMENT,
        status: ListingStatus.ACTIVE,
        originalLanguage: Language.RU,
        price: '200000.00',
        currency: Currency.UZS,
        cityId: CITY_ID_POLY,
        latitude: params.latitude,
        longitude: params.longitude,
        promotionType: PromotionType.NORMAL,
        translations: {
          create: [
            {
              language: Language.RU,
              title: `poly-${params.id.slice(0, 8)}`,
              source: TranslationSource.USER,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_POLY } });

    const owner = await prisma.user.create({
      data: { phone: '+998900000193' },
    });
    ownerIdPoly = owner.id;

    // Внутри квадрата 41.30..41.32 × 69.27..69.29
    await createPolyListing({
      id: POLY_ID.inside1,
      latitude: '41.310000',
      longitude: '69.280000',
    });
    await createPolyListing({
      id: POLY_ID.inside2,
      latitude: '41.305000',
      longitude: '69.275500',
    });
    // За пределами квадрата
    await createPolyListing({
      id: POLY_ID.outside,
      latitude: '41.500000',
      longitude: '69.280000',
    });
    // Чуть севернее квадрата (lat = 41.33 > 41.32)
    await createPolyListing({
      id: POLY_ID.edgeOut,
      latitude: '41.330000',
      longitude: '69.280000',
    });
    // Без координат
    await createPolyListing({
      id: POLY_ID.noGeo,
      latitude: null,
      longitude: null,
    });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID_POLY } });
    if (ownerIdPoly) {
      await prisma.user.delete({ where: { id: ownerIdPoly } });
    }
    await prisma.$disconnect();
  });

  it('returns only listings inside the polygon; excludes outside, edge-out, and no-geo rows', async () => {
    const result = await service.searchPolygon({
      points: SQUARE_POINTS,
      city_id: CITY_ID_POLY,
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toEqual(new Set([POLY_ID.inside1, POLY_ID.inside2]));
    expect(result.meta.total).toBe(2);
    expect(ids.has(POLY_ID.outside)).toBe(false);
    expect(ids.has(POLY_ID.edgeOut)).toBe(false); // точность ST_Within, не bbox
    expect(ids.has(POLY_ID.noGeo)).toBe(false); // NULL location исключён
  });

  it('does not return distance_m (no center point for polygon search)', async () => {
    const result = await service.searchPolygon({
      points: SQUARE_POINTS,
      city_id: CITY_ID_POLY,
      limit: 100,
    });

    for (const item of result.data) {
      expect(item.distance_m).toBeUndefined();
    }
  });

  it('keyset cursor is stable across pages with no gaps or duplicates', async () => {
    // Расширенный полигон захватывает inside1 + inside2 + edgeOut (3 листинга).
    const widePoints =
      '41.30,69.27;41.30,69.29;41.34,69.29;41.34,69.27';

    const collected: string[] = [];
    let cursor: string | null | undefined;
    let pages = 0;

    do {
      const page = await service.searchPolygon({
        points: widePoints,
        city_id: CITY_ID_POLY,
        limit: 2,
        cursor: cursor ?? undefined,
      });
      collected.push(...page.data.map((d) => d.id));
      cursor = page.meta.next_cursor;
      pages += 1;
      expect(pages).toBeLessThanOrEqual(10);
    } while (cursor);

    expect(collected).toHaveLength(3); // inside1 + inside2 + edgeOut
    expect(new Set(collected).size).toBe(3); // без дублей
    expect(collected).not.toContain(POLY_ID.outside);
    expect(collected).not.toContain(POLY_ID.noGeo);
  });
});

// ─── SearchService.searchClusters integration tests ───────────────────────────

/**
 * Integration-тесты `searchClusters` на живом PostgreSQL+PostGIS (TASK-225,
 * ADR-0126). Проверяет:
 *   - низкий zoom сливает все гео-листинги в одну ячейку (агрегаты count/цена);
 *   - высокий zoom разносит тройку близких листингов и дальний листинг по
 *     разным ячейкам (инвариант: дальний — всегда отдельно, сумма count = 4);
 *   - применяются фильтры §9 (price_max);
 *   - full-extent bbox работает через чанкованный префильтр (TASK-226).
 *
 * НЕ ассертить точные значения min_price/avg_price — в стендовой БД может
 * существовать строка курса ЦБУ (FX-конвертация в USD изменит числа); ассерты
 * только на count/геометрию/инварианты.
 *
 * Уникальный `city_id` изолирует данные от остальных тестов. Данные очищаются в
 * `afterAll`.
 */
describe('SearchService.searchClusters (integration, live PostGIS)', () => {
  const prisma = new PrismaService();
  const service = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

  // Уникальный city_id для изоляции.
  const CITY_ID = '11111111-2222-4333-8444-777777777777';

  const ID = {
    c1: 'c1111111-0000-4000-8000-000000000083',
    c2: 'c2222222-0000-4000-8000-000000000083',
    c3: 'c3333333-0000-4000-8000-000000000083',
    far: 'c4444444-0000-4000-8000-000000000083',
    noGeo: 'c5555555-0000-4000-8000-000000000083',
  };

  let ownerId: string;

  async function createListing(params: {
    id: string;
    latitude: string | null;
    longitude: string | null;
    price: string;
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
        currency: Currency.UZS,
        cityId: CITY_ID,
        latitude: params.latitude,
        longitude: params.longitude,
        promotionType: PromotionType.NORMAL,
        translations: {
          create: [
            {
              language: Language.RU,
              title: `cluster-${params.id.slice(0, 8)}`,
              source: TranslationSource.USER,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });

    const owner = await prisma.user.create({
      data: { phone: '+998900000083' },
    });
    ownerId = owner.id;

    // Тройка в одной ячейке любого разумного зума (≤ 0.002° разброса) + дальний.
    await createListing({ id: ID.c1, latitude: '41.311000', longitude: '69.280000', price: '100000.00' });
    await createListing({ id: ID.c2, latitude: '41.311500', longitude: '69.280500', price: '200000.00' });
    await createListing({ id: ID.c3, latitude: '41.312000', longitude: '69.281000', price: '300000.00' });
    await createListing({ id: ID.far, latitude: '41.490000', longitude: '69.280000', price: '900000.00' });
    await createListing({ id: ID.noGeo, latitude: null, longitude: null, price: '100000.00' });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });
    if (ownerId) {
      await prisma.user.delete({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  });

  it('low zoom merges everything into one cell with count and price aggregates', async () => {
    const result = await service.searchClusters({
      sw_lat: 41.0, sw_lng: 69.0, ne_lat: 41.6, ne_lng: 69.5,
      zoom: 4, city_id: CITY_ID,
    });
    // cell(zoom 4) = 360/16/8 = 2.8125°. zoom 5 (1.40625°) технически тоже
    // «в одной ячейке» по размеру, но ST_SnapToGrid округляет К БЛИЖАЙШЕМУ
    // узлу абсолютной сетки (не относительно данных) — far (41.49) попадает
    // ровно у границы бина на zoom 5 и уезжает в соседнюю ячейку; zoom 4 даёт
    // запас и надёжно сливает все 4 гео-листинга в одну ячейку.
    expect(result.data).toHaveLength(1);
    expect(result.data[0].count).toBe(4);
    expect(result.data[0].min_price).toBeLessThanOrEqual(result.data[0].avg_price);
    // Центроид — внутри разброса фикстур.
    expect(result.data[0].latitude).toBeGreaterThan(41.3);
    expect(result.data[0].latitude).toBeLessThan(41.5);
  });

  it('high zoom splits near-triple and far listing into separate cells', async () => {
    const result = await service.searchClusters({
      sw_lat: 41.0, sw_lng: 69.0, ne_lat: 41.6, ne_lng: 69.5,
      zoom: 12, city_id: CITY_ID,
    });
    // cell(zoom 12) ≈ 0.011° — тройка (разброс ≤0.002°) может лечь в 1-2 смежные
    // ячейки в зависимости от выравнивания сетки; far — всегда отдельно.
    const total = result.data.reduce((s, c) => s + c.count, 0);
    expect(total).toBe(4);
    expect(result.data.length).toBeGreaterThanOrEqual(2);
    const farCell = result.data.find((c) => Math.abs(c.latitude - 41.49) < 0.01);
    expect(farCell?.count).toBe(1);
  });

  it('applies §9 filters (price_max drops the expensive far listing)', async () => {
    const result = await service.searchClusters({
      sw_lat: 41.0, sw_lng: 69.0, ne_lat: 41.6, ne_lng: 69.5,
      zoom: 5, city_id: CITY_ID, price_max: '500000',
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].count).toBe(3); // far (900000) отфильтрован
  });

  it('full-extent bbox works (chunked prefilter from TASK-226)', async () => {
    const result = await service.searchClusters({
      sw_lat: -85, sw_lng: -180, ne_lat: 85, ne_lng: 180,
      zoom: 2, city_id: CITY_ID,
    });
    expect(result.data.reduce((s, c) => s + c.count, 0)).toBe(4);
  });

  it('bbox with no matching listings returns empty data array (contract)', async () => {
    // Контракт для мобилки: пустая ячейка сетки → { data: [], currency }, не 500.
    const result = await service.searchClusters({
      sw_lat: -10.0, sw_lng: 10.0, ne_lat: -9.0, ne_lng: 11.0, // пустой океан
      zoom: 10, city_id: CITY_ID,
    });
    expect(result.data).toEqual([]);
    expect(result.currency).toBe(Currency.USD);
  });
});
