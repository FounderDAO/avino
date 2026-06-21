import { Logger } from '@nestjs/common';
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
            : key === 'mediaCleanup.dryRun'
              ? false          // явно false → существующие delete-тесты продолжают проверять реальное удаление
              : key === 'mediaCleanup.maxDeleteRatio'
                ? 0.5
                : undefined,
    }) as unknown as ConfigService;

  /** Создаёт сервис с заданными mediaCleanup-полями поверх дефолтного config(). */
  const makeWith = (overrides: { dryRun?: boolean; maxDeleteRatio?: number }) =>
    new MediaCleanupService(
      uploads as any,
      prisma,
      ({
        get: (key: string) => {
          if (key === 'mediaCleanup.dryRun') return overrides.dryRun ?? false;
          if (key === 'mediaCleanup.maxDeleteRatio') return overrides.maxDeleteRatio ?? 0.5;
          if (key === 'mediaCleanup.graceHours') return 24;
          if (key === 'mediaCleanup.batchSize') return 500;
          return undefined;
        },
      }) as unknown as ConfigService,
    );

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
    // dryRun=false и maxDeleteRatio=0.5 задаём явно — иначе новый DEFAULT_DRY_RUN=true
    // вернёт 0 вместо ожидаемого 1 (тест проверяет NaN-guard grace, не dry-run).
    const nanConfig = {
      get: (key: string) =>
        key === 'mediaCleanup.graceHours'
          ? NaN
          : key === 'mediaCleanup.batchSize'
            ? NaN
            : key === 'mediaCleanup.dryRun'
              ? false
              : key === 'mediaCleanup.maxDeleteRatio'
                ? 0.5
                : undefined,
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

  it('dry-run: логирует кандидатов, но НЕ удаляет', async () => {
    uploads.listKeys.mockResolvedValue([
      { key: 'listings/a/media/orphan.jpg', lastModified: old() },
    ]);
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    try {
      const svc = makeWith({ dryRun: true });
      const deleted = await svc.run();
      expect(uploads.delete).not.toHaveBeenCalled();
      expect(deleted).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DRY-RUN]'),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('circuit-breaker: при доле сирот выше maxDeleteRatio и достаточной выборке — abort, ничего не удаляет', async () => {
    // 30 старых media-объектов, ни одного живого в БД → 100% сирот > 0.5
    const many = Array.from({ length: 30 }, (_, i) => ({
      key: `listings/a/media/o${i}.jpg`, lastModified: old(),
    }));
    uploads.listKeys.mockResolvedValue(many);
    prisma.listingMedia.findMany.mockResolvedValue([]); // живых нет
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    try {
      const svc = makeWith({ dryRun: false, maxDeleteRatio: 0.5 });
      const deleted = await svc.run();
      expect(uploads.delete).not.toHaveBeenCalled();
      expect(deleted).toBe(0);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ABORT'),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
