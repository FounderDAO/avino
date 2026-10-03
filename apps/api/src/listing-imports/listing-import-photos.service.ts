import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ListingImportPhotoSource, ListingImportPhotoStatus } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { MEDIA_MAX_FILE_BYTES } from '../listing-media';
import { PrismaService } from '../prisma';
import { ListingImportPhotoQueue } from '../queues';
import { ImportUploadedFile } from './import-file.parser';
import { ImportPhotoAttacher } from './import-photo.attacher';
import { EMPTY_PHOTO_SUMMARY, photoSummaries, toPhotoReport } from './import-photo.records';
import { decodeUploadedFileName, ImportPhotoReport, ImportPhotosSummary } from './import-report';
import { sniffImageMime } from './safe-image-fetch';

/**
 * Фото сохранённого импорта (спека 2026-10-03 §4): загрузка файла из папки,
 * повтор ссылок, счётчики для опроса. Исходы на уровне фото — 200 с элементом;
 * HTTP-ошибки — только для ошибок самого запроса.
 */
@Injectable()
export class ListingImportPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attacher: ImportPhotoAttacher,
    private readonly queue: ListingImportPhotoQueue,
  ) {}

  async upload(importId: string, photoId: string, file: ImportUploadedFile | undefined): Promise<ImportPhotoReport> {
    if (!file) {
      throw new BadRequestException({ code: ApiErrorCode.VALIDATION_ERROR, message: 'File is required (multipart field "file")' });
    }
    if (file.size > MEDIA_MAX_FILE_BYTES) {
      throw new HttpException(
        { code: ApiErrorCode.IMPORT_PHOTO_TOO_LARGE, message: `File is larger than ${MEDIA_MAX_FILE_BYTES} bytes` },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
    const photo = await this.prisma.listingImportPhoto.findFirst({ where: { id: photoId, importId } });
    if (!photo) {
      throw new NotFoundException({ code: ApiErrorCode.NOT_FOUND, message: 'Photo not found' });
    }
    if (photo.source !== ListingImportPhotoSource.FILE) {
      throw new HttpException({ code: ApiErrorCode.IMPORT_PHOTO_NOT_FILE, message: 'Photo is a URL, not a file' }, HttpStatus.CONFLICT);
    }
    // Браузер может прислать относительный путь из выбранной папки — сравниваем имя.
    // NFC: macOS отдаёт имена в NFD («й», «ё» — буква + диакритика), а в файле импорта — NFC.
    const name = decodeUploadedFileName(file.originalname).split(/[\\/]/).pop() ?? '';
    if (name.normalize('NFC').toLowerCase() !== photo.ref.normalize('NFC').toLowerCase()) {
      throw new HttpException(
        { code: ApiErrorCode.IMPORT_PHOTO_NAME_MISMATCH, message: 'File name does not match the photo' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (photo.status === ListingImportPhotoStatus.DONE) return toPhotoReport(photo);
    const mimeType = sniffImageMime(file.buffer);
    if (!mimeType) return toPhotoReport(await this.attacher.fail(photo.id, 'NOT_AN_IMAGE'));
    return toPhotoReport(await this.attacher.attach(photo, file.buffer, mimeType));
  }

  /** Повтор ссылок: FAILED → PENDING, и все PENDING (в т.ч. «зависшие» после сбоя постановки) — в очередь. */
  async retry(importId: string): Promise<{ queued: number }> {
    await this.assertImport(importId);
    const photos = await this.prisma.listingImportPhoto.findMany({
      where: {
        importId,
        source: ListingImportPhotoSource.URL,
        status: { in: [ListingImportPhotoStatus.PENDING, ListingImportPhotoStatus.FAILED] },
      },
      select: { id: true },
    });
    const ids = photos.map((photo) => photo.id);
    if (ids.length === 0) return { queued: 0 };
    await this.prisma.listingImportPhoto.updateMany({
      where: { id: { in: ids }, status: ListingImportPhotoStatus.FAILED },
      data: { status: ListingImportPhotoStatus.PENDING, errorCode: null, httpStatus: null, attempts: 0 },
    });
    await this.queue.enqueue(ids);
    return { queued: ids.length };
  }

  async summary(importId: string): Promise<ImportPhotosSummary> {
    await this.assertImport(importId);
    return (await photoSummaries(this.prisma, [importId])).get(importId) ?? { ...EMPTY_PHOTO_SUMMARY };
  }

  private async assertImport(importId: string): Promise<void> {
    const found = await this.prisma.listingImport.findUnique({ where: { id: importId }, select: { id: true } });
    if (!found) {
      throw new NotFoundException({ code: ApiErrorCode.NOT_FOUND, message: 'Import not found' });
    }
  }
}
