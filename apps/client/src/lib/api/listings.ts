/**
 * Серверный слой доступа к публичным данным листингов (реальный NestJS API).
 *
 * Эти функции вызываются ТОЛЬКО из server components (page.tsx) и приводят
 * snake_case-ответы `/api/v1` к существующей UI-модели {@link Listing}. Сигнатуры
 * совпадают с мок-селекторами (`getFeaturedListings`, `getListingById`,
 * `getSimilarListings`, плюс `searchListings` вместо `getListings`), поэтому
 * фич-компоненты не меняются.
 *
 * Эндпоинты (API.md §7, §9):
 *  - GET /api/v1/search          — публичная выдача (envelope `{ data, meta }`)
 *  - GET /api/v1/listings/:id    — детальная карточка (или 404)
 *
 * Бэкенд-контракт (актуальный):
 *  - search и detail отдают `district_name` (имя на языке ответа, TASK-209/ADR-0068).
 *  - detail встраивает `contact` автора (TASK-210/ADR-0069); у краткой карточки
 *    поиска контакта нет → agent заполняется плейсхолдером до открытия detail.
 *  - search применяет transaction_type/property_type/price_min/price_max/district_id
 *    + sort/q (TASK-207/208).
 */
import type {
  Amenity,
  Currency,
  Listing,
  ListingAgent,
  ListingFilter,
  ListingPhoto,
  ListingStatus,
  ParkingType,
  PromotionType,
  PropertyType,
  RadiusCircle,
  SortOption,
  TransactionType,
} from '@/lib/mock/types';

import { resolveApiBase } from './base';

/** Список — допустимые промо-тиры выдачи (для безопасного сужения строк API). */
const PROMO_VALUES: PromotionType[] = ['NORMAL', 'TOP', 'VIP'];

// ─── Формы ответов API (snake_case, см. listings.service.ts / search.service.ts) ───

interface ApiMedia {
  id: string;
  url: string;
  thumbnail_url: string | null;
  sort_order: number;
  type: string;
}

/** Элемент выдачи GET /search (краткая карточка). */
export interface ApiSearchItem {
  id: string;
  status: ListingStatus;
  transaction_type: TransactionType;
  property_type: PropertyType;
  price: string;
  currency: Currency;
  rooms: number | null;
  bathrooms: number | null;
  lot_area: string | null;
  parking_type: ParkingType | null;
  city_id: string | null;
  district_id: string | null;
  /** Имя района на языке ответа (TASK-209); null если район не найден. */
  district_name: string | null;
  latitude: string | null;
  longitude: string | null;
  promotion_type: PromotionType;
  promotion_expires_at: string | null;
  effective_tier: PromotionType;
  language: string;
  title: string;
  thumbnail_url: string | null;
  /** До 3 свежих presigned URL фото (индекс 0 = обложка). thumbnail_url = thumbnails[0]. */
  thumbnails?: string[];
  created_at: string;
}

/** Публичный контакт автора (TASK-210, ADR-0069); только в detail. */
interface ApiContactBlock {
  display_name: string | null;
  type: 'owner' | 'agent' | 'agency';
  is_pro: boolean;
  phone: string | null;
}

/** Ответ GET /listings/:id (детальная карточка). */
interface ApiListingDetail {
  id: string;
  status: ListingStatus;
  transaction_type: TransactionType;
  property_type: PropertyType;
  price: string;
  currency: Currency;
  area: string | null;
  lot_area: string | null;
  rooms: number | null;
  bathrooms: number | null;
  parking_type: ParkingType | null;
  floor: number | null;
  total_floors: number | null;
  year_built: number | null;
  city_id: string | null;
  district_id: string | null;
  /** Имя района на языке ответа (TASK-209); null если район не найден. */
  district_name: string | null;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  promotion_type: PromotionType;
  promotion_expires_at: string | null;
  owner_id: string;
  agency_id: string | null;
  /** Публичный контакт автора (TASK-210, ADR-0069). */
  contact: ApiContactBlock;
  language: string;
  title: string;
  description: string | null;
  address_note: string | null;
  features_text: string | null;
  /**
   * API.md §7 показывает структурированный `features[]`, но реальный сервис
   * его НЕ отдаёт (модель M5 ещё не реализована) — удобства приходят только
   * свободным текстом в `features_text`. Объявляем опционально на будущее.
   */
  features?: { id: string; code: string; name: string }[];
  /** Структурированные удобства (ADR-0111, Zillow Phase 2). Всегда массив. */
  amenities: Amenity[];
  media: ApiMedia[];
  published_at: string | null;
  created_at: string;
  tours_enabled: boolean;
  tour_windows: { start: string; end: string }[];
}

