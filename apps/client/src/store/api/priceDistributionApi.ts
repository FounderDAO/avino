/**
 * priceDistributionApi — RTK Query эндпоинт гистограммы цены публичного портала.
 * GET /api/v1/search/price-distribution?currency=&transaction_type= → бакеты.
 * snake_case DTO маппится в camelCase для UI.
 */
import { baseApi } from './baseApi';
import type { Currency, TransactionType } from '@/lib/mock/types';

export interface PriceBucket {
  from: number;
  to: number;
  count: number;
}
export interface PriceDistribution {
  min: number;
  max: number;
  buckets: PriceBucket[];
  overflowCount: number;
}
export interface PriceDistributionArgs {
  currency: Currency;
  transactionType: TransactionType;
}

interface PriceDistributionDto {
  currency: Currency;
  transaction_type: TransactionType;
  min: number;
  max: number;
  buckets: PriceBucket[];
  overflow_count: number;
}

export const priceDistributionApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getPriceDistribution: build.query<PriceDistribution, PriceDistributionArgs>({
      query: ({ currency, transactionType }) => ({
        url: '/search/price-distribution',
        params: { currency, transaction_type: transactionType },
      }),
      transformResponse: (dto: PriceDistributionDto): PriceDistribution => ({
        min: dto.min,
        max: dto.max,
        buckets: dto.buckets,
        overflowCount: dto.overflow_count,
      }),
    }),
  }),
  overrideExisting: false,
});

export const { useGetPriceDistributionQuery } = priceDistributionApi;
