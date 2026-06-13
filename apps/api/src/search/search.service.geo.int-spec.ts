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
  const service = new SearchService(prisma, new TranslationsService(prisma));

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
