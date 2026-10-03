import { describe, expect, it } from 'vitest';
import {
  importButtonLabel,
  importFileErrorText,
  importPhotoUploadErrorText,
  importRowToView,
  isImportFileErrorCode,
  matchLocalPhotos,
  photoNameKey,
  photoStatusText,
  photoUploadQueue,
  rowPhotoText,
} from './listingImports';
import type { ListingImportPhoto, ListingImportReport, ListingImportRow } from '@/store/api/adminTypes';

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

// По умолчанию — фото предпросмотра (id: null); сохранённые фото задают id явно.
const photo = (over: Partial<ListingImportPhoto>): ListingImportPhoto => ({
  id: null, position: 0, source: 'FILE', ref: '1.jpg', status: null, error_code: null, http_status: null, ...over,
});

describe('matchLocalPhotos', () => {
  const files = [
    { name: '1.JPG', size: 10 },
    { name: 'dup.jpg', size: 10 },
    { name: 'DUP.jpg', size: 10 },
    { name: 'big.jpg', size: 11 * 1024 * 1024 },
  ];

  it('совпадение без учёта регистра; двойное имя — неоднозначно; > 10 МБ — слишком большой; нет — не найден', () => {
    const map = matchLocalPhotos(['1.jpg', 'dup.jpg', 'big.jpg', 'none.jpg'], files);
    expect(map.get('1.jpg')).toEqual({ kind: 'FOUND', file: files[0] });
    expect(map.get('dup.jpg')).toEqual({ kind: 'AMBIGUOUS' });
    expect(map.get('big.jpg')).toEqual({ kind: 'TOO_LARGE' });
    expect(map.get('none.jpg')).toEqual({ kind: 'NOT_FOUND' });
  });

  it('имя файла в NFD (macOS) совпадает со ссылкой в NFC', () => {
    const nfc = 'Йёлка 1.jpg'.normalize('NFC');
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc);
    const file = { name: nfd, size: 10 };
    const map = matchLocalPhotos([nfc], [file]);
    expect(map.get(photoNameKey(nfc))).toEqual({ kind: 'FOUND', file });
    expect(photoNameKey(nfd)).toBe(photoNameKey(nfc));
  });
});

describe('rowPhotoText', () => {
  const photoRow = (photos: ListingImportPhoto[], photos_attached = true): ListingImportRow => ({
    row: 2, outcome: 'TO_CREATE', phone: null, title: null, photos, photos_attached,
  });

  it('счётчики ссылок, файлов и ненайденных', () => {
    const r = photoRow([photo({ source: 'URL', ref: 'https://a/1' }), photo({ ref: '1.jpg' }), photo({ ref: 'x.jpg' })]);
    const matches = matchLocalPhotos(['1.jpg', 'x.jpg'], [{ name: '1.jpg', size: 1 }]);
    expect(rowPhotoText(r, matches)).toBe('3 (ссылок 1, файлов 2, не найдено 1)');
  });

  it('файлы без выбранной папки', () => {
    expect(rowPhotoText(photoRow([photo({})]), null)).toBe('1 (файлов 1, папка не выбрана)');
  });

  it('проигнорированные у «уже существует»', () => {
    expect(rowPhotoText({ ...photoRow([photo({})], false), outcome: 'SKIPPED_EXISTS' }, null)).toBe(
      'проигнорированы: у объявления уже есть фото или незавершённая загрузка — дозагрузите из истории импортов',
    );
  });

  it('«уже существует» с photos_attached в предпросмотре — «будут добавлены: …»', () => {
    const r = { ...photoRow([photo({ source: 'URL', ref: 'https://a/1' }), photo({ ref: '1.jpg' })]), outcome: 'SKIPPED_EXISTS' as const };
    expect(rowPhotoText(r, null)).toBe('будут добавлены: 2 (ссылок 1, файлов 1, папка не выбрана)');
  });

  it('файл в NFD считается найденным для ссылки в NFC', () => {
    const nfc = 'Йёлка 1.jpg'.normalize('NFC');
    const r = photoRow([photo({ ref: nfc })]);
    const matches = matchLocalPhotos([nfc], [{ name: nfc.normalize('NFD'), size: 1 }]);
    expect(rowPhotoText(r, matches)).toBe('1 (файлов 1)');
  });

  it('без фото — пусто', () => {
    expect(rowPhotoText(photoRow([], false), null)).toBe('');
  });

  it('сохранённый отчёт (у фото есть id) — «загружено / всего»', () => {
    expect(rowPhotoText(photoRow([photo({ id: 'a', status: 'DONE' }), photo({ id: 'b', status: 'AWAITING_UPLOAD' })]), null)).toBe('1 / 2');
  });
});

describe('photoStatusText', () => {
  it('статусы и ошибки', () => {
    expect(photoStatusText(photo({ id: 'a', status: 'DONE' }))).toBe('загружено');
    expect(photoStatusText(photo({ id: 'a', status: 'AWAITING_UPLOAD' }))).toBe('ожидает загрузки из папки');
    expect(photoStatusText(photo({ id: 'a', status: 'PENDING', source: 'URL' }))).toBe('скачивается');
    expect(photoStatusText(photo({ id: 'a', status: 'FAILED', error_code: 'NOT_AN_IMAGE' }))).toBe('ссылка ведёт на страницу, а не на файл изображения');
    expect(photoStatusText(photo({ id: 'a', status: 'FAILED', error_code: 'HTTP_ERROR', http_status: 404 }))).toBe('сайт ответил ошибкой 404');
  });
});

describe('photoUploadQueue', () => {
  it('только записанные FILE в AWAITING_UPLOAD / FAILED', () => {
    const report = {
      rows: [
        { row: 2, outcome: 'CREATED', phone: null, title: null, photos: [
          photo({ id: 'a', status: 'AWAITING_UPLOAD' }),
          photo({ id: 'b', status: 'FAILED', error_code: 'MEDIA_LIMIT' }),
          photo({ id: 'c', status: 'DONE' }),
          photo({ id: 'd', source: 'URL', status: 'FAILED' }),
        ] },
        { row: 3, outcome: 'SKIPPED_EXISTS', phone: null, title: null, photos: [photo({ id: null, status: null })] },
      ],
    } as unknown as ListingImportReport;
    expect(photoUploadQueue(report).map((p) => p.id)).toEqual(['a', 'b']);
  });
});

it('ошибка фото в строке — с проблемным значением', () => {
  const view = importRowToView({
    row: 2, outcome: 'ERROR', phone: null, title: null,
    errors: [{ column: 'photos', code: 'PHOTO_UNSUPPORTED_FORMAT', message: '', value: 'a.heic' }],
  });
  expect(view.reason).toBe('Фото: формат не поддерживается, конвертируйте в JPG/PNG/WebP (a.heic)');
});

it('importPhotoUploadErrorText', () => {
  expect(importPhotoUploadErrorText('IMPORT_PHOTO_NAME_MISMATCH')).toContain('имя');
  expect(importPhotoUploadErrorText(null)).toBe('не удалось загрузить');
});
