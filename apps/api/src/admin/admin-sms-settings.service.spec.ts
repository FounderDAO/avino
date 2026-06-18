import { AdminSmsSettingsService } from './admin-sms-settings.service';

describe('AdminSmsSettingsService', () => {
  const prisma = {
    appSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const config = { get: jest.fn().mockReturnValue(true) }; // env default true
  let service: AdminSmsSettingsService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockReturnValue(true);
    service = new AdminSmsSettingsService(prisma as never, config as never);
  });

  it('get() returns stored value over env default', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: 'false' });
    expect(await service.get()).toEqual({ smsEnabled: false });
  });

  it('get() falls back to env default when unset', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);
    expect(await service.get()).toEqual({ smsEnabled: true });
  });

  it('update() upserts string value + writes audit', async () => {
    await service.update('admin1', { enabled: false });
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'sms_enabled' },
        update: { value: 'false' },
        create: { key: 'sms_enabled', value: 'false' },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'SMS_SETTINGS_UPDATE',
          metadata: { enabled: false },
        }),
      }),
    );
  });
});
