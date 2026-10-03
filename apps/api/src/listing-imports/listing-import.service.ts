import { randomUUID } from 'crypto';
import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ListingImportOutcome, ListingImportPhotoStatus, Prisma } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { ListingCreateData, ListingsService } from '../listings/listings.service';
import { PrismaService } from '../prisma';
import { ListingImportPhotoQueue } from '../queues';
import { findOwnerDuplicate } from './import-duplicate.finder';
import { ImportUploadedFile, parseImportFile, RawImportRow } from './import-file.parser';
import {
  ensureOwner,
  lookupOwner,
  ownerError,
  OwnerUnavailableError,
} from './import-owner.resolver';
import {
  canAttachPhotos,
  createPhotoRecords,
  draftPhotoReports,
  EMPTY_PHOTO_SUMMARY,
  photoSummaries,
  toPhotoReport,
} from './import-photo.records';
import { parsePhotoCell } from './import-photos.parser';
import {
  decodeUploadedFileName,
  ImportPhotoReport,
  ImportPhotosSummary,
  ImportRowReport,
  ListingImportReport,
  summarize,
  summarizeDraftPhotos,
} from './import-report';
import {
  importRowKey,
  ImportRowError,
  ImportRowInput,
  validateImportRow,
} from './import-row.validator';
import { ListingImportLock } from './listing-import.lock';

/** Строка, прошедшая классификацию и ожидающая записи. */
type PendingRow =
  | { kind: 'CREATE'; report: ImportRowReport; input: ImportRowInput; data: ListingCreateData }
  // «Уже существует» с пустой галереей: пишется своей транзакцией с фото (спека 2026-10-03 §2).
  | { kind: 'ATTACH'; report: ImportRowReport; input: ImportRowInput; listingId: string };

/** Итог записи строки; `persisted` — строка отчёта уже записана внутри транзакции. */
interface RowResult {
  report: Partial<ImportRowReport>;
  persisted: boolean;
}

interface Classified {
  reports: ImportRowReport[];
  pending: PendingRow[];
  rawByRow: Map<number, RawImportRow['values']>;
  unknownColumns: string[];
}

const INTERNAL: ImportRowError = {
  column: null,
  code: 'INTERNAL',
  message: 'Unexpected error while creating the listing',
};

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * Массовый импорт объявлений (спека 2026-10-02). Классификация строк —
 * {@link classify} — одна для предпросмотра и запуска; `dry_run` отличается
 * только тем, что ничего не пишет.
 */
@Injectable()
export class ListingImportService {
  private readonly logger = new Logger(ListingImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: ListingsService,
    private readonly lock: ListingImportLock,
    private readonly photoQueue: ListingImportPhotoQueue,
  ) {}

  async run(
    file: ImportUploadedFile | undefined,
    actorId: string,
    dryRun: boolean,
  ): Promise<ListingImportReport> {
    const parsed = await parseImportFile(file);
    const fileName = decodeUploadedFileName((file as ImportUploadedFile).originalname).slice(0, 255);

    if (dryRun) {
      const { reports, unknownColumns } = await this.classify(parsed.rows, parsed.unknownColumns);
      return this.toReport(null, true, fileName, unknownColumns, reports, false, summarizeDraftPhotos(reports));
    }

    const token = await this.lock.acquire();
    if (!token) {
      throw new HttpException(
        { code: ApiErrorCode.IMPORT_IN_PROGRESS, message: 'Another import is running' },
        HttpStatus.CONFLICT,
      );
    }
    try {
      // Классификация — под блокировкой: иначе параллельный импорт успел бы
      // создать те же объявления между проверкой и записью.
      const classified = await this.classify(parsed.rows, parsed.unknownColumns);
      return await this.execute(classified, actorId, fileName);
    } finally {
      // Сбой Redis не должен превращать записанный импорт в 500 или маскировать исходную ошибку.
      try {
        await this.lock.release(token);
      } catch (error) {
        this.logger.warn(`Не удалось снять блокировку импорта: ${(error as Error).message}`);
      }
    }
  }

