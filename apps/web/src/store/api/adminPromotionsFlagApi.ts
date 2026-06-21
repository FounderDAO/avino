import { adminApi } from './adminApi';

export interface PromotionsFlag {
  promotionsEnabled: boolean;
}

/**
 * adminPromotionsFlagApi — runtime-тоггл раздела «Продвижение» (ADMIN).
 * GET/PATCH /admin/promotions-flag. Инвалидирует тег Admin, поэтому состояние
 * перечитывается после переключения. Зеркалит adminSmsSettingsApi.
 */
export const adminPromotionsFlagApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    getPromotionsFlag: build.query<PromotionsFlag, void>({
      query: () => ({ url: '/admin/promotions-flag' }),
      providesTags: ['Admin'],
    }),
    updatePromotionsFlag: build.mutation<PromotionsFlag, { enabled: boolean }>({
      query: (body) => ({
        url: '/admin/promotions-flag',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const { useGetPromotionsFlagQuery, useUpdatePromotionsFlagMutation } =
  adminPromotionsFlagApi;
