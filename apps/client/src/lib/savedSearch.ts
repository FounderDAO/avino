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
import { AMENITIES, PARKING_TYPES, PROPERTY_TYPES, type Amenity, type ParkingType, type PropertyType } from '@/lib/mock/types';
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

  const roomsMin = asString(filters.rooms_min);
  if (roomsMin) parts.push(`${roomsMin}+`);

  const bathroomsMin = asString(filters.bathrooms_min);
  if (bathroomsMin) parts.push(t('savedSearch.bathrooms', { count: bathroomsMin }));

  const areaMin = asString(filters.area_min);
  const areaMax = asString(filters.area_max);
  if (areaMin && areaMax) parts.push(`${t('search.filters.areaTitle')}: ${areaMin}–${areaMax}`);
  else if (areaMin) parts.push(`${t('search.filters.areaTitle')}: ${t('search.filters.rangeFrom')} ${areaMin}`);
  else if (areaMax) parts.push(`${t('search.filters.areaTitle')}: ${t('search.filters.rangeTo')} ${areaMax}`);

  const lotMin = asString(filters.lot_area_min);
  const lotMax = asString(filters.lot_area_max);
  if (lotMin || lotMax) parts.push(`${t('search.filters.lotAreaTitle')}: ${lotMin || '0'}–${lotMax || '∞'}`);

  const floorMin = asString(filters.floor_min);
  const floorMax = asString(filters.floor_max);
  if (floorMin && floorMax) parts.push(`${t('search.filters.floorTitle')}: ${floorMin}–${floorMax}`);
  else if (floorMin) parts.push(`${t('search.filters.floorTitle')}: ${t('search.filters.rangeFrom')} ${floorMin}`);
  else if (floorMax) parts.push(`${t('search.filters.floorTitle')}: ${t('search.filters.rangeTo')} ${floorMax}`);

  if (filters.not_first_floor) parts.push(t('search.filters.notFirstFloor'));
  if (filters.not_last_floor) parts.push(t('search.filters.notLastFloor'));

  const totalFloorsMin = asString(filters.total_floors_min);
  const totalFloorsMax = asString(filters.total_floors_max);
  if (totalFloorsMin && totalFloorsMax) parts.push(`${t('search.filters.totalFloorsTitle')}: ${totalFloorsMin}–${totalFloorsMax}`);
  else if (totalFloorsMin) parts.push(`${t('search.filters.totalFloorsTitle')}: ${t('search.filters.rangeFrom')} ${totalFloorsMin}`);
  else if (totalFloorsMax) parts.push(`${t('search.filters.totalFloorsTitle')}: ${t('search.filters.rangeTo')} ${totalFloorsMax}`);

  const yearMin = asString(filters.year_min);
  const yearMax = asString(filters.year_max);
  if (yearMin && yearMax) parts.push(`${t('search.filters.yearTitle')}: ${yearMin}–${yearMax}`);
  else if (yearMin) parts.push(`${t('search.filters.yearTitle')}: ${t('search.filters.rangeFrom')} ${yearMin}`);
  else if (yearMax) parts.push(`${t('search.filters.yearTitle')}: ${t('search.filters.rangeTo')} ${yearMax}`);

  if (filters.listing_source === 'OWNER') parts.push(t('search.filters.sourceOwner'));
  else if (filters.listing_source === 'AGENCY') parts.push(t('search.filters.sourceAgency'));

  if (filters.tours_enabled) parts.push(t('search.filters.toursEnabled'));

  const parking = Array.isArray(filters.parking_types) ? (filters.parking_types as string[]) : [];
  if (parking.length) parts.push(t('search.filters.parkingTypesTitle'));

  const amenitiesArr = Array.isArray(filters.amenities) ? (filters.amenities as string[]) : [];
  if (amenitiesArr.length) parts.push(t('search.filters.amenitiesTitle'));

  const q = asString(filters.q);
  if (q) parts.push(`«${q}»`);

  if (asString(filters.points)) parts.push(t('savedSearch.territory'));

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
  set('region_id', asString(filters.region_id));
  set('district_id', asString(filters.district_id));
  set('priceMin', asString(filters.price_min));
  set('priceMax', asString(filters.price_max));
  set('rooms', asString(filters.rooms));
  set('rooms_min', asString(filters.rooms_min));
  set('bathrooms_min', asString(filters.bathrooms_min));
  set('area_min', asString(filters.area_min));
  set('area_max', asString(filters.area_max));
  set('lot_area_min', asString(filters.lot_area_min));
  set('lot_area_max', asString(filters.lot_area_max));
  set('floor_min', asString(filters.floor_min));
  set('floor_max', asString(filters.floor_max));
  set('total_floors_min', asString(filters.total_floors_min));
  set('total_floors_max', asString(filters.total_floors_max));
  set('year_min', asString(filters.year_min));
  set('year_max', asString(filters.year_max));
  if (filters.not_first_floor) params.set('not_first_floor', 'true');
  if (filters.not_last_floor) params.set('not_last_floor', 'true');
  set('listing_source', asString(filters.listing_source));
  if (filters.tours_enabled) params.set('tours_enabled', 'true');
  if (Array.isArray(filters.parking_types)) {
    for (const p of filters.parking_types as string[]) {
      if (PARKING_TYPES.includes(p as ParkingType)) params.append('parking_type', p);
    }
  }
  if (Array.isArray(filters.amenities)) {
    for (const a of filters.amenities as string[]) {
      if (AMENITIES.includes(a as Amenity)) params.append('amenities', a);
    }
  }
  set('query', asString(filters.q));

  // `points` (нарисованная территория) намеренно НЕ мапим в URL: по клику территорию
  // заново не рисуем (MVP) — выдача перезапускается по скалярам (решение 2026-06-19).
  const qs = params.toString();
  return qs ? `/search?${qs}` : '/search';
}
