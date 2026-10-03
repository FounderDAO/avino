import { ImportPhotoFetchProcessor } from './import-photo-fetch.processor';
import { ImageFetchError } from './safe-image-fetch';

describe('ImportPhotoFetchProcessor', () => {
  const pending = { id: 'p1', listingId: 'l1', position: 0, source: 'URL', status: 'PENDING', ref: 'https://a.uz/1.jpg' };
  let prisma: any;
  let attacher: any;
  let processor: ImportPhotoFetchProcessor;

  beforeEach(() => {
    prisma = {
      listingImportPhoto: {
        findUnique: jest.fn().mockResolvedValue(pending),
        update: jest.fn().mockResolvedValue(pending),
      },
    };
    attacher = { attach: jest.fn().mockResolvedValue({}), fail: jest.fn().mockResolvedValue({}) };
    processor = new ImportPhotoFetchProcessor(prisma, attacher);
    processor.fetchImage = jest.fn().mockResolvedValue({ buffer: Buffer.from('x'), mimeType: 'image/jpeg' });
  });

  it('скачивает и прикрепляет, увеличивает attempts', async () => {
    await processor.process('p1', false);
    expect(prisma.listingImportPhoto.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { attempts: { increment: 1 } } });
    expect(processor.fetchImage).toHaveBeenCalledWith('https://a.uz/1.jpg');
    expect(attacher.attach).toHaveBeenCalledWith(pending, Buffer.from('x'), 'image/jpeg');
  });

  it.each(['DONE', 'FAILED', 'AWAITING_UPLOAD'])('статус %s — пропуск', async (status) => {
    prisma.listingImportPhoto.findUnique.mockResolvedValue({ ...pending, status });
    await processor.process('p1', false);
    expect(processor.fetchImage).not.toHaveBeenCalled();
  });

  it('повторяемая ошибка не на последней попытке — бросает для BullMQ', async () => {
    (processor.fetchImage as jest.Mock).mockRejectedValue(new ImageFetchError('FETCH_FAILED', true));
    await expect(processor.process('p1', false)).rejects.toBeInstanceOf(ImageFetchError);
    expect(attacher.fail).not.toHaveBeenCalled();
  });

  it('повторяемая ошибка на последней попытке — FAILED с кодом и HTTP-статусом', async () => {
    (processor.fetchImage as jest.Mock).mockRejectedValue(new ImageFetchError('HTTP_ERROR', true, 503));
    await processor.process('p1', true);
    expect(attacher.fail).toHaveBeenCalledWith('p1', 'HTTP_ERROR', 503);
  });

  it('неповторяемая ошибка — FAILED сразу', async () => {
    (processor.fetchImage as jest.Mock).mockRejectedValue(new ImageFetchError('NOT_AN_IMAGE', false));
    await processor.process('p1', false);
    expect(attacher.fail).toHaveBeenCalledWith('p1', 'NOT_AN_IMAGE', null);
  });

  it('неожиданная ошибка скачивания — логируется и FAILED INTERNAL без повтора', async () => {
    const logError = jest.spyOn((processor as any).logger, 'error').mockImplementation(() => undefined);
    (processor.fetchImage as jest.Mock).mockRejectedValue(new TypeError('boom'));
    await expect(processor.process('p1', false)).resolves.toBeUndefined();
    expect(attacher.fail).toHaveBeenCalledWith('p1', 'INTERNAL', null);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('сбой прикрепления: не последняя попытка — бросает, последняя — FAILED INTERNAL', async () => {
    attacher.attach.mockRejectedValue(new Error('s3 down'));
    await expect(processor.process('p1', false)).rejects.toThrow('s3 down');
    await processor.process('p1', true);
    expect(attacher.fail).toHaveBeenCalledWith('p1', 'INTERNAL', null);
  });
});
