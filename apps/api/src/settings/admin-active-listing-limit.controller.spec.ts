import { AdminActiveListingLimitController } from './admin-active-listing-limit.controller';

describe('AdminActiveListingLimitController', () => {
  it('GET returns the current limit', async () => {
    const limit: any = {
      getLimit: jest.fn().mockResolvedValue(2),
      setLimit: jest.fn(),
    };
    const controller = new AdminActiveListingLimitController(limit);
    expect(await controller.get()).toEqual({ activeListingLimit: 2 });
  });

  it('PATCH delegates to setLimit with admin id and returns the new value', async () => {
    const limit: any = {
      getLimit: jest.fn(),
      setLimit: jest.fn().mockResolvedValue(5),
    };
    const controller = new AdminActiveListingLimitController(limit);
    const res = await controller.update('admin-1', { limit: 5 });
    expect(limit.setLimit).toHaveBeenCalledWith('admin-1', 5);
    expect(res).toEqual({ activeListingLimit: 5 });
  });
});
