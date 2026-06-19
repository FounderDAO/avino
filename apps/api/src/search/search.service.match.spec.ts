import { SearchService } from './search.service';

describe('SearchService.matchNewlyActiveListings (polygon)', () => {
  const since = new Date('2026-06-01T00:00:00.000Z');
  const until = new Date('2026-06-19T00:00:00.000Z');
  let queryRaw: jest.Mock;
  let service: SearchService;

  beforeEach(() => {
    queryRaw = jest.fn().mockResolvedValue([]);
    const prisma = { $queryRaw: queryRaw } as any;
    // SearchService constructor: (prisma, translations, districts, uploads)
    service = new SearchService(prisma, {} as any, {} as any, {} as any);
  });

  it('queries (scalar-only) when no polygon present', async () => {
    await service.matchNewlyActiveListings({ city_id: 'x' }, since, until, 50);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('queries with an ST_Within clause when polygon is valid', async () => {
    await service.matchNewlyActiveListings(
      { points: '41.30,69.27;41.31,69.28;41.29,69.29' },
      since,
      until,
      50,
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sql = queryRaw.mock.calls[0][0] as { strings: string[] };
    expect(sql.strings.join(' ')).toContain('ST_Within');
  });

  it('skips the run (returns [] without querying) when polygon is corrupt', async () => {
    const result = await service.matchNewlyActiveListings(
      { points: '41.30,69.27' },
      since,
      until,
      50,
    );
    expect(result).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
