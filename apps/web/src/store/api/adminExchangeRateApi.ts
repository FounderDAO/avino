import { adminApi } from './adminApi';

export interface ExchangeRateRow {
  base: 'USD';
  quote: 'UZS';
  rate: string;
  fetched_at: string;
  source: 'CBU' | 'MANUAL';
}

export interface AdminExchangeRateView {
  current: ExchangeRateRow | null;
  history: ExchangeRateRow[];
}

/**
 * adminExchangeRateApi — курс USD/UZS в реальном времени (ADMIN).
 * GET /admin/exchange-rate   — текущий курс + история.
 * PUT /admin/exchange-rate   — ручная установка курса.
 * POST /admin/exchange-rate/refresh — принудительное обновление с ЦБ.
 * Инвалидирует тег Admin (объявлен в baseApi.tagTypes).
 */
export const adminExchangeRateApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    getAdminExchangeRate: build.query<AdminExchangeRateView, void>({
      query: () => ({ url: '/admin/exchange-rate' }),
      providesTags: ['Admin'],
    }),
    setExchangeRate: build.mutation<ExchangeRateRow, { rate: string }>({
      query: (body) => ({ url: '/admin/exchange-rate', method: 'PUT', body }),
      invalidatesTags: ['Admin'],
    }),
    refreshExchangeRate: build.mutation<ExchangeRateRow | null, void>({
      query: () => ({ url: '/admin/exchange-rate/refresh', method: 'POST' }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetAdminExchangeRateQuery,
  useSetExchangeRateMutation,
  useRefreshExchangeRateMutation,
} = adminExchangeRateApi;