/** Envelope поиска (API.md §9). Реиспользуется клиентским searchApi (TASK-152). */
export interface SearchEnvelope {
  data: ApiSearchItem[];
  meta: { limit: number; total: number; next_cursor: string | null };
}

// ─── Любой элемент, который умеет маппить mapListing ───

type AnyApiListing = ApiSearchItem | ApiListingDetail;

function hasMedia(l: AnyApiListing): l is ApiListingDetail {
  return Array.isArray((l as ApiListingDetail).media);
}

// ─── HTTP ───

/** Заголовки запроса: контент листинга — на языке интерфейса (API.md §1). */
function apiHeaders(lang: string): Record<string, string> {
  return { Accept: 'application/json', 'Accept-Language': lang };
}

/**
 * Низкоуровневый fetch к `${API_BASE}${path}`. Динамические данные → `no-store`.
 * Бросает при не-2xx (кроме 404 — вызывающий решает сам через {@link fetchOrNull}).
 */
async function apiFetch<T>(path: string, lang: string): Promise<T> {
  const res = await fetch(`${resolveApiBase()}${path}`, {
    cache: 'no-store',
    headers: apiHeaders(lang),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status} ${res.statusText} for ${path}`);
  }
  return (await res.json()) as T;
}

/** Как {@link apiFetch}, но 404 → null (для detail). */
async function fetchOrNull<T>(path: string, lang: string): Promise<T | null> {
  const res = await fetch(`${resolveApiBase()}${path}`, {
    cache: 'no-store',
    headers: apiHeaders(lang),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`API ${res.status} ${res.statusText} for ${path}`);
  }
  return (await res.json()) as T;
}

// ─── Мапперы ───

function toPromo(value: PromotionType | string | null | undefined): PromotionType {
  return PROMO_VALUES.includes(value as PromotionType)
    ? (value as PromotionType)
    : 'NORMAL';
}

function toNumberOrUndef(v: string | null | undefined): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Удобства: предпочитаем структурированные `features[]`, иначе режем `features_text`. */
function toFeatures(l: ApiListingDetail): string[] | undefined {
  if (l.features?.length) return l.features.map((f) => f.name);
  if (l.features_text) {
    const parts = l.features_text
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts : undefined;
  }
  return undefined;
}

function toPhotos(l: AnyApiListing): ListingPhoto[] {
  if (hasMedia(l) && l.media.length) {
    return [...l.media]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({ url: m.url, thumb: m.thumbnail_url ?? m.url }));
  }
  // Карточка поиска: предпочитаем массив thumbnails (до 3 фото) — слайдер оживает.
  const item = l as ApiSearchItem;
  if (item.thumbnails?.length) {
    return item.thumbnails.map((u) => ({ url: u, thumb: u }));
  }
  // Фолбэк на одиночный thumbnail_url (старый бэкенд / graceful degradation).
  const thumb = item.thumbnail_url;
  if (thumb) return [{ url: thumb, thumb }];
  // Нет фото → пустой список (TASK-197). Брендовый плейсхолдер рисует PhotoImg/
  // Gallery, без внешнего хотлинка placehold.co.
  return [];
}

/** Есть ли у листинга хотя бы одно реальное фото (TASK-197). */
export function hasPhoto(listing: Listing): boolean {
  return listing.photos.length > 0;
}

/**
 * Витринная сортировка (TASK-197): листинги с фото — первыми, без фото — в конце.
 * Стабильна (сохраняет относительный промо-порядок внутри каждой группы) и не
 * мутирует вход. Объявления без фото не исключаем полностью, чтобы витрина не
 * опустела на сиде, где у большинства листингов фото пока нет.
 */
export function prioritizePhotos(listings: Listing[]): Listing[] {
  return [...listings.filter(hasPhoto), ...listings.filter((l) => !hasPhoto(l))];
}

/**
 * snake_case API → UI-модель {@link Listing}. Работает и для краткой карточки
 * поиска, и для детального ответа (detail-only поля берутся через guard).
 */
export function mapListing(api: AnyApiListing): Listing {
  const detail = hasMedia(api) ? (api as ApiListingDetail) : null;

  // Контакт автора есть только в detail (TASK-210, ADR-0069). У краткой карточки
  // поиска контакта нет → нейтральный плейсхолдер (заполнится при открытии detail).
  const agent: ListingAgent = detail
    ? {
        name: detail.contact.display_name ?? '',
        pro: detail.contact.is_pro,
        agency: '',
        phone: detail.contact.phone ?? undefined,
      }
    : { name: '', pro: false, agency: '', phone: undefined };

  return {
    id: api.id,
    tx: api.transaction_type,
    type: api.property_type,
    // effective_tier есть только у карточки поиска; у detail — promotion_type.
    promo: toPromo(
      detail ? api.promotion_type : (api as ApiSearchItem).effective_tier,
    ),

    price: api.price,
    currency: api.currency,

    area: detail?.area ?? undefined,
    lotArea: (api as ApiSearchItem | ApiListingDetail).lot_area ?? undefined,
    rooms: api.rooms ?? undefined,
    bathrooms: (api as ApiSearchItem | ApiListingDetail).bathrooms ?? undefined,
    parkingType: (api as ApiSearchItem | ApiListingDetail).parking_type ?? undefined,
    floor: detail?.floor ?? undefined,
    totalFloors: detail?.total_floors ?? undefined,
    year: detail?.year_built ?? undefined,

    title: api.title,
    desc: detail?.description ?? undefined,
    features: detail ? toFeatures(detail) : undefined,
    amenities: detail?.amenities ?? [],

    // Имя района на языке ответа (TASK-209, ADR-0068); null → '' (без uuid в UI).
    district: api.district_name ?? '',
    address: detail?.address ?? '',
    lat: toNumberOrUndef(api.latitude),
    lng: toNumberOrUndef(api.longitude),

    photos: toPhotos(api),
    agent,
    // owner_id есть только в detail-ответе (ApiListingDetail); у карточки поиска — undefined.
    ownerId: detail?.owner_id,

    createdAt: api.created_at,
    status: api.status,
    toursEnabled: detail?.tours_enabled,
    tourWindows: detail?.tour_windows ?? [],
  };
}

// ─── Маппинг сортировки UI → API (значения API.md §9) ───

/**
 * Значения `sort`, которые принимает бэк (API.md §9 / SORT_MODES в
 * search-listings.dto.ts). Строгая валидация: любое иное → 400.
 */
const API_SORT_MODES = ['date_desc', 'price_asc', 'price_desc', 'area_desc'] as const;

/**
 * UI-сортировка → query `sort` для API §9.
 *
 * Промо-тир на бэке ВСЕГДА первичный ключ ORDER BY, поэтому UI-режим `promotion`
 * = серверный дефолт → `sort` не отправляем. `area_asc` бэком не поддержан, как и
 * любое значение вне {@link API_SORT_MODES} → опускаем, иначе строгая валидация
 * вернёт 400 и выдача деградирует в пустую (пустые карусели/«Ничего не найдено»).
 */
export function toApiSort(sort: SortOption | undefined): string | undefined {
  if (!sort || sort === 'promotion') return undefined;
  return (API_SORT_MODES as readonly string[]).includes(sort) ? sort : undefined;
}

/**
 * Безопасная выдача поиска: при ошибке API (5xx/4xx/сеть) секция деградирует
 * до пустого списка вместо краха всей SSR-страницы. Ошибка логируется на
 * сервере. Для одиночного листинга используется fetchOrNull (404 → null).
 */
async function safeSearch(path: string, lang: string): Promise<Listing[]> {
  try {
    const env = await apiFetch<SearchEnvelope>(path, lang);
    return env.data.map(mapListing);
  } catch (err) {
    console.error(`[listings] search failed, degrading to empty: ${path}`, err);
    return [];
  }
}

/** Страница выдачи + keyset-курсор/общий счётчик (API.md §9). */
export interface SearchListingsPage {
  listings: Listing[];
  /** meta.total — общее число объявлений под фильтром (не размер страницы). */
  total: number;
  /** meta.next_cursor — непрозрачный токен следующей страницы (null = конец). */
  nextCursor: string | null;
}

/**
 * Как {@link safeSearch}, но сохраняет `meta` (total + next_cursor) для пагинации.
 * При ошибке деградирует до пустой страницы без курсора.
 */
async function safeSearchPage(path: string, lang: string): Promise<SearchListingsPage> {
  try {
    const env = await apiFetch<SearchEnvelope>(path, lang);
    return {
      listings: env.data.map(mapListing),
      total: env.meta.total,
      nextCursor: env.meta.next_cursor,
    };
  } catch (err) {
    console.error(`[listings] search page failed, degrading to empty: ${path}`, err);
    return { listings: [], total: 0, nextCursor: null };
  }
}

// ─── Публичные селекторы (контракт мок-слоя) ───

/**
 * Базовые query-параметры поиска (общие для /search и /search/radius).
 * Район фильтруется по `district_id` (UUID из GET /geo/districts, ADR-0068);
 * прочие фильтры §9 применяются на бэке.
 */
export function buildSearchParams(filter: ListingFilter, limit: number): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.tx) params.set('transaction_type', filter.tx);
  // Приоритет: types (мультивыбор) перекрывает одиночный type.
  // Если types не задан (или пуст) — fallback на type для обратной совместимости мок-вызовов.
  if (filter.types && filter.types.length > 0) {
    for (const tp of filter.types) params.append('property_type', tp);
  } else if (filter.type) {
    params.set('property_type', filter.type);
  }
  if (filter.regionId) params.set('region_id', filter.regionId);
  if (filter.districtId) params.set('district_id', filter.districtId);
  if (filter.priceMin != null) params.set('price_min', String(filter.priceMin));
  if (filter.priceMax != null) params.set('price_max', String(filter.priceMax));
  // Валюта ценового диапазона — только когда задан хотя бы один рубеж (зеркало
  // searchApi.filterParams; без рубежа валюта исключила бы объявления зря).
  if (filter.currency && (filter.priceMin != null || filter.priceMax != null)) {
    params.set('currency', filter.currency);
  }
  if (filter.rooms != null) params.set('rooms', String(filter.rooms));
  if (filter.query) params.set('q', filter.query);
  const sort = toApiSort(filter.sort);
  if (sort) params.set('sort', sort);
  if (filter.roomsMin != null) params.set('rooms_min', String(filter.roomsMin));
  if (filter.bathroomsMin != null) params.set('bathrooms_min', String(filter.bathroomsMin));
  if (filter.roomsExact != null) params.set('rooms', String(filter.roomsExact));
  if (filter.areaMin != null) params.set('area_min', String(filter.areaMin));
  if (filter.areaMax != null) params.set('area_max', String(filter.areaMax));
  if (filter.lotAreaMin != null) params.set('lot_area_min', String(filter.lotAreaMin));
  if (filter.lotAreaMax != null) params.set('lot_area_max', String(filter.lotAreaMax));
  if (filter.floorMin != null) params.set('floor_min', String(filter.floorMin));
  if (filter.floorMax != null) params.set('floor_max', String(filter.floorMax));
  if (filter.notFirstFloor) params.set('not_first_floor', 'true');
  if (filter.notLastFloor) params.set('not_last_floor', 'true');
  if (filter.totalFloorsMin != null) params.set('total_floors_min', String(filter.totalFloorsMin));
  if (filter.totalFloorsMax != null) params.set('total_floors_max', String(filter.totalFloorsMax));
  if (filter.yearMin != null) params.set('year_min', String(filter.yearMin));
  if (filter.yearMax != null) params.set('year_max', String(filter.yearMax));
  if (filter.listingSource) params.set('listing_source', filter.listingSource);
  if (filter.toursEnabled) params.set('tours_enabled', 'true');
  if (filter.parkingTypes && filter.parkingTypes.length > 0) {
    for (const pt of filter.parkingTypes) params.append('parking_type', pt);
  }
  if (filter.amenities && filter.amenities.length > 0) {
    for (const a of filter.amenities) params.append('amenities', a);
  }
  params.set('limit', String(limit));
  return params;
}

/** Публичная выдача по фильтру. GET /api/v1/search. */
export async function searchListings(
  filter: ListingFilter = {},
  lang = 'ru',
  limit = 24,
): Promise<Listing[]> {
  const params = buildSearchParams(filter, limit);
  return safeSearch(`/search?${params.toString()}`, lang);
}

/**
 * Первая страница выдачи поиска вместе с `meta` (total + next_cursor) — для
 * SSR /search, который прокидывает курсор в клиентскую дозагрузку (TASK-199).
 * `cursor` опционален: SSR грузит первую страницу, дальнейшие — клиент через
 * RTK Query (см. searchApi.searchPage).
 */
export async function searchListingsPage(
  filter: ListingFilter = {},
  lang = 'ru',
  limit = 24,
  cursor?: string,
): Promise<SearchListingsPage> {
  const params = buildSearchParams(filter, limit);
  if (cursor) params.set('cursor', cursor);
  return safeSearchPage(`/search?${params.toString()}`, lang);
}

/**
 * Радиусный гео-поиск. GET /api/v1/search/radius (API.md §10, PostGIS ST_DWithin).
 * Принимает те же фильтры §9, что и /search, плюс центр и радиус круга,
 * нарисованного на карте. Радиус ограничен бэкендом: 1..50000 м.
 */
export async function searchRadiusListings(
  filter: ListingFilter,
  circle: RadiusCircle,
  lang = 'ru',
  limit = 24,
): Promise<Listing[]> {
  const params = buildSearchParams(filter, limit);
  params.set('lat', String(circle.lat));
  params.set('lng', String(circle.lng));
  params.set('radius_m', String(Math.round(circle.radiusM)));
  return safeSearch(`/search/radius?${params.toString()}`, lang);
}

/**
 * Рекомендованные (промо-приоритет) для главной. GET /search.
 * Промо-тир — серверный дефолт ORDER BY, поэтому отдельный `sort` не нужен
 * (и недопустим: API §9 не знает `promotion_priority_desc` → 400).
 */
export async function getFeaturedListings(limit = 6, lang = 'ru'): Promise<Listing[]> {
  // Над-выборка, чтобы фото-приоритет (TASK-197) мог поднять листинги с фото из
  // «хвоста» промо-выдачи в видимый срез. Лимит API §9 — не более 100.
  const fetchLimit = Math.min(Math.max(limit * 4, limit), 100);
  const params = new URLSearchParams({ limit: String(fetchLimit) });
  const listings = await safeSearch(`/search?${params.toString()}`, lang);
  return prioritizePhotos(listings).slice(0, limit);
}

/** Один листинг по id. GET /listings/:id (404 → null). */
export async function getListingById(
  id: string,
  lang = 'ru',
): Promise<Listing | null> {
  const api = await fetchOrNull<ApiListingDetail>(
    `/listings/${encodeURIComponent(id)}`,
    lang,
  );
  return api ? mapListing(api) : null;
}

/**
 * Похожие листинги: тот же тип сделки и недвижимости, исключая текущий.
 * GET /search?transaction_type&property_type&limit.
 */
export async function getSimilarListings(
  listing: Listing,
  limit = 4,
  lang = 'ru',
): Promise<Listing[]> {
  const params = new URLSearchParams({
    transaction_type: listing.tx,
    property_type: listing.type,
    // Над-выборка: запас под исключение текущего id и фото-приоритет (TASK-197).
    limit: String(Math.min(limit * 4 + 1, 100)),
  });
  const similar = await safeSearch(`/search?${params.toString()}`, lang);
  return prioritizePhotos(
    similar.filter((item) => item.id !== listing.id),
  ).slice(0, limit);
}