  async getReport(id: string): Promise<ListingImportReport> {
    const saved = await this.prisma.listingImport.findUnique({
      where: { id },
      include: { rows: { orderBy: { rowNumber: 'asc' } } },
    });
    if (!saved) {
      throw new NotFoundException({ code: ApiErrorCode.NOT_FOUND, message: 'Import not found' });
    }
    const listingIds = saved.rows.flatMap((row) => (row.listingId ? [row.listingId] : []));
    const references = new Map(
      (
        await this.prisma.listing.findMany({
          where: { id: { in: listingIds } },
          select: { id: true, reference: true },
        })
      ).map((listing) => [listing.id, listing.reference]),
    );
    const records = await this.prisma.listingImportPhoto.findMany({
      where: { importId: id },
      orderBy: [{ rowNumber: 'asc' }, { position: 'asc' }],
    });
    const photosByRow = new Map<number, ImportPhotoReport[]>();
    for (const record of records) {
      const list = photosByRow.get(record.rowNumber) ?? [];
      list.push(toPhotoReport(record));
      photosByRow.set(record.rowNumber, list);
    }
    const rows = saved.rows.map((row): ImportRowReport => {
      const raw = row.raw as { phone?: string; title?: string; normalized_phone?: string; photos?: string };
      const base: ImportRowReport = {
        row: row.rowNumber,
        outcome: row.outcome,
        phone: raw.normalized_phone ?? raw.phone ?? null,
        title: raw.title ?? null,
      };
      if (row.outcome === ListingImportOutcome.ERROR) {
        return { ...base, errors: row.errors as unknown as ImportRowError[] };
      }
      if (row.outcome === ListingImportOutcome.SKIPPED_DUPLICATE_IN_FILE) {
        return { ...base, duplicate_of_row: row.duplicateOfRow as number };
      }
      // Непрекреплённые фото в БД не пишутся — показываем их из исходной ячейки.
      const parsedCell = parsePhotoCell(raw.photos);
      const photos = row.photosAttached
        ? photosByRow.get(row.rowNumber) ?? []
        : draftPhotoReports(parsedCell.ok ? parsedCell.photos : []);
      return {
        ...base,
        ...(row.outcome === ListingImportOutcome.CREATED ? { owner_is_new: row.ownerIsNew } : {}),
        listing_id: row.listingId as string,
        listing_reference: references.get(row.listingId as string) ?? null,
        photos_attached: row.photosAttached,
        photos,
      };
    });
    const photosSummary = (await photoSummaries(this.prisma, [saved.id])).get(saved.id) ?? EMPTY_PHOTO_SUMMARY;
    return this.toReport(
      saved.id,
      false,
      saved.fileName,
      saved.unknownColumns,
      rows,
      saved.rows.length !== saved.totalRows,
      photosSummary,
    );
  }

  /** Только чтение: итог каждой строки, как если бы импорт был запущен сейчас. */
  private async classify(rows: RawImportRow[], unknownColumns: string[]): Promise<Classified> {
    const reports: ImportRowReport[] = [];
    const rawByRow = new Map(rows.map((row) => [row.rowNumber, row.values]));
    const valid: { rowNumber: number; key: string; input: ImportRowInput }[] = [];

    for (const row of rows) {
      const result = validateImportRow(row.values);
      if (result.ok) {
        valid.push({ rowNumber: row.rowNumber, key: importRowKey(result.input), input: result.input });
      } else {
        reports.push({
          row: row.rowNumber,
          outcome: 'ERROR',
          phone: row.values.phone ?? null,
          title: row.values.title ?? null,
          errors: result.errors,
        });
      }
    }

    // Якорь повтора — первая строка ключа, не закончившаяся ERROR; строки идут в порядке файла.
    const anchorByKey = new Map<string, number>();
    const pending: PendingRow[] = [];
    for (const { rowNumber, key, input } of valid) {
      const base = { row: rowNumber, phone: input.phone, title: input.dto.translation.title };
      const duplicateOf = anchorByKey.get(key);
      if (duplicateOf !== undefined) {
        reports.push({ ...base, outcome: 'SKIPPED_DUPLICATE_IN_FILE', duplicate_of_row: duplicateOf });
        continue;
      }
      const lookup = await lookupOwner(this.prisma, input.phone);
      const problem = ownerError(lookup, input);
      if (problem) {
        reports.push({ ...base, outcome: 'ERROR', errors: [problem] });
        continue;
      }
      let data: ListingCreateData;
      try {
        data = await this.listings.buildCreateData(input.dto, { geocode: false });
      } catch (error) {
        // Без геокодинга buildCreateData бросает HttpException только на неизвестных
        // удобствах; всё остальное (например, сбой БД) — не ошибка строки.
        if (!(error instanceof HttpException)) throw error;
        const message = error.message;
        reports.push({
          ...base,
          outcome: 'ERROR',
          errors: [{ column: 'amenities', code: 'UNKNOWN_AMENITY', message }],
        });
        continue;
      }
      if (lookup.kind === 'EXISTING') {
        const existing = await findOwnerDuplicate(this.prisma, lookup.userId, input.dto);
        if (existing) {
          anchorByKey.set(key, rowNumber);
          const attach = input.photos.length > 0 && (await canAttachPhotos(this.prisma, existing.id));
          const report: ImportRowReport = {
            ...base,
            outcome: 'SKIPPED_EXISTS',
            listing_id: existing.id,
            listing_reference: existing.reference,
            photos_attached: attach,
            photos: draftPhotoReports(input.photos),
          };
          reports.push(report);
          if (attach) pending.push({ kind: 'ATTACH', report, input, listingId: existing.id });
          continue;
        }
      }
      const report: ImportRowReport = {
        ...base,
        outcome: 'TO_CREATE',
        owner_is_new: lookup.kind === 'NEW',
        photos_attached: input.photos.length > 0,
        photos: draftPhotoReports(input.photos),
      };
      anchorByKey.set(key, rowNumber);
      reports.push(report);
      pending.push({ kind: 'CREATE', report, input, data });
    }

    reports.sort((a, b) => a.row - b.row);
    return { reports, pending, rawByRow, unknownColumns };
  }

