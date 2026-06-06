import { adminApi } from './adminApi';
import type {
  ActivatePromotionRequest,
  CancelPromotionRequest,
  ExtendPromotionRequest,
  ListingPromotion,
} from './adminTypes';

/**
 * adminPromotionsApi (ADMIN-13) — ручное управление промо VIP/TOP (API.md §15).
 *
 * Инъекция в общий `adminApi` (CLAUDE.md §4: только RTK Query, без fetch/axios
 * в компонентах). История помечена тегом `Admin`; все мутации инвалидируют
 * `Admin`, поэтому история промо и карточка листинга (read-cache `promotion_*`)
 * перечитываются после действия.
 *
 * Адресация роутов асимметрична (см. бэкенд-контроллеры):
 * - активация/история — по листингу (`/admin/listings/:id/promotions`);
 * - cancel/extend — по `id` самой промо-строки (`/admin/listing-promotions/:id/*`).
 *
 * - `GET  /admin/listings/:id/promotions` → `ListingPromotion[]` (ledger, история).
 * - `POST /admin/listings/:id/promotions` `{ type, period_days }` → `ListingPromotion`
 *   (201). Идемпотентно по заголовку `Idempotency-Key` (§15/§24): клиент шлёт
 *   свежий UUID на каждую попытку, повтор того же ключа не создаёт дубль.
 *   Ошибки: `422 INVALID_PERIOD`, `409 ACTIVE_PROMOTION_EXISTS`, `404`.
 * - `PATCH /admin/listing-promotions/:id/cancel` `{ reason? }` → `ListingPromotion`.
 * - `PATCH /admin/listing-promotions/:id/extend` `{ period_days }` → `ListingPromotion`.
 *   Ошибки: `422 INVALID_PERIOD`, `422 PROMOTION_NOT_ACTIVE`.
 */
export const adminPromotionsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    listListingPromotions: build.query<ListingPromotion[], string>({
      query: (listingId) => ({
        url: `/admin/listings/${listingId}/promotions`,
      }),
      providesTags: ['Admin'],
    }),

    activatePromotion: build.mutation<
      ListingPromotion,
      {
        listingId: string;
        body: ActivatePromotionRequest;
        idempotencyKey: string;
      }
    >({
      query: ({ listingId, body, idempotencyKey }) => ({
        url: `/admin/listings/${listingId}/promotions`,
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      invalidatesTags: ['Admin'],
    }),

    cancelPromotion: build.mutation<
      ListingPromotion,
      { id: string; body: CancelPromotionRequest }
    >({
      query: ({ id, body }) => ({
        url: `/admin/listing-promotions/${id}/cancel`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),

    extendPromotion: build.mutation<
      ListingPromotion,
      { id: string; body: ExtendPromotionRequest }
    >({
      query: ({ id, body }) => ({
        url: `/admin/listing-promotions/${id}/extend`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListListingPromotionsQuery,
  useActivatePromotionMutation,
  useCancelPromotionMutation,
  useExtendPromotionMutation,
} = adminPromotionsApi;
