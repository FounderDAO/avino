import { ExchangeRateController } from './exchange-rate.controller';

describe('ExchangeRateController', () => {
  it('returns the current rate view', async () => {
    const view = {
      base: 'USD', quote: 'UZS', rate: '12650.180000',
      fetched_at: '2026-06-19T06:00:00.000Z', source: 'CBU',
    };
    const service: any = { getCurrent: jest.fn().mockResolvedValue(view) };
    const controller = new ExchangeRateController(service);
    expect(await controller.current()).toEqual(view);
  });

  it('404s when no rate exists', async () => {
    const service: any = { getCurrent: jest.fn().mockResolvedValue(null) };
    const controller = new ExchangeRateController(service);
    await expect(controller.current()).rejects.toThrow();
  });
});
