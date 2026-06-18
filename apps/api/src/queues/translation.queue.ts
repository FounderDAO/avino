import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsOptions, Queue } from 'bullmq';
import { buildBullConnection } from './bullmq-connection';
import {
  TRANSLATE_LISTING_JOB,
  TRANSLATION_QUEUE_NAME,
  TranslateListingJobData,
} from './queue.constants';

/**
 * TranslationQueue — продюсер очереди авто-перевода (TASK-071, ARCHITECTURE §23).
 *
 * Тонкая обёртка над BullMQ `Queue('translation_queue')` с дефолтными опциями
 * ретрая (acceptance: «failed jobs can retry»): `attempts` из
 * `TRANSLATE_QUEUE_ATTEMPTS`, экспоненциальный backoff. Соединение Redis —
 * отдельное от {@link RedisService} (BullMQ рекомендует выделенные подключения
 * для продюсера/воркера, `maxRetriesPerRequest: null`).
 *
 * `jobId = translate-<listingId>` дедуплицирует параллельные постановки по одному
 * листингу; воркер всё равно идемпотентен (upsert), так что повтор безопасен.
 * Разделитель — дефис, НЕ двоеточие: BullMQ использует `:` как внутренний
 * разделитель ключей Redis и с версии 5 отвергает кастомный `jobId` с `:`
 * («Custom Id cannot contain :»), из-за чего постановка падала, а вызывающий
 * код (ModerationService) глотал исключение — авто-перевод не запускался.
 */
@Injectable()
export class TranslationQueue implements OnModuleDestroy {
  private readonly logger = new Logger(TranslationQueue.name);
  private readonly queue: Queue<TranslateListingJobData>;
  private readonly jobOptions: JobsOptions;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.queue = new Queue<TranslateListingJobData>(TRANSLATION_QUEUE_NAME, {
      connection: buildBullConnection(url),
    });
    this.jobOptions = {
      attempts: configService.get<number>('translate.queueAttempts') ?? 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 100,
    };
  }

  /** Поставить джобу перевода объявления (после APPROVE→ACTIVE, ADR-005). */
  async enqueueListingTranslation(listingId: string): Promise<void> {
    await this.queue.add(
      TRANSLATE_LISTING_JOB,
      { listingId },
      { ...this.jobOptions, jobId: `translate-${listingId}` },
    );
    this.logger.debug(`Enqueued translation job for listing ${listingId}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
