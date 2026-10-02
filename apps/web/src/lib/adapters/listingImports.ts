import type { ListingImportRow, ListingImportRowError } from '@/store/api/adminTypes';

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
};

const ERROR_TEXT: Record<string, string> = {
  REQUIRED: 'обязательное поле',
  INVALID_VALUE: 'недопустимое значение',
  TOO_LONG: 'слишком длинное значение',
  INVALID_PHONE: 'номер не распознан',
  OWNER_BLOCKED: 'владелец заблокирован',
  OWNER_NAME_REQUIRED: 'укажите имя и фамилию владельца',
  UNKNOWN_AMENITY: 'неизвестный код удобства',
};

function errorText(error: ListingImportRowError): string {
  if (error.code === 'INTERNAL') return 'Внутренняя ошибка, строка не создана';
  const text = ERROR_TEXT[error.code] ?? error.message;
  const label = error.column ? COLUMN_LABEL[error.column] ?? error.column : null;
  return label ? `${label}: ${text}` : text;
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
