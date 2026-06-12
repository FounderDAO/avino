/**
 * Хелперы форматирования (порт apps/claudeDesign/scripts/util.js).
 * Деньги форматируем через Intl.NumberFormat (ru-RU, пробелы как разделители).
 */
import type { Currency, Listing, PropertyType, TransactionType } from './mock/types';
import { PROPERTY_TYPE_LABELS } from './mock/types';

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
  opts: FormatPriceOptions = {},
): string {
  const n = Number(listing.price);
  const isUSD = listing.currency === 'USD';
  const body = isUSD ? '$' + nf.format(n) : nf.format(n) + ' сум';
  if (opts.suffix === false) return body;
  return listing.tx === 'RENT' ? body + '/мес' : body;
}

/** Цена-сумма по числу и валюте (без привязки к листингу). */
export function formatMoney(value: number | string, currency: Currency): string {
  const n = Number(value);
  return currency === 'USD' ? '$' + nf.format(n) : nf.format(n) + ' сум';
}

/** Компактная цена для пинов карты: «$98K», «1,5 млрд». */
export function pinPrice(listing: Pick<Listing, 'price' | 'currency'>): string {
  const n = Number(listing.price);
  const isUSD = listing.currency === 'USD';
  if (isUSD) {
    if (n >= 1000) return '$' + trim(n / 1000) + 'K';
    return '$' + trim(n);
  }
  if (n >= 1e9) return trim(n / 1e9) + ' млрд';
  if (n >= 1e6) return trim(n / 1e6) + ' млн';
  if (n >= 1e3) return trim(n / 1e3) + 'K';
  return trim(n);
}

/** Округление до 1 знака с запятой как разделителем. */
function trim(v: number): string {
  return (Math.round(v * 10) / 10).toString().replace('.', ',');
}

/** Площадь: «78 м²». */
export function formatArea(area?: string | number): string {
  if (area == null || area === '') return '';
  return `${area} м²`;
}

/** Комнаты: «3-комн.» (LAND/COMMERCIAL — пусто). */
export function formatRooms(rooms?: number): string {
  if (!rooms) return '';
  return `${rooms}-комн.`;
}

/** Этаж/этажность: «8/10 эт». */
export function formatFloor(floor?: number, totalFloors?: number): string {
  if (floor && totalFloors) return `${floor}/${totalFloors} эт`;
  if (floor) return `${floor} эт`;
  return '';
}

/**
 * Строка характеристик: ["3 комн", "78 м²", "8/10 эт"].
 * Возвращает массив частей (UI сам расставляет разделители).
 */
export function specs(l: Pick<Listing, 'rooms' | 'area' | 'floor' | 'totalFloors' | 'type'>): string[] {
  const parts: string[] = [];
  if (l.rooms) parts.push(`${l.rooms} комн`);
  if (l.area) parts.push(`${l.area} м²`);
  if (l.floor && l.totalFloors) parts.push(`${l.floor}/${l.totalFloors} эт`);
  else if (l.type === 'LAND' && l.area) parts.push(`${l.area} м² участок`);
  return parts;
}

/** Подпись типа сделки: «Аренда» / «Продажа». */
export function txLabel(tx: TransactionType): string {
  return tx === 'RENT' ? 'Аренда' : 'Продажа';
}

/** Подпись типа недвижимости. */
export function propertyTypeLabel(type: PropertyType): string {
  return PROPERTY_TYPE_LABELS[type];
}

/** «Новое» объявление: опубликовано менее 3 дней назад. */
export function isFresh(createdAt: string): boolean {
  const then = Date.parse(createdAt);
  if (Number.isNaN(then)) return false;
  return Date.now() - then < 3 * 24 * 60 * 60 * 1000;
}
