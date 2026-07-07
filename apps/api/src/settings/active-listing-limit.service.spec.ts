import { ActiveListingLimitService } from './active-listing-limit.service';

describe('ActiveListingLimitService', () => {
  const prisma = {
    appSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const config = { get: jest.fn().mockReturnValue(2) }; // env default 2
  let service: ActiveListingLimitService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockReturnValue(2);
    service = new ActiveListingLimitService(prisma as never, config as never);
  });

  it('getLimit() returns stored value over env default', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: '5' });
    expect(await service.getLimit()).toBe(5);
  });

  it('getLimit() falls back to env default (2) when unset', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);
    expect(await service.getLimit()).toBe(2);
  });

  it('getLimit() falls back to env default when DB throws', async () => {
    prisma.appSetting.findUnique.mockRejectedValue(new Error('db down'));
    expect(await service.getLimit()).toBe(2);
  });

  it('setLimit() upserts string value + writes audit', async () => {
    const result = await service.setLimit('admin1', 3);
    expect(result).toBe(3);
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'active_listing_limit' },
        update: { value: '3' },
        create: { key: 'active_listing_limit', value: '3' },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'ACTIVE_LISTING_LIMIT_UPDATE',
          metadata: { limit: 3 },
        }),
      }),
    );
  });
});
