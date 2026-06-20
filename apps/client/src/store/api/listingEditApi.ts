/**
 * listingEditApi — редактирование собственного объявления (bug-fix: реальный edit).
 *
 * Эндпоинты (API.md §7, §8):
 *  - GET    /listings/:id            — детальная карточка. Bearer: владелец видит
 *    и НЕ-ACTIVE свои объявления (canViewNonActive) → префилл формы.
 *  - PATCH  /listings/:id            — частичное обновление (snake_case, `translation`
 *    вложен). Бэкенд ОТКЛОНЯЕТ неизвестные поля — шлём строго поля UpdateListingDto.
 *  - GET    /listings/:id/media          — галерея.
 *  - POST   /listings/:id/media          — добавить фото (multipart, поле `file`).
 *  - DELETE /listings/:id/media/:mediaId — удалить фото.
 *  - PATCH  /listings/:id/media/reorder  — порядок ({ order: mediaId[] }, 0-based).
 *
 * `original_language` менять нельзя (ADR-005), `status` — только модерация: оба не
 * входят в тело PATCH.
 */
import { baseApi } from './baseApi';

/** Медиа объявления (как в ListingMediaResponse / detail.media). */
export interface EditListingMedia {
  id: string;
  url: string;
  thumbnail_url: string | null;
  sort_order: number;
  type: string;
}

/** Подмножество GET /listings/:id, нужное форме редактирования (snake_case). */
export interface EditListingDetail {
  id: string;
  status: string;
  transaction_type: 'SALE' | 'RENT';
  property_type: string;
  price: string;
  currency: 'USD' | 'UZS';
  area: string | null;
  rooms: number | null;
  floor: number | null;
  total_floors: number | null;
  year_built: number | null;
  district_id: string | null;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  owner_id: string;
  /** Язык возвращённого title/description (= original_language, т.к. перевод один). */
  language: 'RU' | 'UZ' | 'EN';
  title: string;
  description: string | null;
  address_note: string | null;
  media: EditListingMedia[];
  tours_enabled: boolean;
  tour_windows: { start: string; end: string }[];
}

/** Тело PATCH /listings/:id (строго поля UpdateListingDto). */
export interface UpdateListingPatch {
  transaction_type?: string;
  property_type?: string;
  price?: string;
  currency?: string;
  area?: string;
  rooms?: number;
  floor?: number;
  total_floors?: number;
  year_built?: number;
  address?: string;
  latitude?: string;
  longitude?: string;
  translation?: {
    title?: string;
    description?: string;
    address_note?: string;
  };
  tours_enabled?: boolean;
  tour_windows?: { start: string; end: string }[];
}

export const listingEditApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Детальная карточка для префилла (Bearer → владелец видит и свои non-ACTIVE). */
    getListingForEdit: build.query<EditListingDetail, string>({
      query: (id) => ({ url: `/listings/${id}` }),
      providesTags: (_res, _err, id) => [{ type: 'Listing', id }],
    }),

    /** Частичное обновление объявления. PATCH /listings/:id. */
    updateListing: build.mutation<unknown, { id: string; body: UpdateListingPatch }>({
      query: ({ id, body }) => ({ url: `/listings/${id}`, method: 'PATCH', body }),
      // Инвалидируем и конкретный листинг (detail), и общий тег 'Listing'
      // (его provideтся myListings/выдача → списки обновятся).
      invalidatesTags: (_res, _err, { id }) => [{ type: 'Listing', id }, 'Listing'],
    }),

    /** Добавить одно фото. POST /listings/:id/media (multipart). Возвращает медиа. */
    addListingMedia: build.mutation<EditListingMedia, { listingId: string; file: File }>({
      query: ({ listingId, file }) => {
        const form = new FormData();
        form.append('file', file);
        return { url: `/listings/${listingId}/media`, method: 'POST', body: form };
      },
    }),

    /** Удалить фото. DELETE /listings/:id/media/:mediaId. */
    deleteListingMedia: build.mutation<void, { listingId: string; mediaId: string }>({
      query: ({ listingId, mediaId }) => ({
        url: `/listings/${listingId}/media/${mediaId}`,
        method: 'DELETE',
      }),
    }),

    /** Переупорядочить галерею. PATCH /listings/:id/media/reorder. */
    reorderListingMedia: build.mutation<unknown, { listingId: string; order: string[] }>({
      query: ({ listingId, order }) => ({
        url: `/listings/${listingId}/media/reorder`,
        method: 'PATCH',
        body: { order },
      }),
    }),
  }),
});

export const {
  useGetListingForEditQuery,
  useUpdateListingMutation,
  useAddListingMediaMutation,
  useDeleteListingMediaMutation,
  useReorderListingMediaMutation,
} = listingEditApi;
