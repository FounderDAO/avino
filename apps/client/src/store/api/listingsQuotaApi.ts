/**
 * listingsQuotaApi — квота активных объявлений текущего пользователя
 * (GET /listings/quota, Bearer). Визард /sell/new проверяет её на маунте:
 * blocked=true → сразу модалка «Стать агентом», без заполнения формы.
 * Потребитель обязан передавать { skip: !isAuthenticated } (защищённая ручка).
 * Рефетчится при инвалидации тега `Listing` (публикация/архивация объявления).
 */
import { baseApi } from './baseApi';

export interface ListingQuota {
  used: number;
  limit: number;
  blocked: boolean;
}

export const listingsQuotaApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getListingQuota: build.query<ListingQuota, void>({
      query: () => ({ url: '/listings/quota' }),
      providesTags: ['Listing'],
    }),
  }),
  overrideExisting: false,
});

export const { useGetListingQuotaQuery } = listingsQuotaApi;
