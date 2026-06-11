/**
 * promotionsApi — публичные тарифы продвижения (GET /promotions/plans).
 *
 * Публичная ручка (без Bearer): возвращает список планов продвижения
 * `{ plans: [{ type, period_days, price, currency }] }`. UI продаёт TOP/VIP,
 * цены приходят как decimal-строки.
 */
import { baseApi } from './baseApi';

/** Один тариф продвижения. */
export interface PromotionPlan {
  type: 'TOP' | 'VIP';
  period_days: number;
  price: string;
  currency: 'UZS' | 'USD';
}

/** Сырой ответ GET /promotions/plans. */
interface PromotionPlansEnvelope {
  plans: PromotionPlan[];
}

export const promotionsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Публичные тарифы продвижения. GET /promotions/plans. */
    getPromotionPlans: build.query<PromotionPlan[], void>({
      query: () => '/promotions/plans',
      transformResponse: (env: PromotionPlansEnvelope) => env.plans ?? [],
    }),
  }),
  overrideExisting: false,
});

export const { useGetPromotionPlansQuery } = promotionsApi;
