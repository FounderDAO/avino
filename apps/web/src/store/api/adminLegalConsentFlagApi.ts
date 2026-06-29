import { adminApi } from './adminApi';

export interface LegalConsentFlag {
  legalConsentRequired: boolean;
  legalConsentVersion: number;
}

/**
 * adminLegalConsentFlagApi — runtime-управление согласием с юр-документами (ADMIN).
 * GET/PATCH /admin/legal-consent-flag. PATCH принимает любое подмножество полей
 * (required / version) и возвращает перечитанное состояние; инвалидирует тег Admin,
 * поэтому GET перечитывается после изменения. Зеркалит adminPromotionsFlagApi.
 */
export const adminLegalConsentFlagApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    getLegalConsentFlag: build.query<LegalConsentFlag, void>({
      query: () => ({ url: '/admin/legal-consent-flag' }),
      providesTags: ['Admin'],
    }),
    updateLegalConsentFlag: build.mutation<
      LegalConsentFlag,
      { required?: boolean; version?: number }
    >({
      query: (body) => ({
        url: '/admin/legal-consent-flag',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetLegalConsentFlagQuery,
  useUpdateLegalConsentFlagMutation,
} = adminLegalConsentFlagApi;
