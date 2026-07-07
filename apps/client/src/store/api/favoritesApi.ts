/**
 * favoritesApi — серверное избранное (docs/API.md §11).
 *
 * Все эндпоинты — Bearer-only (гость получит 401). Поэтому потребители
 * (`useFavoriteIds` в `store/favorites.ts`) обязаны передавать
 * `{ skip: !isAuthenticated }` в `useGetFavoritesQuery`, чтобы гости
 * никогда не дёргали защищённый ручку.
 *
 * Карточки в ответе GET /favorites имеют ту же форму SearchItem, что и
 * элементы GET /search, поэтому переиспользуем чистый маппер `mapListing`.
 */
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { baseApi } from './baseApi';
import { mapListing } from '@/lib/api/listings';
import type {
  Currency,
  Listing,
  ListingStatus,
  ParkingType,
  PromotionType,
  PropertyType,
  TransactionType,
} from '@/lib/mock/types';

/** Элемент выдачи GET /favorites — та же форма, что у элемента /search. */
interface FavoriteSearchItem {
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
  district_name: string | null;
  address: string | null;
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

/** Envelope GET /favorites (docs/API.md §11). */
interface FavoritesEnvelope {
  data: FavoriteSearchItem[];
  meta: { limit: number; total: number; next_cursor: string | null };
}

/** Код ошибки бэка для «уже в избранном» (идемпотентно трактуем как успех). */
const ALREADY_FAVORITED = 'ALREADY_FAVORITED';

/** Узкая форма тела ошибки API.md §2: `{ error: { code, message } }`. */
function isAlreadyFavorited(error: FetchBaseQueryError | undefined): boolean {
  if (!error || error.status !== 409) return false;
  const data = error.data;
  if (typeof data !== 'object' || data === null) return false;
  const inner = (data as { error?: unknown }).error;
  if (typeof inner !== 'object' || inner === null) return false;
  return (inner as { code?: unknown }).code === ALREADY_FAVORITED;
}

export const favoritesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Список избранного текущего пользователя. GET /favorites?limit=50. */
    getFavorites: build.query<Listing[], void>({
      query: () => '/favorites?limit=50',
      transformResponse: (env: FavoritesEnvelope) => env.data.map(mapListing),
      providesTags: ['Favorite'],
    }),

    /**
     * Добавить в избранное. POST /favorites { listing_id }.
     * `409 ALREADY_FAVORITED` трактуется как успех (идемпотентность).
     */
    addFavorite: build.mutation<void, string>({
      queryFn: async (listingId, _api, _extra, baseQuery) => {
        const result = await baseQuery({
          url: '/favorites',
          method: 'POST',
          body: { listing_id: listingId },
        });
        if (result.error) {
          if (isAlreadyFavorited(result.error)) {
            return { data: undefined };
          }
          return { error: result.error };
        }
        return { data: undefined };
      },
      invalidatesTags: ['Favorite'],
    }),

    /** Убрать из избранного. DELETE /favorites/:listingId → 204. */
    removeFavorite: build.mutation<void, string>({
      query: (listingId) => ({
        url: `/favorites/${encodeURIComponent(listingId)}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Favorite'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetFavoritesQuery,
  useAddFavoriteMutation,
  useRemoveFavoriteMutation,
} = favoritesApi;
