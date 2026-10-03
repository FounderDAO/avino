import { canAttachPhotos, createPhotoRecords, draftPhotoReports, photoSummaries, toPhotoReport } from './import-photo.records';

describe('import-photo.records', () => {
  it('draftPhotoReports — без id и статуса', () => {
    expect(draftPhotoReports([{ position: 0, source: 'FILE', ref: 'a.jpg' }])).toEqual([
      { id: null, position: 0, source: 'FILE', ref: 'a.jpg', status: null, error_code: null, http_status: null },
    ]);
  });

  it('toPhotoReport — snake_case', () => {
    expect(toPhotoReport({ id: 'p', position: 1, source: 'URL', ref: 'u', status: 'FAILED', errorCode: 'HTTP_ERROR', httpStatus: 404 } as any)).toEqual({
      id: 'p', position: 1, source: 'URL', ref: 'u', status: 'FAILED', error_code: 'HTTP_ERROR', http_status: 404,
    });
  });

  it('createPhotoRecords: URL → PENDING, FILE → AWAITING_UPLOAD; пустой список — без запроса', async () => {
    const db = { listingImportPhoto: { createMany: jest.fn() } };
    await createPhotoRecords(db as any, 'i', 2, 'l', []);
    expect(db.listingImportPhoto.createMany).not.toHaveBeenCalled();
    await createPhotoRecords(db as any, 'i', 2, 'l', [
      { position: 0, source: 'URL', ref: 'u' },
      { position: 1, source: 'FILE', ref: 'f.jpg' },
    ]);
    expect(db.listingImportPhoto.createMany).toHaveBeenCalledWith({ data: [
      { importId: 'i', rowNumber: 2, listingId: 'l', position: 0, source: 'URL', ref: 'u', status: 'PENDING' },
      { importId: 'i', rowNumber: 2, listingId: 'l', position: 1, source: 'FILE', ref: 'f.jpg', status: 'AWAITING_UPLOAD' },
    ] });
  });

  it('canAttachPhotos — только без медиа и без незавершённых фото импорта', async () => {
    const db = (media: number, open: number) => ({
      listingMedia: { count: jest.fn().mockResolvedValue(media) },
      listingImportPhoto: { count: jest.fn().mockResolvedValue(open) },
    });
    expect(await canAttachPhotos(db(0, 0) as any, 'l')).toBe(true);
    expect(await canAttachPhotos(db(1, 0) as any, 'l')).toBe(false);
    expect(await canAttachPhotos(db(0, 2) as any, 'l')).toBe(false);
  });

  it('photoSummaries группирует по импорту и статусу, отсутствующие — нули', async () => {
    const db = { listingImportPhoto: { groupBy: jest.fn().mockResolvedValue([
      { importId: 'a', status: 'DONE', _count: { _all: 3 } },
      { importId: 'a', status: 'FAILED', _count: { _all: 1 } },
      { importId: 'a', status: 'AWAITING_UPLOAD', _count: { _all: 2 } },
    ]) } };
    const map = await photoSummaries(db as any, ['a', 'b']);
    expect(map.get('a')).toEqual({ total: 6, done: 3, failed: 1, pending: 0, awaiting_upload: 2 });
    expect(map.get('b')).toEqual({ total: 0, done: 0, failed: 0, pending: 0, awaiting_upload: 0 });
  });
});
