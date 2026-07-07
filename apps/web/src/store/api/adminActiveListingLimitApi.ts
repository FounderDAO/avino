import { adminApi } from './adminApi';

export interface ActiveListingLimit {
  activeListingLimit: number;
}

/**
 * adminActiveListingLimitApi — runtime-настройка лимита активных объявлений
 * обычного клиента (ADMIN). GET/PATCH /admin/active-listing-limit. `0` = без
 * лимита. Инвалидирует тег Admin → значение перечитывается после сохранения.
 * Зеркалит adminPromotionsFlagApi.
 */
export const adminActiveListingLimitApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    getActiveListingLimit: build.query<ActiveListingLimit, void>({
      query: () => ({ url: '/admin/active-listing-limit' }),
      providesTags: ['Admin'],
    }),
    updateActiveListingLimit: build.mutation<ActiveListingLimit, { limit: number }>({
      query: (body) => ({
        url: '/admin/active-listing-limit',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetActiveListingLimitQuery,
  useUpdateActiveListingLimitMutation,
} = adminActiveListingLimitApi;
