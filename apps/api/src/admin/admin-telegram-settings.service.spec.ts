import { AdminTelegramSettingsService } from './admin-telegram-settings.service';

describe('AdminTelegramSettingsService', () => {
  const prisma = {
    appSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const config = { get: jest.fn().mockReturnValue(false) }; // env default false
  let service: AdminTelegramSettingsService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockReturnValue(false);
    service = new AdminTelegramSettingsService(prisma as never, config as never);
  });

  it('get() returns stored value over env default', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: 'true' });
    expect(await service.get()).toEqual({ notificationsEnabled: true });
  });

  it('get() falls back to env default when unset', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);
    expect(await service.get()).toEqual({ notificationsEnabled: false });
  });

  it('update() upserts string value + writes audit', async () => {
    await service.update('admin1', { enabled: true });
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'telegram_notifications_enabled' },
        update: { value: 'true' },
        create: { key: 'telegram_notifications_enabled', value: 'true' },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'TELEGRAM_SETTINGS_UPDATE',
          metadata: { enabled: true },
        }),
      }),
    );
  });
});
