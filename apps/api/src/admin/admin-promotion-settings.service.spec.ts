import { AdminPromotionSettingsService } from './admin-promotion-settings.service';

describe('AdminPromotionSettingsService', () => {
  const prisma = { appSetting: { findUnique: jest.fn(), upsert: jest.fn() }, auditLog: { create: jest.fn() } };
  const queue = { rescheduleExpiry: jest.fn() };
  let service: AdminPromotionSettingsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new AdminPromotionSettingsService(prisma as never, queue as never);
  });

  it('get() maps stored cron to interval hours', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: '0 */6 * * *' });
    expect(await service.get()).toEqual({ expiryIntervalHours: 6 });
  });

  it('get() defaults to 12h when unset', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);
    expect(await service.get()).toEqual({ expiryIntervalHours: 12 });
  });

  it('update() persists cron, reschedules queue, writes audit', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: '0 */12 * * *' });
    await service.update('admin1', { expiryIntervalHours: 6 });

    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'promotion_expiry_cron' },
        update: { value: '0 */6 * * *' },
      }),
    );
    expect(queue.rescheduleExpiry).toHaveBeenCalledWith('0 */6 * * *');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'PROMOTION_SETTINGS_UPDATE',
          metadata: expect.objectContaining({ old_cron: '0 */12 * * *', new_cron: '0 */6 * * *' }),
        }),
      }),
    );
  });
});
