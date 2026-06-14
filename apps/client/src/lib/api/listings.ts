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
  Currency,
  Listing,
  ListingAgent,
  ListingFilter,
  ListingPhoto,
  ListingStatus,
  PromotionType,
  PropertyType,
  RadiusCircle,
  SortOption,
  TransactionType,
} from '@/lib/mock/types';

import { resolveApiBase } from './base';

/** Список — допустимые промо-тиры выдачи (для безопасного сужения строк API). */
const PROMO_VALUES: PromotionType[] = ['NORMAL', 'TOP', 'VIP'];

/** Плейсхолдер фото, если у листинга нет медиа. */
const FALLBACK_PHOTO: ListingPhoto = {
  url: 'https://placehold.co/800x600?text=Avino',
  thumb: 'https://placehold.co/400x300?text=Avino',
};

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
  rooms: number | null;
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
  media: ApiMedia[];
  published_at: string | null;
  created_at: string;
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
  // Карточка поиска: только обложка-thumbnail.
  const thumb = (l as ApiSearchItem).thumbnail_url;
  if (thumb) return [{ url: thumb, thumb }];
  return [FALLBACK_PHOTO];
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
    rooms: api.rooms ?? undefined,
    floor: detail?.floor ?? undefined,
    totalFloors: detail?.total_floors ?? undefined,
    year: detail?.year_built ?? undefined,

    title: api.title,
    desc: detail?.description ?? undefined,
    features: detail ? toFeatures(detail) : undefined,

    // Имя района на языке ответа (TASK-209, ADR-0068); null → '' (без uuid в UI).
    district: api.district_name ?? '',
    address: detail?.address ?? '',
    lat: toNumberOrUndef(api.latitude),
    lng: toNumberOrUndef(api.longitude),

    photos: toPhotos(api),
    agent,

    createdAt: api.created_at,
    status: api.status,
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
function toApiSort(sort: SortOption | undefined): string | undefined {
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

// ─── Публичные селекторы (контракт мок-слоя) ───

/**
 * Базовые query-параметры поиска (общие для /search и /search/radius).
 * Район фильтруется по `district_id` (UUID из GET /geo/districts, ADR-0068);
 * прочие фильтры §9 применяются на бэке.
 */
function buildSearchParams(filter: ListingFilter, limit: number): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.tx) params.set('transaction_type', filter.tx);
  if (filter.type) params.set('property_type', filter.type);
  if (filter.districtId) params.set('district_id', filter.districtId);
  if (filter.priceMin != null) params.set('price_min', String(filter.priceMin));
  if (filter.priceMax != null) params.set('price_max', String(filter.priceMax));
  if (filter.rooms != null) params.set('rooms', String(filter.rooms));
  if (filter.query) params.set('q', filter.query);
  const sort = toApiSort(filter.sort);
  if (sort) params.set('sort', sort);
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
  const params = new URLSearchParams({ limit: String(limit) });
  return safeSearch(`/search?${params.toString()}`, lang);
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
    // +1, чтобы после фильтрации текущего id осталось достаточно.
    limit: String(limit + 1),
  });
  const similar = await safeSearch(`/search?${params.toString()}`, lang);
  return similar.filter((item) => item.id !== listing.id).slice(0, limit);
}
