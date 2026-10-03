import { Injectable } from '@nestjs/common';
import { ListingImportPhoto, ListingImportPhotoStatus, ListingStatus } from '@prisma/client';
import { ImageMimeType, ListingMediaService, MAX_MEDIA_PER_LISTING } from '../listing-media';
import { PrismaService } from '../prisma';
import { ImportPhotoErrorCode } from './safe-image-fetch';

class PhotoAlreadyDone extends Error {}

/**
 * Прикрепление фото импорта к галерее (спека 2026-10-03 §2) — общее для воркера
 * ссылок и загрузки из папки. Put в хранилище — вне транзакции (до 10 МБ не
 * успеет в таймаут интерактивной транзакции); запись медиа и `DONE` — одной
 * транзакцией с условным апдейтом. Объект без записи уберёт media-cleanup.
 */
@Injectable()
export class ImportPhotoAttacher {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: ListingMediaService,
  ) {}

  async attach(
    photo: { id: string; listingId: string; position: number },
    buffer: Buffer,
    mimeType: ImageMimeType,
  ): Promise<ListingImportPhoto> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: photo.listingId },
      select: { status: true },
    });
    if (!listing || listing.status === ListingStatus.DELETED) {
      return this.fail(photo.id, 'LISTING_UNAVAILABLE');
    }
    if ((await this.prisma.listingMedia.count({ where: { listingId: photo.listingId } })) >= MAX_MEDIA_PER_LISTING) {
      return this.fail(photo.id, 'MEDIA_LIMIT');
    }
    const stored = await this.media.uploadToStorage(photo.listingId, buffer, mimeType);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const media = await this.media.createMediaRecord(tx, photo.listingId, {
          ...stored,
          mimeType,
          sizeBytes: buffer.length,
          sortOrder: photo.position,
        });
        const { count } = await tx.listingImportPhoto.updateMany({
          where: {
            id: photo.id,
            status: {
              in: [ListingImportPhotoStatus.PENDING, ListingImportPhotoStatus.AWAITING_UPLOAD, ListingImportPhotoStatus.FAILED],
            },
          },
          data: { status: ListingImportPhotoStatus.DONE, mediaId: media.id, errorCode: null, httpStatus: null },
        });
        // Фото уже DONE (параллельная загрузка): откатываем вторую запись медиа.
        if (count === 0) throw new PhotoAlreadyDone();
        return tx.listingImportPhoto.findUniqueOrThrow({ where: { id: photo.id } });
      });
    } catch (error) {
      if (error instanceof PhotoAlreadyDone) {
        return this.prisma.listingImportPhoto.findUniqueOrThrow({ where: { id: photo.id } });
      }
      throw error;
    }
  }

  /** Пометить фото неудачным; уже загруженное (`DONE`) не трогаем. */
  async fail(photoId: string, code: ImportPhotoErrorCode, httpStatus: number | null = null): Promise<ListingImportPhoto> {
    await this.prisma.listingImportPhoto.updateMany({
      where: { id: photoId, status: { not: ListingImportPhotoStatus.DONE } },
      data: { status: ListingImportPhotoStatus.FAILED, errorCode: code, httpStatus },
    });
    return this.prisma.listingImportPhoto.findUniqueOrThrow({ where: { id: photoId } });
  }
}
