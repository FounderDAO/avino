import { baseApi } from './baseApi';
import { toQueryParams } from './pagination';
import type {
  Currency,
  DealType,
  Language,
  ListingStatus,
  PromotionType,
  PropertyType,
} from '@avino/shared';

/**
 * listingsApi (TASK-153) — публичная карточка объявления (docs/API.md §7).
 *
 * Инъекция в общий `baseApi` (CLAUDE.md §4: только RTK Query, без fetch/axios
 * в компонентах). `GET /api/v1/listings/:id` отдаёт полную карточку: `media[]`,
 * `features[]`, метрики (area/floor/year), promotion и переведённый текст.
 *
 * Перевод выбирается параметром `?lang` (ADR-012): бэкенд отдаёт title/description
 * на запрошенном языке с фолбэком на `original_language`. Поле `language` в ответе
 * сообщает фактически отданный язык. Кэш RTK Query разделяется по (id, lang),
 * поэтому переключение языка на странице — это отдельная запись кэша, а не гонка.
 */

/** Удобство объявления (аминити), переведённое имя по `?lang`. */
export interface ListingFeature {
  id: string;
  code: string;
  name: string;
}

/** Медиа галереи листинга, упорядочено по `sort_order`. */
export interface ListingMedia {
  id: string;
  url: string;
  thumbnail_url: string | null;
  sort_order: number;
  type: 'IMAGE' | 'VIDEO';
}

/** Полная карточка листинга — ответ `GET /api/v1/listings/:id` (API.md §7). */
export interface ListingDetail {
  id: string;
  status: ListingStatus;
  transaction_type: DealType;
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
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  promotion_type: PromotionType;
  promotion_expires_at: string | null;
  owner_id: string;
  agency_id: string | null;
  /** Фактически отданный язык перевода (может отличаться от запрошенного). */
  language: Language;
  title: string;
  description: string | null;
  address_note: string | null;
  features_text: string | null;
  features: ListingFeature[];
  media: ListingMedia[];
  published_at: string | null;
  created_at: string;
}

/** Аргументы запроса карточки: id + опциональный язык перевода. */
export interface GetListingArgs {
  id: string;
  lang?: Language;
}

export const listingsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getListing: build.query<ListingDetail, GetListingArgs>({
      query: ({ id, lang }) => ({
        url: `/listings/${id}`,
        params: toQueryParams({ lang }),
      }),
      providesTags: (_result, _error, { id }) => [{ type: 'Listing', id }],
    }),
  }),
  overrideExisting: false,
});

export const { useGetListingQuery } = listingsApi;
