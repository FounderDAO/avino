import { PublicSettingsController } from './public-settings.controller';

describe('PublicSettingsController', () => {
  it('returns promotionsEnabled=false from the flag service', async () => {
    const flags: any = { isEnabled: jest.fn().mockResolvedValue(false) };
    const controller = new PublicSettingsController(flags);
    expect(await controller.get()).toEqual({ promotionsEnabled: false });
  });

  it('reflects an enabled flag', async () => {
    const flags: any = { isEnabled: jest.fn().mockResolvedValue(true) };
    const controller = new PublicSettingsController(flags);
    expect(await controller.get()).toEqual({ promotionsEnabled: true });
  });
});
