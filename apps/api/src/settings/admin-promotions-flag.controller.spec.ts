import { AdminPromotionsFlagController } from './admin-promotions-flag.controller';

describe('AdminPromotionsFlagController', () => {
  it('GET returns the current flag', async () => {
    const flags: any = {
      isEnabled: jest.fn().mockResolvedValue(false),
      setEnabled: jest.fn(),
    };
    const controller = new AdminPromotionsFlagController(flags);
    expect(await controller.get()).toEqual({ promotionsEnabled: false });
  });

  it('PATCH delegates to setEnabled with admin id and returns the new value', async () => {
    const flags: any = {
      isEnabled: jest.fn(),
      setEnabled: jest.fn().mockResolvedValue(true),
    };
    const controller = new AdminPromotionsFlagController(flags);
    const res = await controller.update('admin-1', { enabled: true });
    expect(flags.setEnabled).toHaveBeenCalledWith('admin-1', true);
    expect(res).toEqual({ promotionsEnabled: true });
  });
});
