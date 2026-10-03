const addBulk = jest.fn().mockResolvedValue([]);
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ addBulk, close: jest.fn() })),
}));

import { ConfigService } from '@nestjs/config';
import { ListingImportPhotoQueue } from './listing-import-photo.queue';

describe('ListingImportPhotoQueue', () => {
  const config = { get: (key: string) => (key === 'redis.url' ? 'redis://localhost:6379' : undefined) } as ConfigService;

  beforeEach(() => addBulk.mockClear());

  it('ставит задачу на фото с jobId = photoId и removeOnFail: true', async () => {
    await new ListingImportPhotoQueue(config).enqueue(['p1', 'p2']);
    expect(addBulk).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'fetch_import_photo', data: { photoId: 'p1' }, opts: expect.objectContaining({ jobId: 'p1', attempts: 3, removeOnFail: true }) }),
      expect.objectContaining({ data: { photoId: 'p2' }, opts: expect.objectContaining({ jobId: 'p2' }) }),
    ]);
  });

  it('пустой список — без обращения к Redis', async () => {
    await new ListingImportPhotoQueue(config).enqueue([]);
    expect(addBulk).not.toHaveBeenCalled();
  });
});
