import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import { EXCHANGE_RATE_QUEUE_NAME } from '../queues/queue.constants';
import { ExchangeRateService } from './exchange-rate.service';

/**
 * ExchangeRateWorker — консьюмер очереди `exchange_rate_queue`. Тонкий
 * транспорт BullMQ: получает джобу `refresh_exchange_rate` и делегирует
 * {@link ExchangeRateService.refreshFromCbu}. Ошибки пробрасываются —
 * BullMQ применит ретрай.
 *
 * Cold-start: если при запуске нет ни одной записи (первый деплой, чистая БД),
 * немедленно вызывает `refreshFromCbu()` best-effort — ошибки только WARN-лог,
 * загрузка сервиса не прерывается.
 */
@Injectable()
export class ExchangeRateWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExchangeRateWorker.name);
  private worker?: Worker;

  constructor(
    private readonly config: ConfigService,
    private readonly service: ExchangeRateService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }

    this.worker = new Worker(
      EXCHANGE_RATE_QUEUE_NAME,
      () => this.service.refreshFromCbu(),
      { connection: buildBullConnection(url), concurrency: 1 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Exchange-rate job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
      );
    });

    // Cold start: если курс ещё не загружен (первый деплой) — тянем немедленно.
    void this.coldStart();
    this.logger.log('Exchange-rate worker started (concurrency=1)');
  }

  private async coldStart(): Promise<void> {
    try {
      if (!(await this.service.getCurrent())) {
        await this.service.refreshFromCbu();
      }
    } catch (err) {
      this.logger.warn(`Cold-start refresh skipped: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
