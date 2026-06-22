import { AdminNotificationSettingsService } from './admin-notification-settings.service';

describe('AdminNotificationSettingsService', () => {
  const prisma = {
    appSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  // env defaults: email=true, push=true
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'notifications.emailEnabled') return true;
      if (key === 'notifications.pushEnabled') return true;
      return undefined;
    }),
  };
  let service: AdminNotificationSettingsService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockImplementation((key: string) => {
      if (key === 'notifications.emailEnabled') return true;
      if (key === 'notifications.pushEnabled') return true;
      return undefined;
    });
    service = new AdminNotificationSettingsService(
      prisma as never,
      config as never,
    );
  });

  describe('get()', () => {
    it('returns env defaults when no rows in app_settings', async () => {
      prisma.appSetting.findUnique.mockResolvedValue(null);
      expect(await service.get()).toEqual({
        emailEnabled: true,
        pushEnabled: true,
      });
    });

    it('returns stored value over env default (email=false)', async () => {
      prisma.appSetting.findUnique.mockImplementation(
        ({ where }: { where: { key: string } }) => {
          if (where.key === 'email_notifications_enabled')
            return Promise.resolve({ value: 'false' });
          return Promise.resolve(null);
        },
      );
      const result = await service.get();
      expect(result.emailEnabled).toBe(false);
      expect(result.pushEnabled).toBe(true);
    });

    it('returns stored value over env default (push=false)', async () => {
      prisma.appSetting.findUnique.mockImplementation(
        ({ where }: { where: { key: string } }) => {
          if (where.key === 'push_notifications_enabled')
            return Promise.resolve({ value: 'false' });
          return Promise.resolve(null);
        },
      );
      const result = await service.get();
      expect(result.emailEnabled).toBe(true);
      expect(result.pushEnabled).toBe(false);
    });
  });

  describe('update()', () => {
    it('upserts both keys + writes audit log when both provided', async () => {
      prisma.appSetting.findUnique.mockResolvedValue(null);
      await service.update('admin1', { emailEnabled: false, pushEnabled: true });

      expect(prisma.appSetting.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'email_notifications_enabled' },
          update: { value: 'false' },
          create: { key: 'email_notifications_enabled', value: 'false' },
        }),
      );
      expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'push_notifications_enabled' },
          update: { value: 'true' },
          create: { key: 'push_notifications_enabled', value: 'true' },
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: 'admin1',
            action: 'NOTIFICATION_SETTINGS_UPDATE',
            metadata: { emailEnabled: false, pushEnabled: true },
          }),
        }),
      );
    });

    it('partial update: only touches provided key (emailEnabled only)', async () => {
      prisma.appSetting.findUnique.mockResolvedValue(null);
      await service.update('admin2', { emailEnabled: false });

      expect(prisma.appSetting.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'email_notifications_enabled' },
        }),
      );
      // pushEnabled key NOT touched
      const calls = prisma.appSetting.upsert.mock.calls;
      expect(
        calls.some((c: unknown[]) =>
          (c[0] as { where: { key: string } }).where.key === 'push_notifications_enabled',
        ),
      ).toBe(false);
    });

    it('partial update: only touches provided key (pushEnabled only)', async () => {
      prisma.appSetting.findUnique.mockResolvedValue(null);
      await service.update('admin3', { pushEnabled: false });

      expect(prisma.appSetting.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'push_notifications_enabled' },
        }),
      );
    });

    it('returns resolved state after update', async () => {
      // After update, get() is called; rows will return 'false' for email
      prisma.appSetting.findUnique.mockImplementation(
        ({ where }: { where: { key: string } }) => {
          if (where.key === 'email_notifications_enabled')
            return Promise.resolve({ value: 'false' });
          return Promise.resolve(null);
        },
      );
      const result = await service.update('admin4', { emailEnabled: false });
      expect(result.emailEnabled).toBe(false);
      expect(result.pushEnabled).toBe(true);
    });
  });
});
