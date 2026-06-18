import { adminApi } from './adminApi';

export interface SmsSettings {
  smsEnabled: boolean;
}

/**
 * adminSmsSettingsApi — runtime-тоггл отправки SMS (ADMIN).
 * GET/PATCH /admin/sms-settings. Инвалидирует тег Admin, поэтому состояние
 * перечитывается после переключения. Зеркалит adminTelegramSettingsApi.
 */
export const adminSmsSettingsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    getSmsSettings: build.query<SmsSettings, void>({
      query: () => ({ url: '/admin/sms-settings' }),
      providesTags: ['Admin'],
    }),
    updateSmsSettings: build.mutation<SmsSettings, { enabled: boolean }>({
      query: (body) => ({
        url: '/admin/sms-settings',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const { useGetSmsSettingsQuery, useUpdateSmsSettingsMutation } =
  adminSmsSettingsApi;
