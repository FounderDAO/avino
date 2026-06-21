import { PromotionsFlagService } from './promotions-flag.service';

describe('PromotionsFlagService', () => {
  const prisma = {
    appSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const config = { get: jest.fn().mockReturnValue(false) }; // env default false
  let service: PromotionsFlagService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockReturnValue(false);
    service = new PromotionsFlagService(prisma as never, config as never);
  });

  it('isEnabled() returns stored value over env default', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: 'true' });
    expect(await service.isEnabled()).toBe(true);
  });

  it('isEnabled() falls back to env default (false) when unset', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);
    expect(await service.isEnabled()).toBe(false);
  });

  it('isEnabled() falls back to env default when DB throws', async () => {
    prisma.appSetting.findUnique.mockRejectedValue(new Error('db down'));
    expect(await service.isEnabled()).toBe(false);
  });

  it('setEnabled() upserts string value + writes audit', async () => {
    const result = await service.setEnabled('admin1', true);
    expect(result).toBe(true);
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'promotions_enabled' },
        update: { value: 'true' },
        create: { key: 'promotions_enabled', value: 'true' },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'PROMOTIONS_FLAG_UPDATE',
          metadata: { enabled: true },
        }),
      }),
    );
  });

  it('setEnabled() upserts false value + writes audit with enabled:false', async () => {
    const result = await service.setEnabled('admin1', false);
    expect(result).toBe(false);
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'promotions_enabled' },
        update: { value: 'false' },
        create: { key: 'promotions_enabled', value: 'false' },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'PROMOTIONS_FLAG_UPDATE',
          metadata: { enabled: false },
        }),
      }),
    );
  });
});
