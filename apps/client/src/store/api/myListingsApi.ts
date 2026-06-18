/**
 * myListingsApi — личный кабинет «Мои объявления» (docs/API.md §7).
 *
 * GET /listings/mine — Bearer-only, возвращает объявления текущего пользователя
 * ЛЮБОГО статуса (кроме DELETED), с page-based пагинацией `{ data, meta }`.
 *
 * Карточка `MineItem` структурно совместима с элементом /search, поэтому
 * переиспользуем чистый маппер `mapListing`. Отличия mine-карточки:
 *  - несёт `promotion_type` (а НЕ `effective_tier`) → промо-тир после маппинга
 *    переопределяем локальным `toPromo(item.promotion_type)`;
 *  - не содержит `media[]` → mapListing берёт обложку из `thumbnail_url`;
 *  - реальный `status` (NEW|ACTIVE|DRAFT|...) пробрасываем поверх результата.
 *
 * Потребители обязаны передавать `{ skip: !isAuthenticated }`, чтобы гости не
 * дёргали защищённую ручку.
 */
import { baseApi } from './baseApi';
import { mapListing } from '@/lib/api/listings';
import type {
  Currency,
  Listing,
  ListingStatus,
  PromotionType,
  PropertyType,
  TransactionType,
} from '@/lib/mock/types';
import type { OwnerAction } from '@/features/account/ownerListingActions';

/** Допустимые промо-тиры (безопасное сужение строки API). */
const PROMO_VALUES: PromotionType[] = ['NORMAL', 'TOP', 'VIP'];

function toPromo(value: PromotionType | string | null | undefined): PromotionType {
  return PROMO_VALUES.includes(value as PromotionType)
    ? (value as PromotionType)
    : 'NORMAL';
}

/** Сырой элемент выдачи GET /listings/mine (docs/API.md §7, ListingListItem). */
export interface MineItem {
  id: string;
  status: ListingStatus;
  transaction_type: TransactionType;
  property_type: PropertyType;
  price: string;
  currency: Currency;
  area: string | null;
  rooms: number | null;
  city_id: string | null;
  district_id: string | null;
  promotion_type: PromotionType;
  promotion_expires_at: string | null;
  original_language: string;
  title: string;
  thumbnail_url: string | null;
  published_at: string | null;
  created_at: string;
}

/** Envelope GET /listings/mine — page-based пагинация. */
interface MineEnvelope {
  data: MineItem[];
  meta: { page: number; limit: number; total: number };
}

/** Аргументы запроса (status — реальный listing_status). */
export interface GetMyListingsArgs {
  status?: string;
  page?: number;
  limit?: number;
}

export const myListingsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Мои объявления любого статуса (кроме DELETED). GET /listings/mine. */
    getMyListings: build.query<
      { items: Listing[]; total: number },
      GetMyListingsArgs | void
    >({
      query: (args) => {
        const params = new URLSearchParams();
        if (args?.status) params.set('status', args.status);
        if (args?.page != null) params.set('page', String(args.page));
        params.set('limit', String(args?.limit ?? 50));
        return `/listings/mine?${params.toString()}`;
      },
      transformResponse: (env: MineEnvelope) => ({
        items: env.data.map((item) => ({
          // mapListing принимает форму /search-карточки; mine-элемент
          // структурно совместим (отсутствующие поля mapper трактует как
          // undefined через guard), поэтому приводим через `unknown`.
          ...mapListing(item as unknown as Parameters<typeof mapListing>[0]),
          promo: toPromo(item.promotion_type),
          status: item.status,
        })),
        total: env.meta.total,
      }),
      providesTags: ['Listing'],
    }),
    /** Владельческая смена статуса. PATCH /listings/:id/status. */
    setMyListingStatus: build.mutation<
      { id: string; status: ListingStatus },
      { id: string; action: OwnerAction }
    >({
      query: ({ id, action }) => ({
        url: `/listings/${id}/status`,
        method: 'PATCH',
        body: { action },
      }),
      invalidatesTags: ['Listing'],
    }),
  }),
  overrideExisting: false,
});

export const { useGetMyListingsQuery, useSetMyListingStatusMutation } = myListingsApi;
