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

/** «Новое» ли объявление по относительной дате (как эвристика прототипа). */
export function isFresh(created: string): boolean {
  return /час|1 день|2 дня/.test(created);
}

/** Русская плюрализация: piece для (1, 2-4, 5+). */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/**
 * Относительная дата публикации на русском по ISO-строке: «только что»,
 * «5 минут назад», «2 часа назад», «3 дня назад», «2 недели назад»,
 * «4 месяца назад», «1 год назад». Невалидный/будущий ввод → «только что».
 */
export function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return 'только что';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'только что';

  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return 'только что';

  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} ${plural(min, 'минуту', 'минуты', 'минут')} назад`;

  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} ${plural(hour, 'час', 'часа', 'часов')} назад`;

  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} ${plural(day, 'день', 'дня', 'дней')} назад`;

  const week = Math.floor(day / 7);
  if (day < 30) return `${week} ${plural(week, 'неделю', 'недели', 'недель')} назад`;

  const month = Math.floor(day / 30);
  if (month < 12) return `${month} ${plural(month, 'месяц', 'месяца', 'месяцев')} назад`;

  const year = Math.floor(day / 365);
  return `${year} ${plural(year, 'год', 'года', 'лет')} назад`;
}
