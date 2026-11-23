import { PropertyType, TransactionType } from '@prisma/client';
import { DistrictsService } from '../geo';
import { PrismaService } from '../prisma';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
import { SearchService } from './search.service';

const D1 = 'd0000000-0000-4000-8000-000000000012';
const D2 = 'd0000000-0000-4000-8000-000000000002';
const D3 = 'e0000000-0000-4000-8000-000000000185';
const TASHKENT = 'c0000000-0000-4000-8000-000000000011';
const FERGANA = 'c0000000-0000-4000-8000-000000000013';

describe('SearchService.facets (SEO AUD-12)', () => {
  function setup() {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ count: 120 }])
        .mockResolvedValueOnce([
          { value: 'SALE', count: 80 },
          { value: 'RENT', count: 40 },
        ])
        .mockResolvedValueOnce([{ value: 'APARTMENT', count: 100 }])
        .mockResolvedValueOnce([
          { value: D1, count: 30 },
          { value: D2, count: 10 },
          { value: D3, count: 5 },
        ]),
      district: {
        findMany: jest.fn().mockResolvedValue([
          { id: D1, code: 'yunusobod', nameUz: 'Yunusobod', nameRu: 'Юнусабад', nameEn: 'Yunusabad', regionId: TASHKENT },
          { id: D2, code: 'chilonzor', nameUz: 'Chilonzor', nameRu: 'Чиланзар', nameEn: 'Chilanzar', regionId: TASHKENT },
          { id: D3, code: 'fargona-185', nameUz: 'Farg‘ona', nameRu: 'Фергана', nameEn: 'Fergana', regionId: FERGANA },
        ]),
      },
      region: {
        findMany: jest.fn().mockResolvedValue([
          { id: FERGANA, code: 'fargona', nameUz: 'Farg‘ona', nameRu: 'Ферганская', nameEn: 'Fergana' },
          { id: TASHKENT, code: 'toshkent-shahri', nameUz: 'Toshkent', nameRu: 'Ташкент', nameEn: 'Tashkent' },
        ]),
      },
      exchangeRate: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new SearchService(
      prisma as unknown as PrismaService,
      {} as TranslationsService,
      {} as DistrictsService,
      {} as UploadsService,
    );
    return { service, prisma };
  }

  it('counts total, deal, type, district and region (region summed over its districts)', async () => {
    const { service } = setup();
    const facets = await service.facets({ transaction_type: TransactionType.SALE } as never);
    expect(facets.total).toBe(120);
    expect(facets.by_transaction_type).toEqual([
      { value: TransactionType.SALE, count: 80 },
      { value: TransactionType.RENT, count: 40 },
    ]);
    expect(facets.by_property_type).toEqual([{ value: PropertyType.APARTMENT, count: 100 }]);
    expect(facets.by_district[0]).toMatchObject({ id: D1, code: 'yunusobod', region_id: TASHKENT, count: 30 });
    expect(facets.by_region).toEqual([
      expect.objectContaining({ id: TASHKENT, count: 40 }),
      expect.objectContaining({ id: FERGANA, count: 5 }),
    ]);
  });

  it('uses the same WHERE as /search for every group (filters and status)', async () => {
    const { service, prisma } = setup();
    await service.facets({ transaction_type: TransactionType.SALE } as never);
    const sqls = prisma.$queryRaw.mock.calls.map((c: unknown[]) => (c[0] as { sql: string }).sql);
    for (const sql of sqls) expect(sql).toContain("status = 'ACTIVE'");
    expect(sqls[3]).toContain('district_id IS NOT NULL');
  });
});
