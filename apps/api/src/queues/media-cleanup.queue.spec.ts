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
import { CLEANUP_ORPHAN_MEDIA_JOB } from './queue.constants';
import { MediaCleanupQueue } from './media-cleanup.queue';

/**
 * Юнит-тесты продюсера `media_cleanup_queue`. Проверяют config-gating: при
 * enabled=true джоба регистрируется по cron; при enabled=false — НЕ регистрируется.
 */
describe('MediaCleanupQueue', () => {
  const config = (enabled: boolean, cron?: string): ConfigService =>
    ({
      get: (key: string) =>
        key === 'redis.url'
          ? 'redis://localhost:6379'
          : key === 'mediaCleanup.enabled'
            ? enabled
            : key === 'mediaCleanup.cron'
              ? cron
              : undefined,
    }) as unknown as ConfigService;

  beforeEach(() => {
    upsertMock.mockReset();
    closeMock.mockReset();
    (Queue as unknown as jest.Mock).mockClear();
  });

  it('регистрирует cleanup_orphan_media по cron, когда включено', async () => {
    const queue = new MediaCleanupQueue(config(true, '0 4 * * *'));
    await queue.onModuleInit();
    expect(upsertMock).toHaveBeenCalledWith(
      expect.any(String),
      { pattern: '0 4 * * *' },
      expect.objectContaining({ name: CLEANUP_ORPHAN_MEDIA_JOB }),
    );
  });

  it('НЕ регистрирует джобу, когда выключено', async () => {
    const queue = new MediaCleanupQueue(config(false));
    await queue.onModuleInit();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
