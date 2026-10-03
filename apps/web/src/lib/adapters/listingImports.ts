import type {
  ListingImportPhoto,
  ListingImportReport,
  ListingImportRow,
  ListingImportRowError,
} from '@/store/api/adminTypes';

/** Подписи колонок файла импорта — зеркало реестра API (`import-columns.ts`). */
const COLUMN_LABEL: Record<string, string> = {
  phone: 'Телефон',
  first_name: 'Имя',
  last_name: 'Фамилия',
  transaction_type: 'Тип сделки',
  property_type: 'Тип недвижимости',
  title: 'Заголовок',
  description: 'Описание',
  language: 'Язык',
  price: 'Цена',
  currency: 'Валюта',
  address: 'Адрес',
  area: 'Площадь',
  lot_area: 'Площадь участка',
  floor: 'Этаж',
  total_floors: 'Этажность',
  rooms: 'Комнат',
  bathrooms: 'Санузлы',
  year_built: 'Год постройки',
  parking_type: 'Парковка',
  latitude: 'Широта',
  longitude: 'Долгота',
  amenities: 'Удобства',
  photos: 'Фото',
};

const ERROR_TEXT: Record<string, string> = {
  REQUIRED: 'обязательное поле',
  INVALID_VALUE: 'недопустимое значение',
  TOO_LONG: 'слишком длинное значение',
  INVALID_PHONE: 'номер не распознан',
  OWNER_BLOCKED: 'владелец заблокирован',
  OWNER_NAME_REQUIRED: 'укажите имя и фамилию владельца',
  UNKNOWN_AMENITY: 'неизвестный код удобства',
  PHOTO_TOO_MANY: 'больше 20 фото',
  PHOTO_INVALID_URL: 'ссылка не распознана',
  PHOTO_UNSUPPORTED_FORMAT: 'формат не поддерживается, конвертируйте в JPG/PNG/WebP',
  PHOTO_INVALID_NAME: 'укажите только имя файла, без папки',
};

function errorText(error: ListingImportRowError): string {
  if (error.code === 'INTERNAL') return 'Внутренняя ошибка, строка не создана';
  const text = ERROR_TEXT[error.code] ?? error.message;
  const label = error.column ? COLUMN_LABEL[error.column] ?? error.column : null;
  const value = error.value ? ` (${error.value})` : '';
  return label ? `${label}: ${text}${value}` : `${text}${value}`;
}

export interface ImportRowView {
  row: number;
  phone: string;
  title: string;
  label: string;
  tone: 'ok' | 'skip' | 'error';
  reason: string;
  listingId: string | null;
  reference: number | null;
}

/** Строка отчёта импорта → строка таблицы модалки. */
export function importRowToView(row: ListingImportRow): ImportRowView {
  const base = {
    row: row.row,
    phone: row.phone ?? '—',
    title: row.title ?? '—',
    listingId: row.listing_id ?? null,
    reference: row.listing_reference ?? null,
  };
  switch (row.outcome) {
    case 'TO_CREATE':
      return { ...base, label: 'Будет создано', tone: 'ok', reason: row.owner_is_new ? 'Новый пользователь' : '' };
    case 'CREATED':
      return { ...base, label: 'Создано', tone: 'ok', reason: row.owner_is_new ? 'Новый пользователь' : '' };
    case 'SKIPPED_EXISTS':
      return {
        ...base,
        label: 'Уже существует',
        tone: 'skip',
        reason: base.reference ? `Объявление № ${base.reference}` : 'Объявление уже есть',
      };
    case 'SKIPPED_DUPLICATE_IN_FILE':
      return {
        ...base,
        label: 'Повтор в файле',
        tone: 'skip',
        reason: row.duplicate_of_row ? `Совпадает со строкой ${row.duplicate_of_row}` : 'Повтор строки из файла',
      };
    default:
      return { ...base, label: 'Ошибка', tone: 'error', reason: (row.errors ?? []).map(errorText).join('; ') || 'Причина не указана' };
  }
}

