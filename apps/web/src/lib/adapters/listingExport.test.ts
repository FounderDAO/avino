import { describe, expect, it } from 'vitest';
import { EXPORT_MAX_ROWS, listingExportFileName, listingExportToast } from './listingExport';

describe('listingExportFileName', () => {
  it('подставляет локальную дату с ведущими нулями', () => {
    expect(listingExportFileName(new Date(2026, 9, 3, 12, 0))).toBe('avino-listings-2026-10-03.xlsx');
  });
});

describe('listingExportToast', () => {
  it('в пределах лимита — число выгруженных объявлений', () => {
    expect(listingExportToast(42)).toBe('Экспорт готов: 42');
    expect(listingExportToast(EXPORT_MAX_ROWS)).toBe(`Экспорт готов: ${EXPORT_MAX_ROWS}`);
  });

  it('сверх лимита — предупреждает, что файл неполный', () => {
    expect(listingExportToast(EXPORT_MAX_ROWS + 1)).toContain(`${EXPORT_MAX_ROWS} из ${EXPORT_MAX_ROWS + 1}`);
  });
});
