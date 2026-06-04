import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { buildBullConnection } from './bullmq-connection';
import {
  EXPIRE_LISTING_PROMOTIONS_JOB,
  PROMOTION_QUEUE_NAME,
} from './queue.constants';

/** Стабильный id планировщика repeatable-джобы (для upsert при рестартах). */
const EXPIRY_SCHEDULER_ID = 'expire-listing-promotions';

/**
 * PromotionQueue — продюсер очереди `promotion_queue` (TASK-123, acceptance:
 * `promotion_queue` exists). По аналогии с {@link TranslationQueue}: тонкая
 * обёртка над BullMQ `Queue` с выделенным Redis-подключением.
 *
 * В отличие от перевода (точечная джоба на листинг) истечение промо — фоновый
 * sweep по расписанию: на старте регистрируется repeatable job
 * (`expire_listing_promotions`) через `upsertJobScheduler` с cron-паттерном из
 * `PROMOTION_EXPIRY_CRON`. `upsert` идемпотентен — повторный буст процесса не
 * плодит дубли расписаний. Сама бизнес-логика живёт в `PromotionExpiryService`
 * (консьюмер — `PromotionWorker`).
 */
@Injectable()
export class PromotionQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PromotionQueue.name);
  private readonly queue: Queue;
  private readonly cron: string;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.cron = configService.get<string>('promotion.expiryCron') ?? '* * * * *';
    this.queue = new Queue(PROMOTION_QUEUE_NAME, {
      connection: buildBullConnection(url),
    });
  }

  /** Зарегистрировать (idempotent) периодический sweep истечения промо. */
  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      EXPIRY_SCHEDULER_ID,
      { pattern: this.cron },
      {
        name: EXPIRE_LISTING_PROMOTIONS_JOB,
        data: {},
        opts: { removeOnComplete: true, removeOnFail: 100 },
      },
    );
    this.logger.log(
      `Scheduled ${EXPIRE_LISTING_PROMOTIONS_JOB} (cron="${this.cron}")`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
