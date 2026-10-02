import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { Language, PropertyType } from '@prisma/client';
import { normalizeImportPhone } from '../auth/contact.util';
import { normalizeAddress } from '../geo';
import { CreateListingDto } from '../listings/dto/create-listing.dto';
import {
  ImportColumnKey,
  ImportRowValues,
  parseCurrency,
  parseLanguage,
  parseParkingType,
  parsePropertyType,
  parseTransactionType,
} from './import-columns';

export type ImportErrorCode =
  | 'REQUIRED'
  | 'INVALID_VALUE'
  | 'TOO_LONG'
  | 'INVALID_PHONE'
  | 'OWNER_BLOCKED'
  | 'OWNER_NAME_REQUIRED'
  | 'UNKNOWN_AMENITY'
  | 'INTERNAL';

export interface ImportRowError {
  column: ImportColumnKey | null;
  code: ImportErrorCode;
  message: string;
}

export interface ImportRowInput {
  phone: string;
  firstName: string | null;
  lastName: string | null;
  dto: CreateListingDto;
}

export type ImportRowValidation =
  | { ok: true; input: ImportRowInput }
  | { ok: false; errors: ImportRowError[] };

const NAME_MAX = 100;

/** Свойство DTO → колонка файла (там, где имена расходятся). */
const DTO_PROPERTY_TO_COLUMN: Record<string, ImportColumnKey> = {
  original_language: 'language',
};

/** `85 000,50` → `85000.50`; пробелы (в т.ч. неразрывные) — разделители разрядов. */
function cleanNumber(raw: string): string {
  return raw.replace(/[\s\u00a0]/g, '').replace(',', '.');
}

/**
 * Проверка и преобразование одной строки файла (спека 2026-10-02 §1–§2).
 * Чистая функция: БД не трогает. Правила полей объявления не дублируются —
 * строка превращается в {@link CreateListingDto} и проходит class-validator.
 */
export function validateImportRow(values: ImportRowValues): ImportRowValidation {
  const errors: ImportRowError[] = [];
  const failed = new Set<ImportColumnKey>();
  const fail = (column: ImportColumnKey, code: ImportErrorCode, message: string): void => {
    if (failed.has(column)) return;
    failed.add(column);
    errors.push({ column, code, message });
  };
  const text = (key: ImportColumnKey): string => (values[key] ?? '').trim();
  const required = (key: ImportColumnKey): string => {
    const value = text(key);
    if (!value) fail(key, 'REQUIRED', `${key} is required`);
    return value;
  };

  // --- владелец ---
  const phoneRaw = required('phone');
  const phone = phoneRaw ? normalizeImportPhone(phoneRaw) : null;
  if (phoneRaw && !phone) fail('phone', 'INVALID_PHONE', 'phone is not a valid number');
  const name = (key: 'first_name' | 'last_name'): string | null => {
    const value = text(key);
    if (value.length > NAME_MAX) fail(key, 'TOO_LONG', `${key} is longer than ${NAME_MAX}`);
    return value || null;
  };
  const firstName = name('first_name');
  const lastName = name('last_name');

  // --- словари ---
  const pick = <T>(key: ImportColumnKey, parse: (raw: string) => T | null, value: string): T | undefined => {
    if (!value) return undefined;
    const parsed = parse(value);
    if (parsed === null) fail(key, 'INVALID_VALUE', `${key} has an unknown value`);
    return parsed ?? undefined;
  };
  const transactionType = pick('transaction_type', parseTransactionType, required('transaction_type'));
  const propertyType = pick('property_type', parsePropertyType, required('property_type'));
  const currency = pick('currency', parseCurrency, required('currency'));
  const language = pick('language', parseLanguage, text('language')) ?? Language.RU;
  const parkingType = pick('parking_type', parseParkingType, text('parking_type'));

  // --- числа ---
  const decimal = (key: ImportColumnKey): string | undefined => {
    const value = text(key);
    return value ? cleanNumber(value) : undefined;
  };
  const integer = (key: ImportColumnKey): number | undefined => {
    const value = text(key);
    if (!value) return undefined;
    const cleaned = cleanNumber(value);
    if (!/^\d+$/.test(cleaned)) {
      fail(key, 'INVALID_VALUE', `${key} must be an integer`);
      return undefined;
    }
    return Number(cleaned);
  };
  const bathroomsRaw = text('bathrooms');
  const bathrooms = bathroomsRaw ? Number(cleanNumber(bathroomsRaw)) : undefined;

  required('title');
  required('price');
  required('address');
  const area = decimal('area');
  const lotArea = decimal('lot_area');
  if (propertyType === PropertyType.LAND) {
    if (!lotArea) fail('lot_area', 'REQUIRED', 'lot_area is required for LAND');
  } else if (propertyType !== undefined && !area) {
    fail('area', 'REQUIRED', 'area is required');
  }
  const latitude = decimal('latitude');
  const longitude = decimal('longitude');
  if (latitude && !longitude) fail('longitude', 'REQUIRED', 'longitude is required with latitude');
  if (longitude && !latitude) fail('latitude', 'REQUIRED', 'latitude is required with longitude');

  const amenities = text('amenities')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);

  const plain: Record<string, unknown> = {
    transaction_type: transactionType,
    property_type: propertyType,
    original_language: language,
    price: decimal('price'),
    currency,
    area,
    lot_area: lotArea,
    rooms: integer('rooms'),
    bathrooms,
    parking_type: parkingType,
    floor: integer('floor'),
    total_floors: integer('total_floors'),
    year_built: integer('year_built'),
    address: text('address') || undefined,
    latitude,
    longitude,
    amenities: amenities.length > 0 ? amenities : undefined,
    translation: {
      title: text('title'),
      description: text('description') || undefined,
    },
  };
  for (const key of Object.keys(plain)) {
    if (plain[key] === undefined) delete plain[key];
  }

  const dto = plainToInstance(CreateListingDto, plain);
  collect(validateSync(dto, { whitelist: true }), values, fail);

  if (errors.length > 0 || !phone) return { ok: false, errors };
  return { ok: true, input: { phone, firstName, lastName, dto } };
}

/** Ошибки class-validator → ошибки колонок; уже провалившиеся колонки не дублируем. */
function collect(
  found: ValidationError[],
  values: ImportRowValues,
  fail: (column: ImportColumnKey, code: ImportErrorCode, message: string) => void,
): void {
  for (const error of found) {
    if (error.children && error.children.length > 0) {
      collect(error.children, values, fail);
    }
    if (!error.constraints) continue;
    const column = (DTO_PROPERTY_TO_COLUMN[error.property] ?? error.property) as ImportColumnKey;
    const empty = !(values[column] ?? '').trim();
    const code: ImportErrorCode = empty
      ? 'REQUIRED'
      : 'maxLength' in error.constraints
        ? 'TOO_LONG'
        : 'INVALID_VALUE';
    fail(column, code, Object.values(error.constraints).join('; '));
  }
}

const decimalKey = (value: string | undefined): string =>
  value === undefined ? '' : Number(value).toFixed(2);

/** Адрес в форме сравнения: как в БД (`normalizeAddress`) + регистр и пробелы. */
export function addressKey(address: string): string {
  return normalizeAddress(address).trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Ключ повтора внутри файла (спека §3): телефон вместо владельца. */
export function importRowKey(input: ImportRowInput): string {
  const { dto } = input;
  return [
    input.phone,
    dto.transaction_type,
    dto.property_type,
    addressKey(dto.address ?? ''),
    decimalKey(dto.area),
    decimalKey(dto.lot_area),
    dto.floor ?? '',
  ].join('|');
}
