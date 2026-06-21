import { ConfigService } from '@nestjs/config';
import { MediaCleanupService } from './media-cleanup.service';

/**
 * Юнит-тесты MediaCleanupService. UploadsService и Prisma мокаются. Проверяют:
 * удаление осиротевшего объекта; сохранение объекта с живой listing_media-строкой
 * (по storageKey И по legacy extractKey(url)); сохранение свежего объекта внутри
 * grace-окна; фильтрацию не-media ключей.
 */
describe('MediaCleanupService', () => {
  const HOUR = 3600_000;
  const old = () => new Date(Date.now() - 72 * HOUR); // старше grace (24ч)
  const fresh = () => new Date(Date.now() - 1 * HOUR); // внутри grace

  let uploads: {
    listKeys: jest.Mock;
    delete: jest.Mock;
    extractKey: jest.Mock;
    rootPrefix: jest.Mock;
  };
  let prisma: any;

  const config = (): ConfigService =>
    ({
      get: (key: string) =>
        key === 'mediaCleanup.graceHours'
          ? 24
          : key === 'mediaCleanup.batchSize'
            ? 500
            : undefined,
    }) as unknown as ConfigService;

  const make = () =>
    new MediaCleanupService(uploads as any, prisma, config());

  beforeEach(() => {
    uploads = {
      listKeys: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      // legacy extractKey: из url достаём path после домена/бакета.
      extractKey: jest.fn((url: string) => new URL(url).pathname.replace(/^\/+/, '')),
      // back-compat: пустой префикс → listKeys('listings/')
      rootPrefix: jest.fn().mockReturnValue(''),
    };
    prisma = {
      listingMedia: { findMany: jest.fn().mockResolvedValue([]) },
    };
  });

  it('удаляет осиротевший объект старше grace-окна', async () => {
    uploads.listKeys.mockResolvedValue([
      { key: 'listings/a/media/orphan.jpg', lastModified: old() },
    ]);
    const deleted = await make().run();
    expect(uploads.delete).toHaveBeenCalledWith('listings/a/media/orphan.jpg');
    expect(deleted).toBe(1);
  });

  it('findMany вызывается с bounded where (candidate storageKey + legacy null)', async () => {
    const key = 'listings/a/media/bounded.jpg';
    uploads.listKeys.mockResolvedValue([{ key, lastModified: old() }]);
    await make().run();
    expect(prisma.listingMedia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { storageKey: { in: [key] } },
            { storageKey: null },
          ],
        },
      }),
    );
  });

  it('НЕ трогает объект с живой строкой (storageKey)', async () => {
    uploads.listKeys.mockResolvedValue([
      { key: 'listings/a/media/live.jpg', lastModified: old() },
    ]);
    prisma.listingMedia.findMany.mockResolvedValue([
      { storageKey: 'listings/a/media/live.jpg', url: 'ignored' },
    ]);
    const deleted = await make().run();
    expect(uploads.delete).not.toHaveBeenCalled();
    expect(deleted).toBe(0);
  });

  it('НЕ трогает legacy-объект, чей ключ резолвится из url (storageKey=null)', async () => {
    uploads.listKeys.mockResolvedValue([
      { key: 'listings/a/media/legacy.jpg', lastModified: old() },
    ]);
    prisma.listingMedia.findMany.mockResolvedValue([
      { storageKey: null, url: 'https://cdn.example/listings/a/media/legacy.jpg' },
    ]);
    const deleted = await make().run();
    expect(uploads.delete).not.toHaveBeenCalled();
    expect(deleted).toBe(0);
  });

  it('НЕ трогает свежий объект внутри grace-окна', async () => {
    uploads.listKeys.mockResolvedValue([
      { key: 'listings/a/media/justuploaded.jpg', lastModified: fresh() },
    ]);
    const deleted = await make().run();
    expect(uploads.delete).not.toHaveBeenCalled();
    expect(deleted).toBe(0);
  });

  it('пропускает не-media ключи под listings/', async () => {
    uploads.listKeys.mockResolvedValue([
      { key: 'listings/a/other/doc.pdf', lastModified: old() },
    ]);
    const deleted = await make().run();
    expect(uploads.delete).not.toHaveBeenCalled();
    expect(deleted).toBe(0);
  });

  it('при rootPrefix="dev" listKeys вызывается с "dev/listings/"', async () => {
    uploads.rootPrefix.mockReturnValue('dev');
    await make().run();
    expect(uploads.listKeys).toHaveBeenCalledWith('dev/listings/');
  });

  it('при rootPrefix="" listKeys вызывается с "listings/" (back-compat)', async () => {
    uploads.rootPrefix.mockReturnValue('');
    await make().run();
    expect(uploads.listKeys).toHaveBeenCalledWith('listings/');
  });

  it('при NaN-конфиге (malformed env) применяет DEFAULT_GRACE_HOURS=24 и удаляет объект старше 24ч', async () => {
    // Симулируем parseInt('abc',10) → NaN, который ?? не перехватывает.
    const nanConfig = {
      get: (key: string) =>
        key === 'mediaCleanup.graceHours' ? NaN : key === 'mediaCleanup.batchSize' ? NaN : undefined,
    } as unknown as ConfigService;

    // Объект возрастом 48ч — старше дефолтного grace 24ч, должен быть удалён.
    uploads.listKeys.mockResolvedValue([
      { key: 'listings/a/media/oldorphan.jpg', lastModified: new Date(Date.now() - 48 * HOUR) },
    ]);

    const svc = new MediaCleanupService(uploads as any, prisma, nanConfig);
    const deleted = await svc.run();

    // Если бы graceHours=NaN, cutoff=NaN и lastModified<NaN=false → deleted=0.
    // Правильная ветка: graceHours=24, cutoff=now-24h, объект 48h старше → удаляется.
    expect(deleted).toBe(1);
    expect(uploads.delete).toHaveBeenCalledWith('listings/a/media/oldorphan.jpg');
  });
});
