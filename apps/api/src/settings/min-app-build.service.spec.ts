import { MinAppBuildService } from './min-app-build.service';

describe('MinAppBuildService', () => {
  const prisma = {
    appSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  let service: MinAppBuildService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new MinAppBuildService(prisma as never);
  });

  it('get() returns stored values per platform', async () => {
    prisma.appSetting.findUnique.mockImplementation(
      ({ where }: { where: { key: string } }) =>
        Promise.resolve(
          where.key === 'min_app_build_ios' ? { value: '10' } : { value: '12' },
        ),
    );
    expect(await service.get()).toEqual({ ios: 10, android: 12 });
  });

  it('get() defaults to 0 when unset', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);
    expect(await service.get()).toEqual({ ios: 0, android: 0 });
  });

  it('get() returns 0 when DB throws (never blocks users)', async () => {
    prisma.appSetting.findUnique.mockRejectedValue(new Error('db down'));
    expect(await service.get()).toEqual({ ios: 0, android: 0 });
  });

  it('set() upserts only provided fields + writes one audit row', async () => {
    prisma.appSetting.findUnique.mockImplementation(
      ({ where }: { where: { key: string } }) =>
        Promise.resolve(
          where.key === 'min_app_build_android' ? { value: '15' } : null,
        ),
    );
    const result = await service.set('admin1', { android: 15 });
    expect(result).toEqual({ ios: 0, android: 15 });
    expect(prisma.appSetting.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'min_app_build_android' },
      update: { value: '15' },
      create: { key: 'min_app_build_android', value: '15' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'MIN_APP_BUILD_UPDATE',
          metadata: { android: 15 },
        }),
      }),
    );
  });

  it('set() writes both platforms when both provided', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);
    await service.set('admin1', { ios: 3, android: 4 });
    expect(prisma.appSetting.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'min_app_build_ios' } }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ metadata: { ios: 3, android: 4 } }),
      }),
    );
  });
});
