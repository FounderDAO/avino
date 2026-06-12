/**
 * searchApi — RTK Query слайс поиска публичного портала (CLAUDE.md §4).
 *
 * `searchByBounds` — поиск ACTIVE-листингов внутри видимой области карты:
 * GET /api/v1/search/bounds (API.md §10, PostGIS ST_MakeEnvelope/ST_Within).
 * Используется новым поиском по карте (TASK-152, features/map):
 *  - при сдвиге/зуме карты (debounce) — подгружаем листинги текущего bbox;
 *  - при рисовании территории — берём bbox полигона, а точную форму отсекаем
 *    на клиенте (point-in-polygon, lib/geo). Серверный ST_Within(polygon) —
 *    отдельная задача на apps/api (/search/polygon).
 *
 * Ответ маппится в UI-модель {@link Listing} тем же {@link mapListing}, что и
 * серверный слой `lib/api/listings` (без дублирования; функция чистая, серверный
 * fetch-код tree-shake'ается из клиентского бандла).
 */
import { baseApi } from './baseApi';
import { mapListing, type SearchEnvelope } from '@/lib/api/listings';
import type { Listing, ListingFilter } from '@/lib/mock/types';
import type { LatLngBounds } from '@/lib/geo';

/** Аргументы поиска по области: углы bbox + опциональные фильтры §9. */
export interface BoundsSearchArgs {
  bounds: LatLngBounds;
  filter?: ListingFilter;
  /** Размер страницы (бэкенд: default 20 / max 100). Для карты берём максимум. */
  limit?: number;
}

/** UI-сортировка → значение API (как в lib/api/listings.toApiSort). */
function toApiSort(sort: ListingFilter['sort']): string | undefined {
  if (!sort) return undefined;
  if (sort === 'promotion') return 'promotion_priority_desc';
  return sort;
}

/**
 * Углы bbox + фильтры §9 → query-параметры `/search/bounds`. `district` НЕ
 * отправляется (бэкенд ждёт district_id-uuid, а UI хранит имя — см.
 * TODO(geo-reference) в lib/api/listings).
 */
function boundsParams({ bounds, filter = {}, limit = 100 }: BoundsSearchArgs) {
  const params: Record<string, string | number> = {
    sw_lat: bounds.swLat,
    sw_lng: bounds.swLng,
    ne_lat: bounds.neLat,
    ne_lng: bounds.neLng,
    limit,
  };
  if (filter.tx) params.transaction_type = filter.tx;
  if (filter.type) params.property_type = filter.type;
  if (filter.priceMin != null) params.price_min = filter.priceMin;
  if (filter.priceMax != null) params.price_max = filter.priceMax;
  if (filter.rooms != null) params.rooms = filter.rooms;
  if (filter.query) params.q = filter.query;
  const sort = toApiSort(filter.sort);
  if (sort) params.sort = sort;
  return params;
}

export const searchApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Листинги внутри видимой области карты (bbox). */
    searchByBounds: build.query<Listing[], BoundsSearchArgs>({
      query: (args) => ({ url: '/search/bounds', params: boundsParams(args) }),
      transformResponse: (env: SearchEnvelope) => env.data.map(mapListing),
      providesTags: ['Search'],
    }),
  }),
  overrideExisting: false,
});

export const { useSearchByBoundsQuery, useLazySearchByBoundsQuery } = searchApi;
