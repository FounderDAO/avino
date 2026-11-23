import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { buildBullConnection } from './bullmq-connection';
import {
  MEDIA_PROCESSING_JOB_OPTIONS,
  MEDIA_PROCESSING_QUEUE_NAME,
  PROCESS_UPLOADED_IMAGE_JOB,
  ProcessUploadedImageJobData,
} from './queue.constants';

/**
 * Продюсер `media_processing_queue` (SEO AUD-8): после записи фото — WebP-варианты
 * в фоне. Ошибка постановки не роняет загрузку: фото остаётся с оригиналом,
 * варианты доставит scripts/backfill-media-variants.
 */
@Injectable()
export class MediaProcessingQueue implements OnModuleDestroy {
  private readonly logger = new Logger(MediaProcessingQueue.name);
  private readonly queue?: Queue<ProcessUploadedImageJobData>;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('redis.url');
    if (url) {
      this.queue = new Queue<ProcessUploadedImageJobData>(MEDIA_PROCESSING_QUEUE_NAME, {
        connection: buildBullConnection(url),
      });
    }
  }

  async enqueue(mediaIds: string[]): Promise<void> {
    if (!this.queue || mediaIds.length === 0) return;
    try {
      await this.queue.addBulk(
        [...new Set(mediaIds)].map((mediaId) => ({
          name: PROCESS_UPLOADED_IMAGE_JOB,
          data: { mediaId },
          opts: { ...MEDIA_PROCESSING_JOB_OPTIONS, jobId: mediaId },
        })),
      );
    } catch (err) {
      this.logger.warn(`Media processing enqueue failed for ${mediaIds.length} media: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
