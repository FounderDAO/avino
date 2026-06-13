/**
 * Хелперы для сохранённых поисков (TASK saved-searches).
 *
 * `filters` — это внутренний объект `filters_json.filters`, который использует
 * ТЕ ЖЕ имена параметров, что и GET /search:
 *   transaction_type, property_type, price_min, price_max, rooms, q,
 *   currency, city_id, district_id.
 *
 * Здесь — два чистых хелпера:
 *  - describeFilters → короткая человекочитаемая сводка для заголовка/мета
 *    (locale-aware: принимает КОРНЕВОЙ translator — useTranslations() без
 *    неймспейса, ключи `savedSearch.*` и `enums.propertyType.*`),
 *  - filtersToSearchHref → ссылка `/search?...` для перехода в выдачу.
 */
import { PROPERTY_TYPES, type PropertyType } from '@/lib/mock/types';
import type { T } from '@/lib/format';

/** Внутренний объект фильтров (произвольные ключи API.md §12). */
export type SavedSearchFilters = Record<string, unknown>;

function asString(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

function isPropertyType(v: unknown): v is PropertyType {
  return typeof v === 'string' && (PROPERTY_TYPES as string[]).includes(v);
}

/** Форматирует число с разделителями тысяч (RU non-breaking space). */
function formatPrice(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString('ru-RU');
}

/**
 * Короткая сводка из внутренних фильтров на языке интерфейса.
 * Пример (ru): «Аренда · Квартира · до 5 000 000 UZS · 2 комн».
 * Неизвестные/пустые поля пропускаются. `t` — КОРНЕВОЙ translator.
 */
export function describeFilters(filters: SavedSearchFilters, t: T): string {
  const parts: string[] = [];

  const tx = asString(filters.transaction_type);
  if (tx === 'SALE') parts.push(t('savedSearch.txSale'));
  else if (tx === 'RENT') parts.push(t('savedSearch.txRent'));

  if (isPropertyType(filters.property_type)) {
    parts.push(t(`enums.propertyType.${filters.property_type}`));
  }

  const currency = asString(filters.currency) ?? '';
  const cur = currency ? ` ${currency}` : '';
  const priceMin = asString(filters.price_min);
  const priceMax = asString(filters.price_max);
  if (priceMin && priceMax) {
    parts.push(`${formatPrice(priceMin)}–${formatPrice(priceMax)}${cur}`);
  } else if (priceMax) {
    parts.push(t('savedSearch.upTo', { value: `${formatPrice(priceMax)}${cur}` }));
  } else if (priceMin) {
    parts.push(t('savedSearch.from', { value: `${formatPrice(priceMin)}${cur}` }));
  }

  const rooms = asString(filters.rooms);
  if (rooms) parts.push(t('savedSearch.rooms', { count: rooms }));

  const q = asString(filters.q);
  if (q) parts.push(`«${q}»`);

  return parts.join(' · ');
}

/**
 * Строит ссылку `/search?...` из внутренних фильтров, мапя имена обратно
 * в query-параметры страницы поиска:
 *   transaction_type→tx, property_type→type, price_min→priceMin,
 *   price_max→priceMax, rooms→rooms, q→query.
 */
export function filtersToSearchHref(filters: SavedSearchFilters): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string | undefined): void => {
    if (value) params.set(key, value);
  };

  set('tx', asString(filters.transaction_type));
  set('type', asString(filters.property_type));
  set('district_id', asString(filters.district_id));
  set('priceMin', asString(filters.price_min));
  set('priceMax', asString(filters.price_max));
  set('rooms', asString(filters.rooms));
  set('query', asString(filters.q));

  const qs = params.toString();
  return qs ? `/search?${qs}` : '/search';
}