const FILE_ERROR_TEXT: Record<string, string> = {
  IMPORT_FILE_REQUIRED: 'Выберите файл.',
  IMPORT_FILE_UNSUPPORTED: 'Файл не читается. Нужен .xlsx или .csv по шаблону.',
  IMPORT_FILE_TOO_LARGE: 'Файл больше 2 МБ.',
  IMPORT_FILE_EMPTY: 'В файле нет строк с данными.',
  IMPORT_TOO_MANY_ROWS: 'В файле больше 500 строк. Разбейте его на части.',
  IMPORT_MISSING_COLUMNS: 'В файле не хватает обязательных колонок. Скачайте шаблон.',
  IMPORT_IN_PROGRESS: 'Сейчас выполняется другой импорт. Повторите через минуту.',
};

/** Текст ошибки файла по стабильному коду API. */
export function importFileErrorText(code: string | null): string {
  return (code && FILE_ERROR_TEXT[code]) || 'Не удалось обработать файл. Попробуйте ещё раз.';
}

/** Известный код ошибки файла/запуска импорта (`IMPORT_*`). */
export function isImportFileErrorCode(code: string | null): boolean {
  return code !== null && Object.prototype.hasOwnProperty.call(FILE_ERROR_TEXT, code);
}

/** Текст, когда ответ реального запуска не получен (сеть/таймаут/500). */
export const IMPORT_RUN_UNKNOWN_TEXT =
  'Не удалось получить ответ сервера. Импорт мог выполниться — файл проверен заново, сверьте результат ниже.';

/** Подпись кнопки запуска с русским склонением; `null` — предпросмотра ещё нет. */
export function importButtonLabel(count: number | null): string {
  if (count === null) return 'Импортировать';
  const mod100 = count % 100;
  const mod10 = count % 10;
  let word = 'объявлений';
  if (mod100 < 11 || mod100 > 14) {
    if (mod10 === 1) word = 'объявление';
    else if (mod10 >= 2 && mod10 <= 4) word = 'объявления';
  }
  return `Импортировать ${count} ${word}`;
}

/** Лимит размера фото — зеркало API. */
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export type LocalFile = { name: string; size: number };
export type LocalMatch<F extends LocalFile> =
  | { kind: 'FOUND'; file: F }
  | { kind: 'NOT_FOUND' }
  | { kind: 'AMBIGUOUS' }
  | { kind: 'TOO_LARGE' };

/**
 * Ключ сравнения имени фото: NFC + нижний регистр. macOS отдаёт имена файлов
 * в NFD («й», «ё» — буква + диакритика), а в таблице они обычно в NFC.
 */
export function photoNameKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

/**
 * Сопоставление имён из ячейки «Фото» с выбранными файлами: по `photoNameKey`
 * (путь внутри папки не важен). Одно имя в двух подпапках — неоднозначно.
 * Ключи результата — `photoNameKey(ref)`.
 */
export function matchLocalPhotos<F extends LocalFile>(refs: string[], files: F[]): Map<string, LocalMatch<F>> {
  const byName = new Map<string, F[]>();
  for (const file of files) {
    const key = photoNameKey(file.name);
    byName.set(key, [...(byName.get(key) ?? []), file]);
  }
  const result = new Map<string, LocalMatch<F>>();
  for (const ref of refs) {
    const key = photoNameKey(ref);
    const found = byName.get(key) ?? [];
    if (found.length === 0) result.set(key, { kind: 'NOT_FOUND' });
    else if (found.length > 1) result.set(key, { kind: 'AMBIGUOUS' });
    else if (found[0].size > PHOTO_MAX_BYTES) result.set(key, { kind: 'TOO_LARGE' });
    else result.set(key, { kind: 'FOUND', file: found[0] });
  }
  return result;
}