  /** Запись: транзакция на строку, сохранение отчёта, аудит. */
  private async execute(
    classified: Classified,
    actorId: string,
    fileName: string,
  ): Promise<ListingImportReport> {
    const { reports, pending, rawByRow, unknownColumns } = classified;
    // Заголовок и аудит — одной транзакцией до записи строк: если процесс упадёт
    // посреди импорта, созданные объявления не останутся без записи в аудите.
    const importId = randomUUID();
    await this.prisma.$transaction([
      this.prisma.listingImport.create({
        data: { id: importId, createdById: actorId, fileName, totalRows: reports.length, unknownColumns },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'LISTING_IMPORT',
          entityType: 'listing_import',
          entityId: importId,
          metadata: { file_name: fileName, total_rows: reports.length },
        },
      }),
    ]);
    const rawOf = (report: ImportRowReport): Prisma.InputJsonValue => ({
      ...rawByRow.get(report.row),
      ...(report.phone ? { normalized_phone: report.phone } : {}),
    });

    // Строки, записанные внутри своих транзакций, — общий createMany их пропускает.
    const persisted = new Set<number>();
    for (const row of pending) {
      const { report } = row;
      try {
        const result =
          row.kind === 'CREATE'
            ? await this.createRowWithRetry(importId, row, rawOf(report))
            : await this.attachRow(importId, row, rawOf(report));
        if (result.persisted) persisted.add(report.row);
        Object.assign(report, result.report);
      } catch (error) {
        for (const field of ['owner_is_new', 'listing_id', 'listing_reference', 'photos_attached', 'photos'] as const) {
          delete report[field];
        }
        report.outcome = 'ERROR';
        if (error instanceof OwnerUnavailableError) {
          report.errors = [error.rowError];
        } else {
          this.logger.error(`Import ${importId} row ${report.row} failed`, error as Error);
          report.errors = [INTERNAL];
        }
      }
    }

    const rest = reports.filter((report) => !persisted.has(report.row));
    if (rest.length > 0) {
      await this.prisma.listingImportRow.createMany({
        data: rest.map((report) => ({
          importId,
          rowNumber: report.row,
          outcome: report.outcome as ListingImportOutcome,
          listingId: report.listing_id ?? null,
          duplicateOfRow: report.duplicate_of_row ?? null,
          errors: (report.errors as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          raw: rawOf(report),
        })),
      });
    }

    // Ставим ссылки после записи всех строк. Сбой Redis не валит импорт: фото
    // остаются PENDING и подхватываются «Повторить ссылки».
    const pendingPhotos = await this.prisma.listingImportPhoto.findMany({
      where: { importId, status: ListingImportPhotoStatus.PENDING },
      select: { id: true },
    });
    try {
      await this.photoQueue.enqueue(pendingPhotos.map((photo) => photo.id));
    } catch (error) {
      this.logger.error(`Import ${importId}: failed to enqueue photos`, error as Error);
    }

    const summary = summarize(reports);
    await this.prisma.listingImport.update({
      where: { id: importId },
      data: {
        createdCount: summary.created,
        skippedExistsCount: summary.skipped_exists,
        skippedInFileCount: summary.skipped_duplicate_in_file,
        errorCount: summary.errors,
      },
    });
    // Ответ строится так же, как сохранённый отчёт: id фото есть только в БД.
    return this.getReport(importId);
  }

