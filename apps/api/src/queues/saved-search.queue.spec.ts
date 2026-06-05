import { ConfigService } from '@nestjs/config';

const upsertMock = jest.fn();
const closeMock = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    upsertJobScheduler: upsertMock,
    close: closeMock,
  })),
}));

import { Queue } from 'bullmq';
import {
  CHECK_SAVED_SEARCHES_JOB,
  SAVED_SEARCH_QUEUE_NAME,
} from './queue.constants';
import { SavedSearchQueue } from './saved-search.queue';

/**
 * Юнит-тесты продюсера `saved_search_queue` (TASK-102). BullMQ `Queue` мокается.
 * Проверяют имя очереди, регистрацию repeatable-джобы `check_saved_searches`
 * по cron из конфигурации (idempotent upsert) и дефолтный cron (каждые 5 минут).
 */
describe('SavedSearchQueue', () => {
  const config = (cron?: string): ConfigService =>
    ({
      get: (key: string) =>
        key === 'redis.url'
          ? 'redis://localhost:6379'
          : key === 'savedSearch.alertCron'
            ? cron
            : undefined,
    }) as unknown as ConfigService;

  beforeEach(() => {
    upsertMock.mockReset();
    closeMock.mockReset();
    (Queue as unknown as jest.Mock).mockClear();
  });

  it('creates the saved_search_queue with the resolved connection', () => {
    new SavedSearchQueue(config('*/5 * * * *'));
    expect(Queue).toHaveBeenCalledWith(
      SAVED_SEARCH_QUEUE_NAME,
      expect.objectContaining({ connection: expect.any(Object) }),
    );
  });

  it('schedules the check_saved_searches job with the configured cron', async () => {
    const queue = new SavedSearchQueue(config('*/10 * * * *'));

    await queue.onModuleInit();

    expect(upsertMock).toHaveBeenCalledWith(
      expect.any(String),
      { pattern: '*/10 * * * *' },
      expect.objectContaining({ name: CHECK_SAVED_SEARCHES_JOB }),
    );
  });

  it('defaults to every-5-minutes cron when not configured', async () => {
    const queue = new SavedSearchQueue(config(undefined));
    await queue.onModuleInit();
    expect(upsertMock.mock.calls[0][1]).toEqual({ pattern: '*/5 * * * *' });
  });

  it('throws when REDIS_URL is not configured', () => {
    const noRedis = {
      get: () => undefined,
    } as unknown as ConfigService;
    expect(() => new SavedSearchQueue(noRedis)).toThrow('REDIS_URL');
  });
});
