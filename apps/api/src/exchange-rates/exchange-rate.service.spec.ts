import { ExchangeRateService } from './exchange-rate.service';

jest.mock('./cbu.provider', () => ({
  fetchCbuUsdRate: jest.fn(),
}));
import { fetchCbuUsdRate } from './cbu.provider';

function makeService() {
  const prisma: any = {
    exchangeRate: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const config: any = { get: jest.fn().mockReturnValue('https://cbu.uz') };
  const service = new ExchangeRateService(prisma, config);
  return { service, prisma, config };
}

describe('ExchangeRateService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getCurrent maps the latest row to snake_case view', async () => {
    const { service, prisma } = makeService();
    prisma.exchangeRate.findFirst.mockResolvedValue({
      base: 'USD', quote: 'UZS', rate: '12650.180000',
      source: 'CBU', fetchedAt: new Date('2026-06-19T06:00:00Z'),
    });
    const view = await service.getCurrent();
    expect(prisma.exchangeRate.findFirst).toHaveBeenCalledWith({
      where: { base: 'USD', quote: 'UZS' },
      orderBy: { fetchedAt: 'desc' },
    });
    expect(view).toEqual({
      base: 'USD', quote: 'UZS', rate: '12650.180000',
      fetched_at: '2026-06-19T06:00:00.000Z', source: 'CBU',
    });
  });

  it('getCurrent returns null when no rows', async () => {
    const { service, prisma } = makeService();
    prisma.exchangeRate.findFirst.mockResolvedValue(null);
    expect(await service.getCurrent()).toBeNull();
  });

  it('refreshFromCbu inserts a CBU row with the fetched rate', async () => {
    const { service, prisma } = makeService();
    (fetchCbuUsdRate as jest.Mock).mockResolvedValue('12700.50');
    await service.refreshFromCbu();
    expect(prisma.exchangeRate.create).toHaveBeenCalledWith({
      data: { base: 'USD', quote: 'UZS', rate: '12700.50', source: 'CBU' },
    });
  });

  it('refreshFromCbu does NOT insert when the fetch fails', async () => {
    const { service, prisma } = makeService();
    (fetchCbuUsdRate as jest.Mock).mockRejectedValue(new Error('boom'));
    await expect(service.refreshFromCbu()).rejects.toThrow('boom');
    expect(prisma.exchangeRate.create).not.toHaveBeenCalled();
  });

  it('setManual inserts a MANUAL row and writes an audit log', async () => {
    const { service, prisma } = makeService();
    prisma.exchangeRate.create.mockResolvedValue({
      base: 'USD', quote: 'UZS', rate: '13000.000000',
      source: 'MANUAL', fetchedAt: new Date('2026-06-19T07:00:00Z'),
    });
    const view = await service.setManual('admin-1', '13000');
    expect(prisma.exchangeRate.create).toHaveBeenCalledWith({
      data: { base: 'USD', quote: 'UZS', rate: '13000', source: 'MANUAL' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'admin-1',
        action: 'EXCHANGE_RATE_MANUAL_SET',
        entityType: 'exchange_rate',
      }),
    });
    expect(view.source).toBe('MANUAL');
  });
});
