/**
 * exchangeRateApi — RTK Query эндпоинт курса валют публичного портала (CLAUDE.md §4).
 *
 * `getExchangeRate` — текущий курс USD→UZS от ЦБУ или ручного override:
 * GET /api/v1/exchange-rate (API.md).
 * snake_case DTO маппится в camelCase ExchangeRate для UI-слоя.
 */
import { baseApi } from './baseApi';

export interface ExchangeRate {
  base: 'USD';
  quote: 'UZS';
  rate: string;
  fetchedAt: string;
  source: 'CBU' | 'MANUAL';
}

interface ExchangeRateDto {
  base: 'USD';
  quote: 'UZS';
  rate: string;
  fetched_at: string;
  source: 'CBU' | 'MANUAL';
}

export const exchangeRateApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getExchangeRate: build.query<ExchangeRate, void>({
      query: () => ({ url: '/exchange-rate' }),
      transformResponse: (dto: ExchangeRateDto): ExchangeRate => ({
        base: dto.base,
        quote: dto.quote,
        rate: dto.rate,
        fetchedAt: dto.fetched_at,
        source: dto.source,
      }),
    }),
  }),
  overrideExisting: false,
});

export const { useGetExchangeRateQuery } = exchangeRateApi;
