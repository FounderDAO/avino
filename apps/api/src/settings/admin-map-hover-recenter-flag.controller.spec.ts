import { AdminMapHoverRecenterFlagController } from './admin-map-hover-recenter-flag.controller';

describe('AdminMapHoverRecenterFlagController', () => {
  it('GET returns the current flag', async () => {
    const flags: any = {
      isEnabled: jest.fn().mockResolvedValue(false),
      setEnabled: jest.fn(),
    };
    const controller = new AdminMapHoverRecenterFlagController(flags);
    expect(await controller.get()).toEqual({ mapHoverRecenter: false });
  });

  it('PATCH delegates to setEnabled with admin id and returns the new value', async () => {
    const flags: any = {
      isEnabled: jest.fn(),
      setEnabled: jest.fn().mockResolvedValue(true),
    };
    const controller = new AdminMapHoverRecenterFlagController(flags);
    const res = await controller.update('admin-1', { enabled: true });
    expect(flags.setEnabled).toHaveBeenCalledWith('admin-1', true);
    expect(res).toEqual({ mapHoverRecenter: true });
  });
});
