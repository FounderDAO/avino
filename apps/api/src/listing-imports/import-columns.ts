import {
  Currency,
  Language,
  ParkingType,
  PropertyType,
  TransactionType,
} from '@prisma/client';

/** Лимиты файла импорта (спека 2026-10-02 §1). */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 500;

/**
 * Реестр колонок — единственный источник правды и для парсера, и для шаблона.
 * `header: true` — колонка обязана присутствовать в строке заголовков.
 */
export const IMPORT_COLUMNS = [
  { key: 'phone', label: 'Телефон', header: true },
  { key: 'first_name', label: 'Имя', header: false },
  { key: 'last_name', label: 'Фамилия', header: false },
  { key: 'transaction_type', label: 'Тип сделки', header: true },
  { key: 'property_type', label: 'Тип недвижимости', header: true },
  { key: 'title', label: 'Заголовок', header: true },
  { key: 'description', label: 'Описание', header: false },
  { key: 'language', label: 'Язык', header: false },
  { key: 'price', label: 'Цена', header: true },
  { key: 'currency', label: 'Валюта', header: true },
  { key: 'address', label: 'Адрес', header: true },
  { key: 'area', label: 'Площадь', header: false },
  { key: 'lot_area', label: 'Площадь участка', header: false },
  { key: 'floor', label: 'Этаж', header: false },
  { key: 'total_floors', label: 'Этажность', header: false },
  { key: 'rooms', label: 'Комнат', header: false },
  { key: 'bathrooms', label: 'Санузлы', header: false },
  { key: 'year_built', label: 'Год постройки', header: false },
  { key: 'parking_type', label: 'Парковка', header: false },
  { key: 'latitude', label: 'Широта', header: false },
  { key: 'longitude', label: 'Долгота', header: false },
  { key: 'amenities', label: 'Удобства', header: false },
  { key: 'photos', label: 'Фото', header: false },
] as const;

export type ImportColumnKey = (typeof IMPORT_COLUMNS)[number]['key'];
export type ImportRowValues = Partial<Record<ImportColumnKey, string>>;

export const REQUIRED_HEADER_KEYS: ImportColumnKey[] = IMPORT_COLUMNS.filter(
  (c) => c.header,
).map((c) => c.key);

const canon = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

const HEADER_INDEX = new Map<string, ImportColumnKey>();
for (const column of IMPORT_COLUMNS) {
  HEADER_INDEX.set(canon(column.key), column.key);
  HEADER_INDEX.set(canon(column.label), column.key);
}

/** Заголовок файла → ключ колонки (по подписи или ключу, без учёта регистра). */
export function resolveColumnKey(header: string): ImportColumnKey | null {
  return HEADER_INDEX.get(canon(header)) ?? null;
}

function dictionary<T extends string>(
  codes: Record<string, T>,
  labels: Record<string, T>,
): (raw: string) => T | null {
  const index = new Map<string, T>();
  for (const code of Object.values(codes)) index.set(canon(code), code);
  for (const [label, code] of Object.entries(labels)) index.set(canon(label), code);
  return (raw) => index.get(canon(raw)) ?? null;
}

export const parseTransactionType = dictionary(TransactionType, {
  Продажа: TransactionType.SALE,
  Аренда: TransactionType.RENT,
});
export const parsePropertyType = dictionary(PropertyType, {
  Квартира: PropertyType.APARTMENT,
  Дом: PropertyType.HOUSE,
  Участок: PropertyType.LAND,
  Коммерция: PropertyType.COMMERCIAL,
});
export const parseCurrency = dictionary(Currency, {});
export const parseLanguage = dictionary(Language, {});
export const parseParkingType = dictionary(ParkingType, {});
