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
import { PromotionQueue } from './promotion.queue';
import {
  EXPIRE_LISTING_PROMOTIONS_JOB,
  PROMOTION_QUEUE_NAME,
} from './queue.constants';

/**
 * Юнит-тесты продюсера `promotion_queue` (TASK-123). BullMQ `Queue` мокается.
 * Проверяют имя очереди, регистрацию repeatable-джобы `expire_listing_promotions`
 * по cron из конфигурации (idempotent upsert) и дефолтный cron.
 */
describe('PromotionQueue', () => {
  const config = (cron?: string): ConfigService =>
    ({
      get: (key: string) =>
        key === 'redis.url'
          ? 'redis://localhost:6379'
          : key === 'promotion.expiryCron'
            ? cron
            : undefined,
    }) as unknown as ConfigService;

  const prisma = (cron?: string) =>
    ({
      appSetting: { findUnique: jest.fn().mockResolvedValue(cron ? { value: cron } : null) },
    }) as never;

  beforeEach(() => {
    upsertMock.mockReset();
    closeMock.mockReset();
    (Queue as unknown as jest.Mock).mockClear();
  });

  it('creates the promotion_queue with the resolved connection', () => {
    new PromotionQueue(config('* * * * *'), prisma());
    expect(Queue).toHaveBeenCalledWith(
      PROMOTION_QUEUE_NAME,
      expect.objectContaining({ connection: expect.any(Object) }),
    );
  });

  it('schedules the expire_listing_promotions job with the configured cron', async () => {
    const queue = new PromotionQueue(config('*/5 * * * *'), prisma());

    await queue.onModuleInit();

    expect(upsertMock).toHaveBeenCalledWith(
      expect.any(String),
      { pattern: '*/5 * * * *' },
      expect.objectContaining({ name: EXPIRE_LISTING_PROMOTIONS_JOB }),
    );
  });

  it('defaults to every-minute cron when not configured', async () => {
    const queue = new PromotionQueue(config(undefined), prisma());
    await queue.onModuleInit();
    expect(upsertMock.mock.calls[0][1]).toEqual({ pattern: '* * * * *' });
  });
});
