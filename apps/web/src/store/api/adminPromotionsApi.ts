import { adminApi } from './adminApi';
import { toQueryParams } from './pagination';
import type { Paginated } from './pagination';
import type {
  ActivatePromotionRequest,
  AdminPromotionFilters,
  AdminPromotionPlan,
  AdminPromotionRow,
  AdminPromotionsSummary,
  CancelPromotionRequest,
  ExtendPromotionRequest,
  ListingPromotion,
  PromotionSettings,
} from './adminTypes';

/**
 * adminPromotionsApi (ADMIN-13) — ручное управление промо VIP/TOP (API.md §15).
 *
 * Инъекция в общий `adminApi` (CLAUDE.md §4: только RTK Query, без fetch/axios
 * в компонентах). История промо помечена тегом `Admin`; все мутации инвалидируют
 * `Admin`, поэтому тарифы/настройки и карточка листинга (read-cache `promotion_*`)
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
 * - `GET /admin/promotion-plans` → `AdminPromotionPlan[]` (тарифы VIP/TOP).
 * - `PATCH /admin/promotion-plans/:id` `{ price?, isActive? }` → обновлённый тариф.
 * - `GET/PATCH /admin/promotion-settings` → интервал проверки истечения (6|12 ч).
 * - `GET /admin/promotions?status&type&page&limit` → page-based
 *   `Paginated<AdminPromotionRow>` — глобальная история промо (ADMIN-16).
 * - `GET /admin/promotions/summary` → `AdminPromotionsSummary` (активные,
 *   выручка за месяц/всего) — KPI страницы «Продвижение».
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

    getPromotionPlans: build.query<AdminPromotionPlan[], void>({
      query: () => ({ url: '/admin/promotion-plans' }),
      providesTags: ['Admin'],
    }),
    updatePromotionPlan: build.mutation<
      AdminPromotionPlan,
      { id: string; body: { price?: string; isActive?: boolean } }
    >({
      query: ({ id, body }) => ({
        url: `/admin/promotion-plans/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
    listAdminPromotions: build.query<
      Paginated<AdminPromotionRow>,
      AdminPromotionFilters
    >({
      query: (filters) => ({
        url: '/admin/promotions',
        params: toQueryParams({ ...filters }),
      }),
      providesTags: ['Admin'],
    }),
    getPromotionsSummary: build.query<AdminPromotionsSummary, void>({
      query: () => ({ url: '/admin/promotions/summary' }),
      providesTags: ['Admin'],
    }),
    getPromotionSettings: build.query<PromotionSettings, void>({
      query: () => ({ url: '/admin/promotion-settings' }),
      providesTags: ['Admin'],
    }),
    updatePromotionSettings: build.mutation<
      PromotionSettings,
      { expiryIntervalHours: 6 | 12 }
    >({
      query: (body) => ({
        url: '/admin/promotion-settings',
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
  useGetPromotionPlansQuery,
  useUpdatePromotionPlanMutation,
  useListAdminPromotionsQuery,
  useGetPromotionsSummaryQuery,
  useGetPromotionSettingsQuery,
  useUpdatePromotionSettingsMutation,
} = adminPromotionsApi;
