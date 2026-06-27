import { Currency, Prisma, TransactionType } from '@prisma/client';
import { DistrictsService } from '../geo';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
import { SearchService } from './search.service';

/**
 * Юнит-тесты SearchService.priceDistribution: Prisma мокается, проверяется
 * детерминированная логика (пустой путь, построение 30 бакетов, niceCeil-потолок,
 * overflow) и форма SQL (обязательный `status = ACTIVE`). Живой инвариант
 * суммы — в search.service.distribution.int-spec.ts.
 */
describe('SearchService.priceDistribution (unit)', () => {
  let prisma: any;
  let service: SearchService;

  /** Статический SQL верхнеуровневого Prisma.Sql (без значений параметров). */
  function sqlText(sql: Prisma.Sql): string {
    return sql.strings.join(' ');
  }

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn() };
    const districts = {} as unknown as DistrictsService;
    const uploads = {} as unknown as UploadsService;
    service = new SearchService(
      prisma,
      new TranslationsService(prisma),
      districts,
      uploads,
    );
  });

  it('пустая выборка → max=0, пустые бакеты; bucket-запрос не выполняется', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ ceiling: null, total: 0 }]);

    const res = await service.priceDistribution({
      currency: Currency.UZS,
      transaction_type: TransactionType.RENT,
    });

    expect(res).toEqual({
      currency: 'UZS',
      transaction_type: 'RENT',
      min: 0,
      max: 0,
      buckets: [],
      overflow_count: 0,
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('строит 30 бакетов, niceCeil-потолок и overflow из строк width_bucket', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ ceiling: 95000, total: 10 }])
      .mockResolvedValueOnce([
        { b: 1, c: 3 },
        { b: 5, c: 2 },
        { b: 31, c: 1 }, // N+1 → overflow-хвост
      ]);

    const res = await service.priceDistribution({
      currency: Currency.USD,
      transaction_type: TransactionType.SALE,
    });

    expect(res.max).toBe(100000); // niceCeil(95000)
    expect(res.buckets.length).toBe(30);
    expect(res.buckets[0]).toEqual({ from: 0, to: 100000 / 30, count: 3 });
    expect(res.buckets[1].count).toBe(0); // незаполненный бакет присутствует
    expect(res.buckets[4].count).toBe(2);
    expect(res.overflow_count).toBe(1);

    const statsSql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sqlText(statsSql)).toContain("status = 'ACTIVE'");
  });
});
