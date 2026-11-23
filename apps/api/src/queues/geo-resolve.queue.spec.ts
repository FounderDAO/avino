const addBulk = jest.fn().mockResolvedValue([]);
jest.mock('bullmq', () => ({ Queue: jest.fn().mockImplementation(() => ({ addBulk, close: jest.fn() })) }));

import { ConfigService } from '@nestjs/config';
import { GeoResolveQueue } from './geo-resolve.queue';

const config = { get: (key: string) => (key === 'redis.url' ? 'redis://localhost:6379' : undefined) } as unknown as ConfigService;

describe('GeoResolveQueue (SEO AUD-2)', () => {
  beforeEach(() => addBulk.mockClear());

  it('enqueues one job per listing with jobId = listingId and retries', async () => {
    await new GeoResolveQueue(config).enqueue(['l1', 'l1', 'l2']);
    expect(addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'resolve_listing_district',
        data: { listingId: 'l1' },
        opts: expect.objectContaining({ jobId: 'l1', attempts: 6, removeOnFail: true }),
      }),
      expect.objectContaining({ data: { listingId: 'l2' } }),
    ]);
  });

  it('skips an empty list and survives a Redis error', async () => {
    await new GeoResolveQueue(config).enqueue([]);
    expect(addBulk).not.toHaveBeenCalled();
    addBulk.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(new GeoResolveQueue(config).enqueue(['l1'])).resolves.toBeUndefined();
  });
});
