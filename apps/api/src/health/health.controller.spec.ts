import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

describe('HealthController', () => {
  const makeController = (opts: { dbOk: boolean; redisOk: boolean }) => {
    const prisma = {
      $queryRaw: jest.fn(() =>
        opts.dbOk
          ? Promise.resolve([{ '?column?': 1 }])
          : Promise.reject(new Error('db down')),
      ),
    } as unknown as PrismaService;
    const redis = {
      ping: jest.fn(() =>
        opts.redisOk
          ? Promise.resolve('PONG')
          : Promise.reject(new Error('redis down')),
      ),
    } as unknown as RedisService;
    return new HealthController(prisma, redis);
  };

  it('возвращает ok + checks up, когда PG и Redis живы', async () => {
    const controller = makeController({ dbOk: true, redisOk: true });
    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      service: 'avino-api',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('кидает 503 с database=down при недоступной БД', async () => {
    const controller = makeController({ dbOk: false, redisOk: true });
    const error = await controller.check().catch((e) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getResponse()).toMatchObject({
      status: 'degraded',
      checks: { database: 'down', redis: 'up' },
    });
  });

  it('кидает 503 с redis=down при недоступном Redis', async () => {
    const controller = makeController({ dbOk: true, redisOk: false });
    const error = await controller.check().catch((e) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getResponse()).toMatchObject({
      status: 'degraded',
      checks: { database: 'up', redis: 'down' },
    });
  });
});