  /**
   * Нарушение уникальности телефона (гонка с регистрацией) обрывает транзакцию
   * Postgres — перечитать пользователя внутри неё нельзя. Откатываем строку
   * целиком и повторяем один раз: на повторе владелец уже находится.
   */
  private async createRowWithRetry(
    importId: string,
    row: Extract<PendingRow, { kind: 'CREATE' }>,
    raw: Prisma.InputJsonValue,
  ): Promise<RowResult> {
    try {
      return await this.createRow(importId, row, raw);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return this.createRow(importId, row, raw);
    }
  }

  private createRow(
    importId: string,
    row: Extract<PendingRow, { kind: 'CREATE' }>,
    raw: Prisma.InputJsonValue,
  ): Promise<RowResult> {
    const { input, data, report } = row;
    return this.prisma.$transaction(async (tx): Promise<RowResult> => {
      const owner = await ensureOwner(tx, input);
      // Перепроверка под транзакцией: строка выше по файлу могла создать и
      // владельца, и такое же объявление.
      const existing = owner.isNew ? null : await findOwnerDuplicate(tx, owner.userId, input.dto);
      if (existing) {
        const skipped = {
          outcome: 'SKIPPED_EXISTS' as const,
          owner_is_new: undefined,
          listing_id: existing.id,
          listing_reference: existing.reference,
        };
        // Дубль появился выше по файлу. Прикрепляем фото по тому же правилу, что ATTACH.
        if (input.photos.length === 0 || !(await canAttachPhotos(tx, existing.id))) {
          return { report: { ...skipped, photos_attached: false }, persisted: false };
        }
        await tx.listingImportRow.create({
          data: {
            importId,
            rowNumber: report.row,
            outcome: ListingImportOutcome.SKIPPED_EXISTS,
            listingId: existing.id,
            photosAttached: true,
            raw,
          },
        });
        await createPhotoRecords(tx, importId, report.row, existing.id, input.photos);
        return { report: { ...skipped, photos_attached: true }, persisted: true };
      }
      const created = await this.listings.createInTransaction(tx, owner.userId, data, input.dto);
      const { reference } = await tx.listing.findUniqueOrThrow({
        where: { id: created.id },
        select: { reference: true },
      });
      await tx.listingImportRow.create({
        data: {
          importId,
          rowNumber: report.row,
          outcome: ListingImportOutcome.CREATED,
          listingId: created.id,
          ownerIsNew: owner.isNew,
          photosAttached: input.photos.length > 0,
          raw,
        },
      });
      await createPhotoRecords(tx, importId, report.row, created.id, input.photos);
      return {
        report: {
          outcome: 'CREATED',
          owner_is_new: owner.isNew,
          listing_id: created.id,
          listing_reference: reference,
        },
        persisted: true,
      };
    });
  }

  /**
   * «Уже существует» с прикреплением фото: перепроверка под транзакцией → строка
   * отчёта → записи фото. Если галерея за это время перестала быть пустой —
   * строка пишется без фото.
   */
  private attachRow(
    importId: string,
    row: Extract<PendingRow, { kind: 'ATTACH' }>,
    raw: Prisma.InputJsonValue,
  ): Promise<RowResult> {
    const { report, input, listingId } = row;
    return this.prisma.$transaction(async (tx): Promise<RowResult> => {
      const attach = await canAttachPhotos(tx, listingId);
      await tx.listingImportRow.create({
        data: {
          importId,
          rowNumber: report.row,
          outcome: ListingImportOutcome.SKIPPED_EXISTS,
          listingId,
          photosAttached: attach,
          raw,
        },
      });
      if (attach) await createPhotoRecords(tx, importId, report.row, listingId, input.photos);
      return { report: { photos_attached: attach }, persisted: true };
    });
  }

  private toReport(
    id: string | null,
    dryRun: boolean,
    fileName: string,
    unknownColumns: string[],
    rows: ImportRowReport[],
    incomplete: boolean,
    photosSummary: ImportPhotosSummary,
  ): ListingImportReport {
    return {
      id,
      dry_run: dryRun,
      incomplete,
      file_name: fileName,
      summary: summarize(rows),
      unknown_columns: unknownColumns,
      rows: rows.map((row) => JSON.parse(JSON.stringify(row)) as ImportRowReport),
      photos_summary: photosSummary,
    };
  }
}
