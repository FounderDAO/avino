import { adminApi } from './adminApi';

export interface MapHoverRecenterFlag {
  mapHoverRecenter: boolean;
}

/**
 * adminMapHoverRecenterFlagApi — runtime-тоггл центрирования карты при наведении
 * на карточку (ADMIN). GET/PATCH /admin/map-hover-recenter-flag. Инвалидирует
 * тег Admin → состояние перечитывается после переключения. Зеркалит
 * adminPromotionsFlagApi.
 */
export const adminMapHoverRecenterFlagApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    getMapHoverRecenterFlag: build.query<MapHoverRecenterFlag, void>({
      query: () => ({ url: '/admin/map-hover-recenter-flag' }),
      providesTags: ['Admin'],
    }),
    updateMapHoverRecenterFlag: build.mutation<
      MapHoverRecenterFlag,
      { enabled: boolean }
    >({
      query: (body) => ({
        url: '/admin/map-hover-recenter-flag',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetMapHoverRecenterFlagQuery,
  useUpdateMapHoverRecenterFlagMutation,
} = adminMapHoverRecenterFlagApi;
