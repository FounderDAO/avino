import { AdminExchangeRateController } from './admin-exchange-rate.controller';

function make() {
  const service: any = {
    getCurrent: jest.fn().mockResolvedValue({ source: 'CBU' }),
    listHistory: jest.fn().mockResolvedValue([{ source: 'CBU' }]),
    setManual: jest.fn().mockResolvedValue({ source: 'MANUAL' }),
    refreshFromCbu: jest.fn().mockResolvedValue(undefined),
  };
  return { service, controller: new AdminExchangeRateController(service) };
}

describe('AdminExchangeRateController', () => {
  it('GET returns current + history', async () => {
    const { controller, service } = make();
    const res = await controller.get();
    expect(res).toEqual({ current: { source: 'CBU' }, history: [{ source: 'CBU' }] });
    expect(service.listHistory).toHaveBeenCalled();
  });

  it('PUT delegates to setManual with adminId', async () => {
    const { controller, service } = make();
    const res = await controller.set('admin-1', { rate: '13000' });
    expect(service.setManual).toHaveBeenCalledWith('admin-1', '13000');
    expect(res.source).toBe('MANUAL');
  });

  it('POST refresh triggers a CBU fetch then returns current', async () => {
    const { controller, service } = make();
    await controller.refresh();
    expect(service.refreshFromCbu).toHaveBeenCalled();
    expect(service.getCurrent).toHaveBeenCalled();
  });
});
