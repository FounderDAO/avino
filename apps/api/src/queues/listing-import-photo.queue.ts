import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { buildBullConnection } from './bullmq-connection';
import {
  FETCH_IMPORT_PHOTO_JOB,
  FetchImportPhotoJobData,
  LISTING_IMPORT_PHOTO_JOB_OPTIONS,
  LISTING_IMPORT_PHOTO_QUEUE_NAME,
} from './queue.constants';

/** Продюсер `listing_import_photo_queue` (спека 2026-10-03 §3), по образцу {@link EmailQueue}. */
@Injectable()
export class ListingImportPhotoQueue implements OnModuleDestroy {
  private readonly queue: Queue<FetchImportPhotoJobData>;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.queue = new Queue<FetchImportPhotoJobData>(LISTING_IMPORT_PHOTO_QUEUE_NAME, {
      connection: buildBullConnection(url),
    });
  }

  async enqueue(photoIds: string[]): Promise<void> {
    if (photoIds.length === 0) return;
    await this.queue.addBulk(
      photoIds.map((photoId) => ({
        name: FETCH_IMPORT_PHOTO_JOB,
        data: { photoId },
        opts: { ...LISTING_IMPORT_PHOTO_JOB_OPTIONS, jobId: photoId },
      })),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
