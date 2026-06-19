import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import {
  EXCHANGE_RATE_QUEUE_NAME,
  REFRESH_EXCHANGE_RATE_JOB,
} from '../queues/queue.constants';

/** Стабильный id планировщика repeatable-джобы (для upsert при рестартах). */
const SCHEDULER_ID = 'refresh-exchange-rate';

/**
 * ExchangeRateQueue — продюсер очереди `exchange_rate_queue`. Тонкая обёртка
 * над BullMQ `Queue` с выделенным Redis-подключением.
 *
 * В `onModuleInit` регистрирует (idempotent) repeatable job
 * `refresh_exchange_rate` через `upsertJobScheduler`. cron-паттерн и timezone
 * берутся из конфигурационного namespace `exchangeRate` (ключи `cron`,
 * `timezone`). Бизнес-логика — в `ExchangeRateService`; консьюмер —
 * `ExchangeRateWorker`.
 */
@Injectable()
export class ExchangeRateQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExchangeRateQueue.name);
  private readonly queue: Queue;
  private readonly cron: string;
  private readonly tz: string;

  constructor(config: ConfigService) {
    const url = config.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.cron = config.get<string>('exchangeRate.cron') ?? '0 6 * * *';
    this.tz = config.get<string>('exchangeRate.timezone') ?? 'Asia/Tashkent';
    this.queue = new Queue(EXCHANGE_RATE_QUEUE_NAME, {
      connection: buildBullConnection(url),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      SCHEDULER_ID,
      { pattern: this.cron, tz: this.tz },
      {
        name: REFRESH_EXCHANGE_RATE_JOB,
        data: {},
        opts: { removeOnComplete: true, removeOnFail: 100 },
      },
    );
    this.logger.log(
      `Scheduled ${REFRESH_EXCHANGE_RATE_JOB} (cron="${this.cron}", tz="${this.tz}")`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
