import { describe, expect, it } from 'vitest';
import {
  importButtonLabel,
  importFileErrorText,
  importRowToView,
  isImportFileErrorCode,
} from './listingImports';
import type { ListingImportRow } from '@/store/api/adminTypes';

const row = (patch: Partial<ListingImportRow>): ListingImportRow => ({
  row: 2,
  outcome: 'TO_CREATE',
  phone: '+998901234567',
  title: 'Квартира',
  ...patch,
});

describe('importRowToView', () => {
  it('будет создано — с пометкой нового владельца', () => {
    expect(importRowToView(row({ owner_is_new: true }))).toMatchObject({
      label: 'Будет создано',
      tone: 'ok',
      reason: 'Новый пользователь',
    });
    expect(importRowToView(row({ owner_is_new: false })).reason).toBe('');
  });

  it('создано — со ссылкой на объявление', () => {
    expect(
      importRowToView(row({ outcome: 'CREATED', listing_id: 'L1', listing_reference: 10432 })),
    ).toMatchObject({ label: 'Создано', tone: 'ok', listingId: 'L1', reference: 10432 });
  });

  it('уже существует и повтор в файле', () => {
    expect(
      importRowToView(row({ outcome: 'SKIPPED_EXISTS', listing_id: 'L1', listing_reference: 7 })),
    ).toMatchObject({ label: 'Уже существует', tone: 'skip', reason: 'Объявление № 7', listingId: 'L1' });
    expect(
      importRowToView(row({ outcome: 'SKIPPED_DUPLICATE_IN_FILE', duplicate_of_row: 5 })),
    ).toMatchObject({ label: 'Повтор в файле', tone: 'skip', reason: 'Совпадает со строкой 5' });
  });

  it('ошибки — подпись колонки и русский текст по коду', () => {
    const view = importRowToView(
      row({
        outcome: 'ERROR',
        phone: null,
        title: null,
        errors: [
          { column: 'price', code: 'INVALID_VALUE', message: 'x' },
          { column: 'phone', code: 'OWNER_BLOCKED', message: 'x' },
          { column: null, code: 'INTERNAL', message: 'x' },
          { column: 'area', code: 'SOMETHING_NEW', message: 'raw message' },
        ],
      }),
    );
    expect(view).toMatchObject({ label: 'Ошибка', tone: 'error', phone: '—', title: '—' });
    expect(view.reason).toBe(
      'Цена: недопустимое значение; Телефон: владелец заблокирован; Внутренняя ошибка, строка не создана; Площадь: raw message',
    );
  });
});

describe('importFileErrorText', () => {
  it('знает коды файла и даёт запасной текст', () => {
    expect(importFileErrorText('IMPORT_TOO_MANY_ROWS')).toBe(
      'В файле больше 500 строк. Разбейте его на части.',
    );
    expect(importFileErrorText('IMPORT_IN_PROGRESS')).toBe(
      'Сейчас выполняется другой импорт. Повторите через минуту.',
    );
    expect(importFileErrorText(null)).toBe('Не удалось обработать файл. Попробуйте ещё раз.');
  });
});

describe('фолбэки строк без деталей', () => {
  it('повтор без номера строки', () => {
    expect(importRowToView(row({ outcome: 'SKIPPED_DUPLICATE_IN_FILE' })).reason).toBe('Повтор строки из файла');
  });
  it('ошибка без errors', () => {
    expect(importRowToView(row({ outcome: 'ERROR' })).reason).toBe('Причина не указана');
    expect(importRowToView(row({ outcome: 'ERROR', errors: [] })).reason).toBe('Причина не указана');
  });
});

describe('isImportFileErrorCode', () => {
  it('известный код файла — true, прочее — false', () => {
    expect(isImportFileErrorCode('IMPORT_IN_PROGRESS')).toBe(true);
    expect(isImportFileErrorCode('IMPORT_FILE_EMPTY')).toBe(true);
    expect(isImportFileErrorCode(null)).toBe(false);
    expect(isImportFileErrorCode('VALIDATION_ERROR')).toBe(false);
  });
});

describe('importButtonLabel', () => {
  it.each([
    [null, 'Импортировать'],
    [0, 'Импортировать 0 объявлений'],
    [1, 'Импортировать 1 объявление'],
    [2, 'Импортировать 2 объявления'],
    [5, 'Импортировать 5 объявлений'],
    [11, 'Импортировать 11 объявлений'],
    [14, 'Импортировать 14 объявлений'],
    [21, 'Импортировать 21 объявление'],
    [22, 'Импортировать 22 объявления'],
    [25, 'Импортировать 25 объявлений'],
    [101, 'Импортировать 101 объявление'],
    [111, 'Импортировать 111 объявлений'],
  ])('%s', (n, text) => {
    expect(importButtonLabel(n)).toBe(text);
  });
});
