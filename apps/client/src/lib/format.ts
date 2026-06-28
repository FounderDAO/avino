/**
 * Хелперы форматирования. Все подписи/единицы — через словарь (неймспейсы
 * `units` и `enums`): хелперы принимают t-функцию от useTranslations() /
 * getTranslations(). Числа — Intl.NumberFormat (запятая — тысячи, точка — дробь).
 */
import type { Currency, Listing, PropertyType, TransactionType } from './mock/types';

/** Translator неймспейса (useTranslations('units') | getTranslations('units')). */
export type T = (key: string, values?: Record<string, string | number>) => string;

/** Форматтер чисел: запятая — разделитель тысяч, точка — дробная часть. */
const nf = new Intl.NumberFormat('en-US');

export interface FormatPriceOptions {
  /** Добавлять суффикс «/мес» для аренды (по умолчанию true). */
  suffix?: boolean;
  /** Целевая валюта отображения; если ≠ нативной — конверт с «≈». */
  display?: Currency;
  /** Курс 1 USD = rate UZS. */
  rate?: number;
}

/** Конверсия суммы между валютами по курсу 1 USD = rate UZS. */
export function convertPrice(value: number, from: Currency, to: Currency, rate: number): number {
  if (from === to) return value;
  return from === 'USD' ? value * rate : value / rate;
}

/** Округление под валюту отображения: USD → целые $, UZS → до 1000. */
function roundForCurrency(value: number, currency: Currency): number {
  return currency === 'USD' ? Math.round(value) : Math.round(value / 1000) * 1000;
}

/**
 * Цена объявления: «1,450,000,000 сум» / «$98,000», для аренды — «… /мес».
 * При opts.display ≠ listing.currency и opts.rate > 0 — конвертирует с префиксом «≈ ».
 */
export function formatPrice(
  listing: Pick<Listing, 'price' | 'currency' | 'tx'>,
  t: T,
  opts: FormatPriceOptions = {},
): string {
  const native = Number(listing.price);
  const convert =
    opts.display != null && opts.display !== listing.currency && !!opts.rate && opts.rate > 0;
  const target: Currency = convert ? opts.display! : listing.currency;
  const value = convert
    ? roundForCurrency(convertPrice(native, listing.currency, target, opts.rate!), target)
    : native;
  const money = target === 'USD' ? '$' + nf.format(value) : nf.format(value) + ' ' + t('sum');
  const body = (convert ? t('approx') + ' ' : '') + money;
  if (opts.suffix === false) return body;
  return listing.tx === 'RENT' ? body + t('perMonth') : body;
}

/** Цена-сумма по числу и валюте (без привязки к листингу). */
export function formatMoney(value: number | string, currency: Currency, t: T): string {
  const n = Number(value);
  return currency === 'USD' ? '$' + nf.format(n) : nf.format(n) + ' ' + t('sum');
}

/** Компактная цена для пинов карты: «$98k», «1.5 млрд».
 * При opts.display ≠ listing.currency и opts.rate > 0 — конвертирует с префиксом «≈ ».
 */
export function pinPrice(
  listing: Pick<Listing, 'price' | 'currency'>,
  t: T,
  opts: { display?: Currency; rate?: number } = {},
): string {
  const convert =
    opts.display != null && opts.display !== listing.currency && !!opts.rate && opts.rate > 0;
  const target: Currency = convert ? opts.display! : listing.currency;
  const raw = convert
    ? convertPrice(Number(listing.price), listing.currency, target, opts.rate!)
    : Number(listing.price);
  const n = target === 'USD' ? Math.round(raw) : Math.round(raw / 1000) * 1000;
  const approx = convert ? t('approx') + ' ' : '';
  if (target === 'USD') {
    if (n >= 1000) return approx + '$' + Math.round(n / 1000) + 'k';
    return approx + '$' + trim(n);
  }
  if (n >= 1e9) return approx + trim(n / 1e9) + ' ' + t('billion');
  if (n >= 1e6) return approx + trim(n / 1e6) + ' ' + t('million');
  if (n >= 1e3) return approx + Math.round(n / 1e3) + 'k';
  return approx + trim(n);
}

/** Округление до 1 знака; точка как десятичный разделитель. */
function trim(v: number): string {
  return (Math.round(v * 10) / 10).toString();
}

/**
 * Нормализует площадь: убирает хвостовые нули («60.00» → «60», «60.50» → «60.5»).
 * Возвращает '' для пустых/undefined значений.
 */
function normalizeArea(area: string | number | undefined): string {
  if (area == null || area === '') return '';
  const n = Number(area);
  if (Number.isNaN(n)) return String(area);
  // toFixed(2) покрывает типичные случаи (API возвращает строки «60.00»),
  // parseFloat убирает хвостовые нули.
  return String(parseFloat(n.toFixed(2)));
}

/** Площадь: «78 м²» (без хвостовых нулей). */
export function formatArea(area: string | number | undefined, t: T): string {
  const norm = normalizeArea(area);
  if (!norm) return '';
  return t('area', { value: norm });
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
  l: Pick<Listing, 'rooms' | 'bathrooms' | 'area' | 'floor' | 'totalFloors' | 'type'>,
  t: T,
): string[] {
  const parts: string[] = [];
  if (l.rooms) parts.push(t('roomsShort', { count: l.rooms }));
  if (l.bathrooms) parts.push(t('bathroomsShort', { count: l.bathrooms }));
  const areaNorm = normalizeArea(l.area);
  if (areaNorm) parts.push(t('area', { value: areaNorm }));
  if (l.floor && l.totalFloors) parts.push(t('floorOf', { floor: l.floor, total: l.totalFloors }));
  else if (l.type === 'LAND' && areaNorm) parts.push(t('landArea', { value: areaNorm }));
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

/** Сколько дней объявление на сайте (>= 0). Невалидная/будущая дата → 0. */
export function daysOnSite(createdAt: string): number {
  const then = Date.parse(createdAt);
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

/** Единица «времени на сайте» для компактного бейджа. */
export type ListingAge = { unit: 'days' | 'weeks' | 'months' | 'years'; count: number };

/**
 * Компактный возраст объявления для бейджа: самая крупная подходящая единица.
 * < 1 суток → `null` (бейдж рисует «Новое»). Дальше: дни → недели → месяцы → годы.
 */
export function listingAge(createdAt: string): ListingAge | null {
  const days = daysOnSite(createdAt);
  if (days < 1) return null;
  if (days < 14) return { unit: 'days', count: days };
  if (days < 30) return { unit: 'weeks', count: Math.floor(days / 7) };
  if (days < 365) return { unit: 'months', count: Math.floor(days / 30) };
  return { unit: 'years', count: Math.floor(days / 365) };
}

/**
 * Компактная цена для осей гистограммы/слайдера: «$98k», «$1.5M», «1.5 billion».
 * Без конвертации валют — value уже в нужной валюте.
 */
export function compactPrice(value: number, currency: Currency, t: T): string {
  if (currency === 'USD') {
    if (value >= 1e6) return '$' + trim(value / 1e6) + 'M';
    if (value >= 1e3) return '$' + Math.round(value / 1e3) + 'k';
    return '$' + Math.round(value);
  }
  if (value >= 1e9) return trim(value / 1e9) + ' ' + t('billion');
  if (value >= 1e6) return trim(value / 1e6) + ' ' + t('million');
  if (value >= 1e3) return Math.round(value / 1e3) + 'k';
  return Math.round(value) + ' ' + t('sum');
}
