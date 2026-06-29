import { PublicSettingsController } from './public-settings.controller';

describe('PublicSettingsController', () => {
  function build(promoVal: boolean, mapVal: boolean, reqVal: boolean, verVal: number) {
    const promo: any = { isEnabled: jest.fn().mockResolvedValue(promoVal) };
    const mapHover: any = { isEnabled: jest.fn().mockResolvedValue(mapVal) };
    const legal: any = {
      isRequired: jest.fn().mockResolvedValue(reqVal),
      currentVersion: jest.fn().mockResolvedValue(verVal),
    };
    return new PublicSettingsController(promo, mapHover, legal);
  }

  it('returns all flags with their defaults', async () => {
    expect(await build(false, false, false, 1).get()).toEqual({
      promotionsEnabled: false,
      mapHoverRecenter: false,
      legalConsentRequired: false,
      legalConsentVersion: 1,
    });
  });

  it('reflects each flag independently', async () => {
    expect(await build(true, false, true, 3).get()).toEqual({
      promotionsEnabled: true,
      mapHoverRecenter: false,
      legalConsentRequired: true,
      legalConsentVersion: 3,
    });
  });
});
