/**
 * Хелперы форматирования. Все подписи/единицы — через словарь (неймспейсы
 * `units` и `enums`): хелперы принимают t-функцию от useTranslations() /
 * getTranslations(). Числа — Intl.NumberFormat (пробелы как разделители тысяч).
 */
import type { Currency, Listing, PropertyType, TransactionType } from './mock/types';

/** Translator неймспейса (useTranslations('units') | getTranslations('units')). */
export type T = (key: string, values?: Record<string, string | number>) => string;

/** Форматтер чисел: пробелы как разделители тысяч. */
const nf = new Intl.NumberFormat('ru-RU');

export interface FormatPriceOptions {
  /** Добавлять суффикс «/мес» для аренды (по умолчанию true). */
  suffix?: boolean;
}

/**
 * Цена объявления: «1 450 000 000 сум» / «$98 000», для аренды — «… /мес».
 */
export function formatPrice(
  listing: Pick<Listing, 'price' | 'currency' | 'tx'>,
  t: T,
  opts: FormatPriceOptions = {},
): string {
  const n = Number(listing.price);
  const isUSD = listing.currency === 'USD';
  const body = isUSD ? '$' + nf.format(n) : nf.format(n) + ' ' + t('sum');
  if (opts.suffix === false) return body;
  return listing.tx === 'RENT' ? body + t('perMonth') : body;
}

/** Цена-сумма по числу и валюте (без привязки к листингу). */
export function formatMoney(value: number | string, currency: Currency, t: T): string {
  const n = Number(value);
  return currency === 'USD' ? '$' + nf.format(n) : nf.format(n) + ' ' + t('sum');
}

/** Компактная цена для пинов карты: «$98K», «1,5 млрд». */
export function pinPrice(listing: Pick<Listing, 'price' | 'currency'>, t: T): string {
  const n = Number(listing.price);
  const isUSD = listing.currency === 'USD';
  if (isUSD) {
    if (n >= 1000) return '$' + trim(n / 1000) + 'K';
    return '$' + trim(n);
  }
  if (n >= 1e9) return trim(n / 1e9) + ' ' + t('billion');
  if (n >= 1e6) return trim(n / 1e6) + ' ' + t('million');
  if (n >= 1e3) return trim(n / 1e3) + 'K';
  return trim(n);
}

/** Округление до 1 знака с запятой как разделителем. */
function trim(v: number): string {
  return (Math.round(v * 10) / 10).toString().replace('.', ',');
}

/** Площадь: «78 м²». */
export function formatArea(area: string | number | undefined, t: T): string {
  if (area == null || area === '') return '';
  return t('area', { value: area });
}

/** Комнаты: «3-комн.» (LAND/COMMERCIAL — пусто). */
export function formatRooms(rooms: number | undefined, t: T): string {
  if (!rooms) return '';
  return t('rooms', { count: rooms });
}

/** Этаж/этажность: «8/10 эт». */
export function formatFloor(
  floor: number | undefined,
  totalFloors: number | undefined,
  t: T,
): string {
  if (floor && totalFloors) return t('floorOf', { floor, total: totalFloors });
  if (floor) return t('floor', { floor });
  return '';
}

/**
 * Строка характеристик: ["3 комн", "78 м²", "8/10 эт"].
 * Возвращает массив частей (UI сам расставляет разделители).
 */
export function specs(
  l: Pick<Listing, 'rooms' | 'area' | 'floor' | 'totalFloors' | 'type'>,
  t: T,
): string[] {
  const parts: string[] = [];
  if (l.rooms) parts.push(t('roomsShort', { count: l.rooms }));
  if (l.area) parts.push(t('area', { value: l.area }));
  if (l.floor && l.totalFloors) parts.push(t('floorOf', { floor: l.floor, total: l.totalFloors }));
  else if (l.type === 'LAND' && l.area) parts.push(t('landArea', { value: l.area }));
  return parts;
}

/** Подпись типа сделки (t — от неймспейса `enums`). */
export function txLabel(tx: TransactionType, t: T): string {
  return t(`tx.${tx}`);
}

/** Подпись типа недвижимости (t — от неймспейса `enums`). */
export function propertyTypeLabel(type: PropertyType, t: T): string {
  return t(`propertyType.${type}`);
}

/** «Новое» объявление: опубликовано менее 3 дней назад. */
export function isFresh(createdAt: string): boolean {
  const then = Date.parse(createdAt);
  if (Number.isNaN(then)) return false;
  return Date.now() - then < 3 * 24 * 60 * 60 * 1000;
}
