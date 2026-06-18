import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma';
import { PROMOTION_EXPIRY_CRON_KEY } from '../promotions/promotion-expiry.cron';
import { buildBullConnection } from './bullmq-connection';
import {
  EXPIRE_LISTING_PROMOTIONS_JOB,
  PROMOTION_QUEUE_NAME,
} from './queue.constants';

/** Стабильный id планировщика repeatable-джобы (для upsert при рестартах). */
const EXPIRY_SCHEDULER_ID = 'expire-listing-promotions';

/**
 * PromotionQueue — продюсер очереди `promotion_queue` (TASK-123, acceptance:
 * `promotion_queue` exists). Тонкая обёртка над BullMQ `Queue` с выделенным
 * Redis-подключением.
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
  private cron: string;

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const url = configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.cron = configService.get<string>('promotion.expiryCron') ?? '* * * * *';
    this.queue = new Queue(PROMOTION_QUEUE_NAME, {
      connection: buildBullConnection(url),
    });
  }

  /**
   * Зарегистрировать (idempotent) периодический sweep истечения промо.
   * На старте интервал читается из app_settings (key `promotion_expiry_cron`),
   * с фоллбэком на cron из конфигурации/дефолт.
   */
  async onModuleInit(): Promise<void> {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key: PROMOTION_EXPIRY_CRON_KEY },
    });
    if (setting?.value) this.cron = setting.value;
    await this.rescheduleExpiry(this.cron);
  }

  /**
   * Перерегистрировать repeatable-джобу истечения промо с новым cron.
   * Idempotent (`upsertJobScheduler`) — используется и на старте, и при
   * живой смене интервала из ADMIN-настроек.
   */
  async rescheduleExpiry(cron: string): Promise<void> {
    this.cron = cron;
    await this.queue.upsertJobScheduler(
      EXPIRY_SCHEDULER_ID,
      { pattern: cron },
      {
        name: EXPIRE_LISTING_PROMOTIONS_JOB,
        data: {},
        opts: { removeOnComplete: true, removeOnFail: 100 },
      },
    );
    this.logger.log(
      `Rescheduled ${EXPIRE_LISTING_PROMOTIONS_JOB} (cron="${cron}")`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
