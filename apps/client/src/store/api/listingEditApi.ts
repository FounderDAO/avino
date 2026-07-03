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
 *  - POST   /listings/:id/view           — счётчик просмотров (LAST_CHANGED_API.md §2).
 *    ПУБЛИЧНЫЙ (без Bearer), доступен для ЛЮБОГО id, не только «своих» — размещён
 *    здесь как ближайший по теме listings-слайс, а не потому что требует владения.
 *
 * `original_language` менять нельзя (ADR-005), `status` — только модерация: оба не
 * входят в тело PATCH.
 */
import { baseApi } from './baseApi';
import type { Amenity, ParkingType } from '@/lib/mock/types';

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
  lot_area: string | null;
  rooms: number | null;
  bathrooms: number | null;
  parking_type: ParkingType | null;
  amenities: Amenity[];
  floor: number | null;
  total_floors: number | null;
  year_built: number | null;
  city_id: string | null;
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
  /** Новые поля LAST_CHANGED_API.md §1; опциональны на случай рассинхрона с бэком. */
  is_basement?: boolean;
  living_area?: string | null;
  non_living_area?: string | null;
  views_count?: number;
  calls_count?: number;
  likes_count?: number;
}

/** Тело PATCH /listings/:id (строго поля UpdateListingDto). */
export interface UpdateListingPatch {
  transaction_type?: string;
  property_type?: string;
  price?: string;
  currency?: string;
  area?: string;
  /** `null` — очистить необязательное поле (бэкенд пишет null в nullable-колонку). */
  lot_area?: string | null;
  rooms?: number;
  /** Дробный, шаг 0.5 (не кратное 0.5 → 400). `null` — снять. */
  bathrooms?: number | null;
  /** `null` — явно очистить (цокольный этаж is_basement=true или снятый этаж). */
  floor?: number | null;
  total_floors?: number | null;
  year_built?: number | null;
  address?: string;
  latitude?: string;
  longitude?: string;
  translation?: {
    title?: string;
    /** `null` — стереть описание (undefined = не трогать). */
    description?: string | null;
    address_note?: string | null;
  };
  tours_enabled?: boolean;
  tour_windows?: { start: string; end: string }[];
  /** `null` — снять парковку. */
  parking_type?: ParkingType | null;
  amenities?: Amenity[];
  city_id?: string;
  district_id?: string;
  is_basement?: boolean;
  living_area?: string | null;
  non_living_area?: string | null;
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

    /**
     * Зарегистрировать просмотр объявления. POST /listings/:id/view → 204.
     * Публичный (без Bearer), без тела; 404 у неопубликованного — вызывающий
     * должен проглотить ошибку (LAST_CHANGED_API.md §2).
     */
    registerListingView: build.mutation<void, string>({
      query: (id) => ({ url: `/listings/${id}/view`, method: 'POST' }),
    }),

    /**
     * Зарегистрировать намерение позвонить. POST /listings/:id/call → 204.
     * Публичный (без Bearer), без тела; 404 у неопубликованного — вызывающий
     * должен проглотить ошибку (спека 2026-07-03).
     */
    registerListingCall: build.mutation<void, string>({
      query: (id) => ({ url: `/listings/${id}/call`, method: 'POST' }),
    }),
  }),
});

export const {
  useGetListingForEditQuery,
  useUpdateListingMutation,
  useAddListingMediaMutation,
  useDeleteListingMediaMutation,
  useReorderListingMediaMutation,
  useRegisterListingViewMutation,
  useRegisterListingCallMutation,
} = listingEditApi;