/** Колонка «Фото» в таблице предпросмотра/результата. */
export function rowPhotoText(row: ListingImportRow, matches: Map<string, LocalMatch<LocalFile>> | null): string {
  const photos = row.photos ?? [];
  if (photos.length === 0) return '';
  // Фото не приняты, если у объявления уже есть медиа — в том числе от прошлого
  // импорта, чья загрузка не завершена.
  if (row.outcome === 'SKIPPED_EXISTS' && !row.photos_attached) {
    return 'проигнорированы: у объявления уже есть фото или незавершённая загрузка — дозагрузите из истории импортов';
  }
  // Сохранённый отчёт: фото записаны — показываем прогресс, а не состав ячейки.
  if (photos.some((p) => p.id !== null)) {
    return `${photos.filter((p) => p.status === 'DONE').length} / ${photos.length}`;
  }
  const urls = photos.filter((p) => p.source === 'URL').length;
  const files = photos.length - urls;
  const parts: string[] = [];
  if (urls > 0) parts.push(`ссылок ${urls}`);
  if (files > 0) {
    parts.push(`файлов ${files}`);
    if (matches === null) {
      parts.push('папка не выбрана');
    } else {
      const missing = photos.filter((p) => p.source === 'FILE' && matches.get(photoNameKey(p.ref))?.kind !== 'FOUND').length;
      if (missing > 0) parts.push(`не найдено ${missing}`);
    }
  }
  const counts = `${photos.length} (${parts.join(', ')})`;
  // Предпросмотр «уже существует»: фото добавятся к существующему объявлению (спека §6).
  return row.outcome === 'SKIPPED_EXISTS' ? `будут добавлены: ${counts}` : counts;
}

const PHOTO_ERROR_TEXT: Record<string, string> = {
  FETCH_FAILED: 'сайт не ответил',
  NOT_AN_IMAGE: 'ссылка ведёт на страницу, а не на файл изображения',
  TOO_LARGE: 'файл больше 10 МБ',
  BLOCKED_HOST: 'недопустимый адрес',
  MEDIA_LIMIT: 'в объявлении уже 20 фото',
  LISTING_UNAVAILABLE: 'объявление удалено',
  INTERNAL: 'внутренняя ошибка',
};

export function photoStatusText(photo: ListingImportPhoto): string {
  switch (photo.status) {
    case 'DONE':
      return 'загружено';
    case 'PENDING':
      return 'скачивается';
    case 'AWAITING_UPLOAD':
      return 'ожидает загрузки из папки';
    case 'FAILED':
      if (photo.error_code === 'HTTP_ERROR') return `сайт ответил ошибкой ${photo.http_status ?? ''}`.trim();
      return (photo.error_code && PHOTO_ERROR_TEXT[photo.error_code]) || 'не загружено';
    default:
      return 'не записано';
  }
}

/** Фото, которые браузер может загрузить: записанные `FILE` в `AWAITING_UPLOAD`/`FAILED`. */
export function photoUploadQueue(report: ListingImportReport): ListingImportPhoto[] {
  return report.rows.flatMap((row) =>
    (row.photos ?? []).filter(
      (p) => p.id !== null && p.source === 'FILE' && (p.status === 'AWAITING_UPLOAD' || p.status === 'FAILED'),
    ),
  );
}

const PHOTO_UPLOAD_ERROR_TEXT: Record<string, string> = {
  IMPORT_PHOTO_NAME_MISMATCH: 'имя файла не совпадает с указанным в таблице',
  IMPORT_PHOTO_TOO_LARGE: 'файл больше 10 МБ',
  IMPORT_PHOTO_NOT_FILE: 'это ссылка, а не файл',
  NOT_FOUND: 'фото не найдено в импорте',
};

export function importPhotoUploadErrorText(code: string | null): string {
  return (code && PHOTO_UPLOAD_ERROR_TEXT[code]) || 'не удалось загрузить';
}
