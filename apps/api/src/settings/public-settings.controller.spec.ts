import { PublicSettingsController } from './public-settings.controller';

describe('PublicSettingsController', () => {
  it('returns both flags as false', async () => {
    const promo: any = { isEnabled: jest.fn().mockResolvedValue(false) };
    const mapHover: any = { isEnabled: jest.fn().mockResolvedValue(false) };
    const controller = new PublicSettingsController(promo, mapHover);
    expect(await controller.get()).toEqual({
      promotionsEnabled: false,
      mapHoverRecenter: false,
    });
  });

  it('reflects each flag independently', async () => {
    const promo: any = { isEnabled: jest.fn().mockResolvedValue(true) };
    const mapHover: any = { isEnabled: jest.fn().mockResolvedValue(false) };
    const controller = new PublicSettingsController(promo, mapHover);
    expect(await controller.get()).toEqual({
      promotionsEnabled: true,
      mapHoverRecenter: false,
    });
  });
});
