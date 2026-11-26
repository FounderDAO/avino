import { PublicSettingsController } from './public-settings.controller';

describe('PublicSettingsController', () => {
  function build(
    promoVal: boolean,
    limitVal: number,
    mapVal: boolean,
    reqVal: boolean,
    verVal: number,
    minBuild = { ios: 0, android: 0 },
  ) {
    const promo: any = { isEnabled: jest.fn().mockResolvedValue(promoVal) };
    const activeLimit: any = { getLimit: jest.fn().mockResolvedValue(limitVal) };
    const mapHover: any = { isEnabled: jest.fn().mockResolvedValue(mapVal) };
    const legal: any = {
      isRequired: jest.fn().mockResolvedValue(reqVal),
      currentVersion: jest.fn().mockResolvedValue(verVal),
    };
    const minAppBuild: any = { get: jest.fn().mockResolvedValue(minBuild) };
    return new PublicSettingsController(
      promo,
      activeLimit,
      mapHover,
      legal,
      minAppBuild,
    );
  }

  it('returns all flags with their defaults', async () => {
    expect(await build(false, 2, false, false, 1).get()).toEqual({
      promotionsEnabled: false,
      activeListingLimit: 2,
      mapHoverRecenter: false,
      legalConsentRequired: false,
      legalConsentVersion: 1,
      minAppBuildIos: 0,
      minAppBuildAndroid: 0,
    });
  });

  it('reflects each flag independently', async () => {
    expect(await build(true, 5, false, true, 3, { ios: 10, android: 12 }).get()).toEqual({
      promotionsEnabled: true,
      activeListingLimit: 5,
      mapHoverRecenter: false,
      legalConsentRequired: true,
      legalConsentVersion: 3,
      minAppBuildIos: 10,
      minAppBuildAndroid: 12,
    });
  });
});
