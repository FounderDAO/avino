/**
 * searchApi — RTK Query слайс поиска публичного портала (CLAUDE.md §4).
 *
 * `searchByBounds` — поиск ACTIVE-листингов внутри видимой области карты:
 * GET /api/v1/search/bounds (API.md §10, PostGIS ST_MakeEnvelope/ST_Within).
 * `searchByPolygon` — поиск внутри нарисованной территории (freehand-ласо):
 * GET /api/v1/search/polygon (API.md §10, PostGIS ST_MakePolygon/ST_Within, TASK-193).
 * Используется новым поиском по карте (TASK-152, features/map):
 *  - при сдвиге/зуме карты (debounce) — подгружаем листинги текущего bbox;
 *  - при рисовании территории — отправляем кольцо обводки (`points`), точную
 *    фильтрацию ST_Within выполняет сервер (без client point-in-polygon).
 *
 * Ответ маппится в UI-модель {@link Listing} тем же {@link mapListing}, что и
 * серверный слой `lib/api/listings` (без дублирования; функция чистая, серверный
 * fetch-код tree-shake'ается из клиентского бандла).
 */
import { baseApi } from './baseApi';
import {
  mapListing,
  toApiSort,
  type SearchEnvelope,
  type SearchListingsPage,
} from '@/lib/api/listings';
import type { Listing, ListingFilter } from '@/lib/mock/types';
import type { LatLngBounds } from '@/lib/geo';

/** Аргументы поиска по области: углы bbox + опциональные фильтры §9. */
export interface BoundsSearchArgs {
  bounds: LatLngBounds;
  filter?: ListingFilter;
  /** Размер страницы (бэкенд: default 20 / max 100). Для карты берём максимум. */
  limit?: number;
}

/** Аргументы поиска по территории: сериализованное кольцо `points` + фильтры §9. */
export interface PolygonSearchArgs {
  /** Кольцо обводки `lat,lng;...` (см. lib/geo.serializePolygonRing). */
  points: string;
  filter?: ListingFilter;
  limit?: number;
}

/** Аргументы дозагрузки страницы выдачи (keyset, TASK-199). */
export interface SearchPageArgs {
  /** Курсор следующей страницы (meta.next_cursor предыдущей). */
  cursor: string;
  filter?: ListingFilter;
  /** Размер страницы — должен совпадать с SSR (24), чтобы keyset был непрерывным. */
  limit?: number;
}

/** Общие фильтры §9 (tx/тип/цена/комнаты/q/sort/район) → query-параметры. */
function filterParams(filter: ListingFilter): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (filter.tx) params.transaction_type = filter.tx;
  if (filter.type) params.property_type = filter.type;
  if (filter.districtId) params.district_id = filter.districtId;
  if (filter.priceMin != null) params.price_min = filter.priceMin;
  if (filter.priceMax != null) params.price_max = filter.priceMax;
  // Валюта ценового диапазона (Task 14): передаём только когда есть рубеж цены.
  if (filter.currency && (filter.priceMin != null || filter.priceMax != null)) {
    params.currency = filter.currency;
  }
  if (filter.rooms != null) params.rooms = filter.rooms;
  if (filter.query) params.q = filter.query;
  const sort = toApiSort(filter.sort);
  if (sort) params.sort = sort;
  return params;
}

/** Углы bbox + фильтры §9 → query-параметры `/search/bounds`. */
function boundsParams({ bounds, filter = {}, limit = 100 }: BoundsSearchArgs) {
  return {
    sw_lat: bounds.swLat,
    sw_lng: bounds.swLng,
    ne_lat: bounds.neLat,
    ne_lng: bounds.neLng,
    limit,
    ...filterParams(filter),
  };
}

/** Кольцо `points` + фильтры §9 → query-параметры `/search/polygon`. */
function polygonParams({ points, filter = {}, limit = 100 }: PolygonSearchArgs) {
  return { points, limit, ...filterParams(filter) };
}

export const searchApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Листинги внутри видимой области карты (bbox). */
    searchByBounds: build.query<Listing[], BoundsSearchArgs>({
      query: (args) => ({ url: '/search/bounds', params: boundsParams(args) }),
      transformResponse: (env: SearchEnvelope) => env.data.map(mapListing),
      providesTags: ['Search'],
    }),

    /** Листинги внутри нарисованной территории (ST_Within, TASK-193). */
    searchByPolygon: build.query<Listing[], PolygonSearchArgs>({
      query: (args) => ({ url: '/search/polygon', params: polygonParams(args) }),
      transformResponse: (env: SearchEnvelope) => env.data.map(mapListing),
      providesTags: ['Search'],
    }),

    /**
     * Дозагрузка следующей страницы выдачи /search по keyset-курсору (TASK-199).
     * Используется как lazy-query: SSR отдаёт первую страницу + next_cursor,
     * клиент дотягивает остальные по кнопке «Показать ещё». Сохраняет `meta`,
     * чтобы знать следующий курсор и общий total.
     */
    searchPage: build.query<SearchListingsPage, SearchPageArgs>({
      query: ({ cursor, filter = {}, limit = 24 }) => ({
        url: '/search',
        params: { limit, cursor, ...filterParams(filter) },
      }),
      transformResponse: (env: SearchEnvelope) => ({
        listings: env.data.map(mapListing),
        total: env.meta.total,
        nextCursor: env.meta.next_cursor,
      }),
      providesTags: ['Search'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useSearchByBoundsQuery,
  useLazySearchByBoundsQuery,
  useSearchByPolygonQuery,
  useLazySearchByPolygonQuery,
  useLazySearchPageQuery,
} = searchApi;
