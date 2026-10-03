import { Injectable, Logger } from '@nestjs/common';
import { ListingImportPhotoSource, ListingImportPhotoStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import { ImportPhotoAttacher } from './import-photo.attacher';
import { ImageFetchError, safeFetchImage } from './safe-image-fetch';

/**
 * Одна задача `fetch_import_photo` (спека 2026-10-03 §3) без BullMQ — чтобы
 * тестировать отдельно от очереди. Повторяемая ошибка не на последней попытке
 * бросается (BullMQ повторит с backoff), иначе фото получает `FAILED`.
 */
@Injectable()
export class ImportPhotoFetchProcessor {
  private readonly logger = new Logger(ImportPhotoFetchProcessor.name);
  /** Подменяется в тестах. */
  fetchImage: (url: string) => ReturnType<typeof safeFetchImage> = (url) => safeFetchImage(url);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attacher: ImportPhotoAttacher,
  ) {}

  async process(photoId: string, isLastAttempt: boolean): Promise<void> {
    const photo = await this.prisma.listingImportPhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.source !== ListingImportPhotoSource.URL || photo.status !== ListingImportPhotoStatus.PENDING) {
      return;
    }
    await this.prisma.listingImportPhoto.update({ where: { id: photoId }, data: { attempts: { increment: 1 } } });

    let image: Awaited<ReturnType<typeof safeFetchImage>>;
    try {
      image = await this.fetchImage(photo.ref);
    } catch (error) {
      const failure = error instanceof ImageFetchError ? error : new ImageFetchError('INTERNAL', false);
      if (failure.retryable && !isLastAttempt) throw failure;
      await this.attacher.fail(photoId, failure.code, failure.httpStatus);
      return;
    }

    try {
      await this.attacher.attach(photo, image.buffer, image.mimeType);
    } catch (error) {
      if (!isLastAttempt) throw error;
      this.logger.error(`Import photo ${photoId} attach failed`, error as Error);
      await this.attacher.fail(photoId, 'INTERNAL', null);
    }
  }
}
