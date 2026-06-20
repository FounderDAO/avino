/**
 * createListingApi — создание объявления и загрузка медиа (docs/API.md §7).
 *
 * 1. POST /listings (Bearer) — создаёт объявление в статусе NEW. Тело —
 *    snake_case, `translation` вложен. Backend ОТКЛОНЯЕТ неизвестные поля,
 *    поэтому `feature_ids`/медиа сюда НЕ передаём.
 * 2. POST /listings/:id/media (Bearer, владелец) — multipart/form-data с полем
 *    `file`, по одному фото. Вызывается ПОСЛЕ создания объявления.
 *
 * Content-Type для multipart НЕ выставляем вручную — fetchBaseQuery пробрасывает
 * FormData как есть, браузер сам проставит boundary.
 */
import { baseApi } from './baseApi';

/** Вложенный перевод объявления (язык оригинала). title обязателен. */
export interface CreateListingTranslation {
  title: string;
  description?: string;
  address_note?: string;
  features_text?: string;
}

/** Тело POST /listings. Обязательные + опциональные поля (snake_case). */
export interface CreateListingBody {
  transaction_type: string;
  property_type: string;
  original_language: 'UZ' | 'RU' | 'EN';
  /** Decimal-строка, regex ^\d{1,12}(\.\d{1,2})?$ — без разделителей. */
  price: string;
  currency: 'UZS' | 'USD';
  translation: CreateListingTranslation;

  // Опциональные:
  area?: string;
  rooms?: number;
  floor?: number;
  total_floors?: number;
  year_built?: number;
  address?: string;
  city_id?: string;
  district_id?: string;
  agency_id?: string;
  latitude?: string;
  longitude?: string;
  tours_enabled?: boolean;
  tour_windows?: { start: string; end: string }[];
}

/** Ответ 201 POST /listings. */
export interface CreateListingResult {
  id: string;
  status: string;
}

/** Аргументы загрузки одного медиа. */
export interface UploadListingMediaArgs {
  listingId: string;
  file: File;
}

export const createListingApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Создать объявление (статус NEW). POST /listings. */
    createListing: build.mutation<CreateListingResult, CreateListingBody>({
      query: (body) => ({
        url: '/listings',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Listing'],
    }),

    /** Загрузить одно фото к объявлению. POST /listings/:id/media. */
    uploadListingMedia: build.mutation<unknown, UploadListingMediaArgs>({
      query: ({ listingId, file }) => {
        const form = new FormData();
        form.append('file', file);
        return {
          url: `/listings/${listingId}/media`,
          method: 'POST',
          body: form,
        };
      },
      invalidatesTags: ['Listing'],
    }),
  }),
  overrideExisting: false,
});

export const { useCreateListingMutation, useUploadListingMediaMutation } =
  createListingApi;
