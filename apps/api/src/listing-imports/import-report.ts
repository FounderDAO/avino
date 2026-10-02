import { ImportRowError } from './import-row.validator';

export type ImportOutcome =
  | 'TO_CREATE'
  | 'CREATED'
  | 'SKIPPED_EXISTS'
  | 'SKIPPED_DUPLICATE_IN_FILE'
  | 'ERROR';

/** Строка отчёта импорта в snake_case-контракте (спека 2026-10-02 §4–§5). */
export interface ImportRowReport {
  row: number;
  outcome: ImportOutcome;
  phone: string | null;
  title: string | null;
  owner_is_new?: boolean;
  listing_id?: string;
  listing_reference?: number | null;
  duplicate_of_row?: number;
  errors?: ImportRowError[];
}

export interface ImportSummary {
  total: number;
  created: number;
  to_create: number;
  skipped_exists: number;
  skipped_duplicate_in_file: number;
  errors: number;
}

export interface ListingImportReport {
  id: string | null;
  dry_run: boolean;
  /** Сохранённый отчёт неполон: прогон прервался, часть строк не записана. */
  incomplete: boolean;
  file_name: string;
  summary: ImportSummary;
  unknown_columns: string[];
  rows: ImportRowReport[];
}

export function summarize(rows: ImportRowReport[]): ImportSummary {
  const count = (outcome: ImportOutcome): number =>
    rows.filter((row) => row.outcome === outcome).length;
  return {
    total: rows.length,
    created: count('CREATED'),
    to_create: count('TO_CREATE'),
    skipped_exists: count('SKIPPED_EXISTS'),
    skipped_duplicate_in_file: count('SKIPPED_DUPLICATE_IN_FILE'),
    errors: count('ERROR'),
  };
}

/**
 * multer отдаёт имя файла в latin1 — кириллица иначе сохранилась бы мусором.
 * Декодируем только если результат — валидный UTF-8; уже корректное имя
 * (например, из `filename*=UTF-8''…`) и настоящее latin1-имя не трогаем.
 */
export function decodeUploadedFileName(name: string): string {
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) > 0xff) return name;
  }
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}
