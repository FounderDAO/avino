import {
  ListingImportPhoto,
  ListingImportPhotoSource,
  ListingImportPhotoStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma';
import { ImportPhotoReport, ImportPhotosSummary } from './import-report';
import { ParsedPhoto } from './import-photos.parser';

type Db = Prisma.TransactionClient | PrismaService;

export const EMPTY_PHOTO_SUMMARY: ImportPhotosSummary = { total: 0, done: 0, failed: 0, pending: 0, awaiting_upload: 0 };

/** Фото, ещё не записанные в БД (предпросмотр, проигнорированные). */
export function draftPhotoReports(photos: ParsedPhoto[]): ImportPhotoReport[] {
  return photos.map((photo) => ({
    id: null,
    position: photo.position,
    source: photo.source,
    ref: photo.ref,
    status: null,
    error_code: null,
    http_status: null,
  }));
}

export function toPhotoReport(record: ListingImportPhoto): ImportPhotoReport {
  return {
    id: record.id,
    position: record.position,
    source: record.source,
    ref: record.ref,
    status: record.status,
    error_code: record.errorCode,
    http_status: record.httpStatus,
  };
}

/**
 * Фото строки «уже существует» прикрепляются, только если в галерее пусто и
 * другой импорт не грузит туда же (спека 2026-10-03 §1).
 */
export async function canAttachPhotos(db: Db, listingId: string): Promise<boolean> {
  const [media, open] = await Promise.all([
    db.listingMedia.count({ where: { listingId } }),
    db.listingImportPhoto.count({
      where: {
        listingId,
        status: { in: [ListingImportPhotoStatus.PENDING, ListingImportPhotoStatus.AWAITING_UPLOAD] },
      },
    }),
  ]);
  return media === 0 && open === 0;
}

export async function createPhotoRecords(
  db: Db,
  importId: string,
  rowNumber: number,
  listingId: string,
  photos: ParsedPhoto[],
): Promise<void> {
  if (photos.length === 0) return;
  await db.listingImportPhoto.createMany({
    data: photos.map((photo) => ({
      importId,
      rowNumber,
      listingId,
      position: photo.position,
      source: photo.source as ListingImportPhotoSource,
      ref: photo.ref,
      status:
        photo.source === 'URL' ? ListingImportPhotoStatus.PENDING : ListingImportPhotoStatus.AWAITING_UPLOAD,
    })),
  });
}

/** Счётчики фото по импортам одним `groupBy`. */
export async function photoSummaries(db: Db, importIds: string[]): Promise<Map<string, ImportPhotosSummary>> {
  const result = new Map(importIds.map((id) => [id, { ...EMPTY_PHOTO_SUMMARY }]));
  if (importIds.length === 0) return result;
  const groups = await db.listingImportPhoto.groupBy({
    by: ['importId', 'status'],
    where: { importId: { in: importIds } },
    _count: { _all: true },
  });
  const field: Record<ListingImportPhotoStatus, keyof ImportPhotosSummary> = {
    PENDING: 'pending',
    AWAITING_UPLOAD: 'awaiting_upload',
    DONE: 'done',
    FAILED: 'failed',
  };
  for (const group of groups) {
    const summary = result.get(group.importId);
    if (!summary) continue;
    summary[field[group.status]] += group._count._all;
    summary.total += group._count._all;
  }
  return result;
}
