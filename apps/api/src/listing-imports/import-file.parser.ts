import { HttpException, HttpStatus } from '@nestjs/common';
import { CellValue, Workbook, Worksheet } from 'exceljs';
import { Readable } from 'stream';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  ImportColumnKey,
  ImportRowValues,
  REQUIRED_HEADER_KEYS,
  resolveColumnKey,
} from './import-columns';

/** Файл из `FileInterceptor` (memory storage), как в listing-media. */
export interface ImportUploadedFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

export interface RawImportRow {
  rowNumber: number;
  values: ImportRowValues;
}

export interface ParsedImportFile {
  rows: RawImportRow[];
  unknownColumns: string[];
}

function fileError(
  status: HttpStatus,
  code: ApiErrorCode,
  message: string,
  details?: { field: string; issue: string }[],
): HttpException {
  return new HttpException({ code, message, ...(details ? { details } : {}) }, status);
}

/** Значение ячейки → обрезанная строка. Числа — без экспоненты и float-хвостов. */
function cellToString(value: CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') {
    // Целые (телефон числом) — как есть: умножение вывело бы 12 цифр за MAX_SAFE_INTEGER.
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 10000) / 10000);
  }
  if (typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('').trim();
    if ('result' in value) return cellToString(value.result as CellValue);
    if ('text' in value) return String(value.text).trim();
  }
  return '';
}

async function loadWorksheet(file: ImportUploadedFile): Promise<Worksheet> {
  const name = file.originalname.toLowerCase();
  const workbook = new Workbook();
  try {
    if (name.endsWith('.xlsx')) {
      // Типы exceljs ждут старый `Buffer` (без generic ArrayBufferLike) — приводим.
      await workbook.xlsx.load(file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    } else if (name.endsWith('.csv')) {
      // exceljs не определяет разделитель и не срезает BOM — делаем это сами.
      const text = file.buffer.toString('utf8').replace(/^\uFEFF/, '');
      // Excel на Windows сохраняет «CSV» в cp1251: кириллица декодируется в U+FFFD.
      if (text.includes('\uFFFD')) throw new Error('csv is not utf-8');
      const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
      const delimiter =
        (firstLine.match(/;/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? ';' : ',';
      await workbook.csv.read(Readable.from([text]), {
        parserOptions: { delimiter },
        // Значения оставляем строками: авто-приведение exceljs портит телефоны и даты.
        map: (value: unknown) => value,
      });
    } else {
      throw new Error('unsupported extension');
    }
  } catch (error) {
    throw fileError(
      HttpStatus.BAD_REQUEST,
      ApiErrorCode.IMPORT_FILE_UNSUPPORTED,
      (error as Error).message === 'csv is not utf-8'
        ? 'CSV must be UTF-8 encoded'
        : 'File must be a readable .xlsx or .csv',
    );
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw fileError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ApiErrorCode.IMPORT_FILE_EMPTY,
      'File has no data rows',
    );
  }
  return sheet;
}

/**
 * Разбор файла импорта (спека 2026-10-02 §1): первый лист, первая строка —
 * заголовки. Знает только про формат файла — ни правил полей, ни БД.
 */
export async function parseImportFile(
  file: ImportUploadedFile | undefined,
): Promise<ParsedImportFile> {
  if (!file) {
    throw fileError(HttpStatus.BAD_REQUEST, ApiErrorCode.IMPORT_FILE_REQUIRED, 'File is required');
  }
  if (file.size > IMPORT_MAX_BYTES) {
    throw fileError(
      HttpStatus.PAYLOAD_TOO_LARGE,
      ApiErrorCode.IMPORT_FILE_TOO_LARGE,
      `File is larger than ${IMPORT_MAX_BYTES} bytes`,
    );
  }
  const sheet = await loadWorksheet(file);

  const columnByIndex = new Map<number, ImportColumnKey>();
  const unknownColumns: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, index) => {
    const header = cellToString(cell.value);
    if (!header) return;
    const key = resolveColumnKey(header);
    // Повторный ключ («Телефон» и `phone`): остаётся первая колонка, остальные — в unknown.
    if (key && ![...columnByIndex.values()].includes(key)) columnByIndex.set(index, key);
    else unknownColumns.push(header);
  });

  const present = new Set(columnByIndex.values());
  const missing = REQUIRED_HEADER_KEYS.filter((key) => !present.has(key));
  if (missing.length > 0) {
    throw fileError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ApiErrorCode.IMPORT_MISSING_COLUMNS,
      `Missing required columns: ${missing.join(', ')}`,
      missing.map((field) => ({ field, issue: 'column is missing' })),
    );
  }

  const rows: RawImportRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values: ImportRowValues = {};
    for (const [index, key] of columnByIndex) {
      const value = cellToString(row.getCell(index).value);
      if (value) values[key] = value;
    }
    if (Object.keys(values).length > 0) rows.push({ rowNumber, values });
  }

  if (rows.length === 0) {
    throw fileError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ApiErrorCode.IMPORT_FILE_EMPTY,
      'File has no data rows',
    );
  }
  if (rows.length > IMPORT_MAX_ROWS) {
    throw fileError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ApiErrorCode.IMPORT_TOO_MANY_ROWS,
      `File has more than ${IMPORT_MAX_ROWS} rows`,
    );
  }
  return { rows, unknownColumns };
}
