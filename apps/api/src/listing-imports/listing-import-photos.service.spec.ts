import { HttpException } from '@nestjs/common';
import { ListingImportPhotosService } from './listing-import-photos.service';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const file = (originalname: string, buffer = JPEG, size = buffer.length) => ({ buffer, originalname, size });

describe('ListingImportPhotosService', () => {
  const photo = { id: 'p1', importId: 'i1', listingId: 'l1', position: 0, source: 'FILE', ref: 'Фото 1.JPG', status: 'AWAITING_UPLOAD', errorCode: null, httpStatus: null };
  let prisma: any;
  let attacher: any;
  let queue: any;
  let service: ListingImportPhotosService;

  const status = async (promise: Promise<unknown>) => {
    const error = await promise.then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    return [(error as HttpException).getStatus(), ((error as HttpException).getResponse() as { code: string }).code];
  };

  beforeEach(() => {
    prisma = {
      listingImport: { findUnique: jest.fn().mockResolvedValue({ id: 'i1' }) },
      listingImportPhoto: {
        findFirst: jest.fn().mockResolvedValue(photo),
        findMany: jest.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    attacher = {
      attach: jest.fn().mockResolvedValue({ ...photo, status: 'DONE' }),
      fail: jest.fn().mockResolvedValue({ ...photo, status: 'FAILED', errorCode: 'NOT_AN_IMAGE' }),
    };
    queue = { enqueue: jest.fn() };
    service = new ListingImportPhotosService(prisma, attacher, queue);
  });

  it('загружает файл с совпадающим именем (регистр, путь в имени отбрасывается)', async () => {
    const result = await service.upload('i1', 'p1', file('папка/фото 1.jpg'));
    expect(attacher.attach).toHaveBeenCalledWith(photo, JPEG, 'image/jpeg');
    expect(result).toMatchObject({ id: 'p1', status: 'DONE' });
  });

  it('нет файла → 400, больше 10 МиБ → 413, нет фото → 404, ссылка → 409, другое имя → 422', async () => {
    expect(await status(service.upload('i1', 'p1', undefined))).toEqual([400, 'VALIDATION_ERROR']);
    expect(await status(service.upload('i1', 'p1', file('Фото 1.JPG', JPEG, 11 * 1024 * 1024)))).toEqual([413, 'IMPORT_PHOTO_TOO_LARGE']);
    prisma.listingImportPhoto.findFirst.mockResolvedValueOnce(null);
    expect(await status(service.upload('i1', 'p1', file('Фото 1.JPG')))).toEqual([404, 'NOT_FOUND']);
    prisma.listingImportPhoto.findFirst.mockResolvedValueOnce({ ...photo, source: 'URL' });
    expect(await status(service.upload('i1', 'p1', file('Фото 1.JPG')))).toEqual([409, 'IMPORT_PHOTO_NOT_FILE']);
    expect(await status(service.upload('i1', 'p1', file('2.jpg')))).toEqual([422, 'IMPORT_PHOTO_NAME_MISMATCH']);
  });

  it('уже DONE → 200 без записи', async () => {
    prisma.listingImportPhoto.findFirst.mockResolvedValue({ ...photo, status: 'DONE' });
    expect(await service.upload('i1', 'p1', file('Фото 1.JPG'))).toMatchObject({ status: 'DONE' });
    expect(attacher.attach).not.toHaveBeenCalled();
  });

  it('не картинка по байтам → FAILED NOT_AN_IMAGE (200)', async () => {
    const result = await service.upload('i1', 'p1', file('Фото 1.JPG', Buffer.from('<html>')));
    expect(attacher.fail).toHaveBeenCalledWith('p1', 'NOT_AN_IMAGE');
    expect(result).toMatchObject({ status: 'FAILED', error_code: 'NOT_AN_IMAGE' });
  });

  it('retry: FAILED → PENDING и все PENDING/FAILED ссылки в очередь', async () => {
    expect(await service.retry('i1')).toEqual({ queued: 2 });
    expect(prisma.listingImportPhoto.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['u1', 'u2'] }, status: 'FAILED' },
      data: { status: 'PENDING', errorCode: null, httpStatus: null, attempts: 0 },
    });
    expect(queue.enqueue).toHaveBeenCalledWith(['u1', 'u2']);
  });

  it('retry/summary несуществующего импорта → 404', async () => {
    prisma.listingImport.findUnique.mockResolvedValue(null);
    expect(await status(service.retry('x'))).toEqual([404, 'NOT_FOUND']);
    expect(await status(service.summary('x'))).toEqual([404, 'NOT_FOUND']);
  });
});
