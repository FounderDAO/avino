import { AdminMinAppBuildController } from './admin-min-app-build.controller';

describe('AdminMinAppBuildController', () => {
  it('GET returns the current minimum builds', async () => {
    const svc: any = {
      get: jest.fn().mockResolvedValue({ ios: 0, android: 12 }),
      set: jest.fn(),
    };
    const controller = new AdminMinAppBuildController(svc);
    expect(await controller.get()).toEqual({ ios: 0, android: 12 });
  });

  it('PATCH delegates to set with admin id and returns the new values', async () => {
    const svc: any = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue({ ios: 7, android: 12 }),
    };
    const controller = new AdminMinAppBuildController(svc);
    const res = await controller.update('admin-1', { ios: 7 });
    expect(svc.set).toHaveBeenCalledWith('admin-1', {
      ios: 7,
      android: undefined,
    });
    expect(res).toEqual({ ios: 7, android: 12 });
  });
});
