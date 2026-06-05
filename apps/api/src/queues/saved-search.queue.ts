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
  CHECK_SAVED_SEARCHES_JOB,
  SAVED_SEARCH_QUEUE_NAME,
} from './queue.constants';

/** Стабильный id планировщика repeatable-джобы (для upsert при рестартах). */
const CHECK_SCHEDULER_ID = 'check-saved-searches';

/**
 * SavedSearchQueue — продюсер очереди `saved_search_queue` (TASK-102, acceptance:
 * `saved_search_queue` exists). По аналогии с {@link PromotionQueue}: тонкая
 * обёртка над BullMQ `Queue` с выделенным Redis-подключением.
 *
 * Матчинг сохранённых поисков в MVP — фоновый polling-sweep по расписанию
 * (ARCHITECTURE §16): на старте регистрируется repeatable job
 * (`check_saved_searches`) через `upsertJobScheduler` с cron-паттерном из
 * `SAVED_SEARCH_ALERT_CRON` (по умолчанию каждые 5 минут — алерты не требуют
 * минутной срочности истечения промо). `upsert` идемпотентен — повторный буст
 * процесса не плодит дубли расписаний. Бизнес-логика живёт в
 * `SavedSearchAlertService` (консьюмер — `SavedSearchWorker`).
 */
@Injectable()
export class SavedSearchQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SavedSearchQueue.name);
  private readonly queue: Queue;
  private readonly cron: string;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.cron =
      configService.get<string>('savedSearch.alertCron') ?? '*/5 * * * *';
    this.queue = new Queue(SAVED_SEARCH_QUEUE_NAME, {
      connection: buildBullConnection(url),
    });
  }

  /** Зарегистрировать (idempotent) периодический матчинг сохранённых поисков. */
  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      CHECK_SCHEDULER_ID,
      { pattern: this.cron },
      {
        name: CHECK_SAVED_SEARCHES_JOB,
        data: {},
        opts: { removeOnComplete: true, removeOnFail: 100 },
      },
    );
    this.logger.log(
      `Scheduled ${CHECK_SAVED_SEARCHES_JOB} (cron="${this.cron}")`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
