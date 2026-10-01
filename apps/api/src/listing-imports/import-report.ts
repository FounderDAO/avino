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
  file_name: string;
  summary: ImportSummary;
  unknown_columns: string[];
  rows: ImportRowReport[];
}

/** Повторы внутри файла: номер строки-повтора → номер первой строки с тем же ключом. */
export function findInFileDuplicates(
  rows: { rowNumber: number; key: string }[],
): Map<number, number> {
  const firstByKey = new Map<string, number>();
  const duplicates = new Map<number, number>();
  for (const { rowNumber, key } of rows) {
    const first = firstByKey.get(key);
    if (first === undefined) firstByKey.set(key, rowNumber);
    else duplicates.set(rowNumber, first);
  }
  return duplicates;
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
