import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

/**
 * RedisService — единый клиент Redis (TASK-041, CLAUDE.md §3).
 *
 * Расширяет ioredis `Redis` и управляет жизненным циклом подключения через
 * хуки NestJS, по аналогии с {@link PrismaService}. Используется как backend для
 * OTP/общего rate-limit (ARCHITECTURE §23 «OTP rate limiting»), а в дальнейшем —
 * для BullMQ-очередей и кэша.
 *
 * Экспортируется глобально из {@link RedisModule}, поэтому инжектируется в любой
 * модуль без повторного импорта.
 */
@Injectable()
export class RedisService
  extends Redis
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisService.name);

  constructor(configService: ConfigService) {
    const url = configService.get<string>('redis.url');
    if (!url) {
      // env.validation.ts гарантирует наличие REDIS_URL (fail-fast), но
      // подстрахуемся явной ошибкой вместо немого падения внутри ioredis.
      throw new Error('REDIS_URL is not configured');
    }
    // maxRetriesPerRequest: null — требование BullMQ и безопасный дефолт для
    // команд rate-limit (не зависаем на бесконечных ретраях при недоступности).
    super(url, { maxRetriesPerRequest: null, lazyConnect: true });
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
    this.logger.log('Redis connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit();
    this.logger.log('Redis disconnected');
  }
}
