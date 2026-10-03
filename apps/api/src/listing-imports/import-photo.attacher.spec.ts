import { ListingStatus } from '@prisma/client';
import { ImportPhotoAttacher } from './import-photo.attacher';

describe('ImportPhotoAttacher', () => {
  const photo = { id: 'p1', listingId: 'l1', position: 3 };
  let prisma: any;
  let media: any;
  let tx: any;
  let attacher: ImportPhotoAttacher;

  beforeEach(() => {
    tx = {
      listingImportPhoto: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'p1', status: 'DONE' }),
      },
    };
    prisma = {
      listing: { findUnique: jest.fn().mockResolvedValue({ status: ListingStatus.NEW }) },
      listingMedia: { count: jest.fn().mockResolvedValue(0) },
      listingImportPhoto: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'p1', status: 'FAILED' }),
      },
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    };
    media = {
      uploadToStorage: jest.fn().mockResolvedValue({ key: 'k', url: 'u' }),
      createMediaRecord: jest.fn().mockResolvedValue({ id: 'm1' }),
    };
    attacher = new ImportPhotoAttacher(prisma, media);
  });

  it('грузит в хранилище вне транзакции, запись и DONE — в транзакции, sort_order = position', async () => {
    const result = await attacher.attach(photo, Buffer.from('x'), 'image/jpeg');
    expect(media.uploadToStorage).toHaveBeenCalledWith('l1', Buffer.from('x'), 'image/jpeg');
    expect(media.createMediaRecord).toHaveBeenCalledWith(tx, 'l1', { key: 'k', url: 'u', mimeType: 'image/jpeg', sizeBytes: 1, sortOrder: 3 });
    expect(tx.listingImportPhoto.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: { in: ['PENDING', 'AWAITING_UPLOAD', 'FAILED'] } },
      data: { status: 'DONE', mediaId: 'm1', errorCode: null, httpStatus: null },
    });
    expect(result).toMatchObject({ status: 'DONE' });
  });

  it('удалённое или отсутствующее объявление → FAILED LISTING_UNAVAILABLE без загрузки', async () => {
    prisma.listing.findUnique.mockResolvedValue({ status: ListingStatus.DELETED });
    await attacher.attach(photo, Buffer.from('x'), 'image/jpeg');
    expect(media.uploadToStorage).not.toHaveBeenCalled();
    expect(prisma.listingImportPhoto.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: { not: 'DONE' } },
      data: { status: 'FAILED', errorCode: 'LISTING_UNAVAILABLE', httpStatus: null },
    });
  });

  it('20 фото уже есть → FAILED MEDIA_LIMIT', async () => {
    prisma.listingMedia.count.mockResolvedValue(20);
    await attacher.attach(photo, Buffer.from('x'), 'image/jpeg');
    expect(media.uploadToStorage).not.toHaveBeenCalled();
    expect(prisma.listingImportPhoto.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errorCode: 'MEDIA_LIMIT' }) }),
    );
  });

  it('гонка: фото уже DONE → транзакция откатывается, возвращается текущее состояние', async () => {
    tx.listingImportPhoto.updateMany.mockResolvedValue({ count: 0 });
    prisma.listingImportPhoto.findUniqueOrThrow.mockResolvedValue({ id: 'p1', status: 'DONE', mediaId: 'other' });
    const result = await attacher.attach(photo, Buffer.from('x'), 'image/jpeg');
    expect(result).toMatchObject({ status: 'DONE', mediaId: 'other' });
  });
});
