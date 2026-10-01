import { findInFileDuplicates, ImportRowReport, summarize } from './import-report';

describe('findInFileDuplicates', () => {
  it('первая строка ключа — оригинал, остальные ссылаются на неё', () => {
    const result = findInFileDuplicates([
      { rowNumber: 2, key: 'a' },
      { rowNumber: 3, key: 'b' },
      { rowNumber: 4, key: 'a' },
      { rowNumber: 7, key: 'a' },
    ]);
    expect([...result]).toEqual([
      [4, 2],
      [7, 2],
    ]);
  });
});

describe('summarize', () => {
  it('считает итоги по типам', () => {
    const row = (outcome: ImportRowReport['outcome']): ImportRowReport => ({
      row: 1,
      outcome,
      phone: null,
      title: null,
    });
    expect(
      summarize([
        row('CREATED'),
        row('TO_CREATE'),
        row('TO_CREATE'),
        row('SKIPPED_EXISTS'),
        row('SKIPPED_DUPLICATE_IN_FILE'),
        row('ERROR'),
      ]),
    ).toEqual({
      total: 6,
      created: 1,
      to_create: 2,
      skipped_exists: 1,
      skipped_duplicate_in_file: 1,
      errors: 1,
    });
  });
});
