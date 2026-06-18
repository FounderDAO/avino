import { ConfigService } from '@nestjs/config';

const addMock = jest.fn();
const closeMock = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: addMock,
    close: closeMock,
  })),
}));

import { Queue } from 'bullmq';
import { TranslationQueue } from './translation.queue';
import {
  TRANSLATE_LISTING_JOB,
  TRANSLATION_QUEUE_NAME,
} from './queue.constants';

/**
 * Юнит-тесты продюсера очереди перевода (TASK-071). BullMQ `Queue` мокается.
 * Проверяют: имя очереди, имя/нагрузку джобы, дедуплицирующий jobId и опции
 * ретрая (acceptance: «failed jobs can retry»), а также чтение `attempts` из
 * конфигурации.
 */
describe('TranslationQueue', () => {
  const config = (attempts?: number): ConfigService =>
    ({
      get: (key: string) =>
        key === 'redis.url'
          ? 'redis://localhost:6379'
          : key === 'translate.queueAttempts'
            ? attempts
            : undefined,
    }) as unknown as ConfigService;

  beforeEach(() => {
    addMock.mockReset();
    closeMock.mockReset();
    (Queue as unknown as jest.Mock).mockClear();
  });

  it('creates the translation_queue with the resolved connection', () => {
    new TranslationQueue(config(3));
    expect(Queue).toHaveBeenCalledWith(
      TRANSLATION_QUEUE_NAME,
      expect.objectContaining({ connection: expect.any(Object) }),
    );
  });

  it('enqueues a translate_listing job with retry options and a dedup jobId', async () => {
    const queue = new TranslationQueue(config(5));

    await queue.enqueueListingTranslation('listing-1');

    expect(addMock).toHaveBeenCalledWith(
      TRANSLATE_LISTING_JOB,
      { listingId: 'listing-1' },
      expect.objectContaining({
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        jobId: 'translate-listing-1',
      }),
    );
  });

  it('uses a jobId without ":" (BullMQ rejects custom ids containing ":")', async () => {
    const queue = new TranslationQueue(config(3));

    await queue.enqueueListingTranslation('listing-3');

    const jobId = (addMock.mock.calls[0][2] as { jobId: string }).jobId;
    expect(jobId).not.toContain(':');
  });

  it('defaults to 3 attempts when not configured', async () => {
    const queue = new TranslationQueue(config(undefined));
    await queue.enqueueListingTranslation('listing-2');
    expect(addMock.mock.calls[0][2]).toMatchObject({ attempts: 3 });
  });
});
