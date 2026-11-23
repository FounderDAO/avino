const addBulk = jest.fn().mockResolvedValue([]);
const QueueMock = jest.fn().mockImplementation(() => ({ addBulk, close: jest.fn() }));
jest.mock('bullmq', () => ({ Queue: QueueMock }));

import { ConfigService } from '@nestjs/config';
import { ListingUrlSyncQueue } from './listing-url-sync.queue';

function config(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const enabled = config({
  'redis.url': 'redis://localhost:6379',
  'seoSync.url': 'https://avino.uz/api/seo/sync',
  'seoSync.delayMs': 60_000,
});

describe('ListingUrlSyncQueue (SEO AUD-11)', () => {
  beforeEach(() => {
    addBulk.mockClear();
    QueueMock.mockClear();
  });

  it('enqueues one delayed job per listing with jobId = listingId (repeats collapse)', async () => {
    await new ListingUrlSyncQueue(enabled).enqueue(['l1', 'l2', 'l1']);
    expect(addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'sync_listing_urls',
        data: { listingId: 'l1' },
        opts: expect.objectContaining({ jobId: 'l1', delay: 60_000, attempts: 5, removeOnFail: true }),
      }),
      expect.objectContaining({ data: { listingId: 'l2' }, opts: expect.objectContaining({ jobId: 'l2' }) }),
    ]);
  });

  it('is a no-op when the site URL is not configured (no Redis connection)', async () => {
    const queue = new ListingUrlSyncQueue(config({ 'redis.url': 'redis://localhost:6379', 'seoSync.url': '' }));
    await queue.enqueue(['l1']);
    expect(QueueMock).not.toHaveBeenCalled();
    expect(addBulk).not.toHaveBeenCalled();
  });

  it('does not throw when Redis rejects the job (the edit itself must succeed)', async () => {
    addBulk.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(new ListingUrlSyncQueue(enabled).enqueue(['l1'])).resolves.toBeUndefined();
  });
});
