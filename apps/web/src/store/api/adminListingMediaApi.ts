import { adminApi } from './adminApi';
import type { ListingMedia } from './adminTypes';

/**
 * Галерея объявления из админки (API.md §8). Эндпоинты общие с владельцем —
 * `/listings/:id/media`, ADMIN допущен и правка ADMIN не возвращает объявление на
 * модерацию. Список медиа берётся из карточки (`GET /listings/:id` → `media`),
 * поэтому мутации инвалидируют `Admin` — карточка перечитывается.
 */
export const adminListingMediaApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    uploadListingMedia: build.mutation<ListingMedia, { listingId: string; file: File }>({
      query: ({ listingId, file }) => {
        const body = new FormData();
        body.append('file', file);
        return { url: `/listings/${listingId}/media`, method: 'POST', body };
      },
      invalidatesTags: ['Admin'],
    }),
    deleteListingMedia: build.mutation<void, { listingId: string; mediaId: string }>({
      query: ({ listingId, mediaId }) => ({ url: `/listings/${listingId}/media/${mediaId}`, method: 'DELETE' }),
      invalidatesTags: ['Admin'],
    }),
    reorderListingMedia: build.mutation<ListingMedia[], { listingId: string; order: string[] }>({
      query: ({ listingId, order }) => ({ url: `/listings/${listingId}/media/reorder`, method: 'PATCH', body: { order } }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useUploadListingMediaMutation,
  useDeleteListingMediaMutation,
  useReorderListingMediaMutation,
} = adminListingMediaApi;
