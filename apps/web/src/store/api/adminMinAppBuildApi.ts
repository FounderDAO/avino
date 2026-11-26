import { adminApi } from './adminApi';

export interface MinAppBuild {
  ios: number;
  android: number;
}

/**
 * adminMinAppBuildApi — минимальная допустимая сборка мобильного приложения
 * (ADMIN). GET/PATCH /admin/min-app-build. Сборка ниже значения показывает
 * экран обязательного обновления; `0` = не требовать. PATCH принимает любое
 * подмножество полей. Инвалидирует тег Admin → значение перечитывается после
 * сохранения. Зеркалит adminActiveListingLimitApi.
 */
export const adminMinAppBuildApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    getMinAppBuild: build.query<MinAppBuild, void>({
      query: () => ({ url: '/admin/min-app-build' }),
      providesTags: ['Admin'],
    }),
    updateMinAppBuild: build.mutation<MinAppBuild, Partial<MinAppBuild>>({
      query: (body) => ({
        url: '/admin/min-app-build',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const { useGetMinAppBuildQuery, useUpdateMinAppBuildMutation } =
  adminMinAppBuildApi;
