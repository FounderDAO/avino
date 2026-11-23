const addBulk = jest.fn().mockResolvedValue([]);
const QueueMock = jest.fn().mockImplementation(() => ({ addBulk, close: jest.fn() }));
jest.mock('bullmq', () => ({ Queue: QueueMock }));

import { ConfigService } from '@nestjs/config';
import { ListingTranslateQueue } from './listing-translate.queue';

const config = (onApprove: boolean) =>
  ({ get: (k: string) => ({ 'redis.url': 'redis://localhost:6379', 'translate.onApprove': onApprove })[k] }) as unknown as ConfigService;

describe('ListingTranslateQueue (SEO AUD-14)', () => {
  beforeEach(() => {
    addBulk.mockClear();
    QueueMock.mockClear();
  });

  it('enqueues approved listings when TRANSLATE_ON_APPROVE is on', async () => {
    await new ListingTranslateQueue(config(true)).enqueue(['l1']);
    expect(addBulk).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'translate_listing', data: { listingId: 'l1' }, opts: expect.objectContaining({ jobId: 'l1' }) }),
    ]);
  });

  it('is a no-op (no Redis connection) when the flag is off — owner decision pending', async () => {
    await new ListingTranslateQueue(config(false)).enqueue(['l1']);
    expect(QueueMock).not.toHaveBeenCalled();
    expect(addBulk).not.toHaveBeenCalled();
  });
});
