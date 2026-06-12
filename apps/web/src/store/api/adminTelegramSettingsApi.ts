import { adminApi } from './adminApi';

export interface TelegramSettings {
  notificationsEnabled: boolean;
}

/**
 * adminTelegramSettingsApi — runtime-тоггл Telegram-алертов (ADMIN).
 * GET/PATCH /admin/telegram-settings. Инвалидирует тег Admin, поэтому состояние
 * перечитывается после переключения.
 */
export const adminTelegramSettingsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    getTelegramSettings: build.query<TelegramSettings, void>({
      query: () => ({ url: '/admin/telegram-settings' }),
      providesTags: ['Admin'],
    }),
    updateTelegramSettings: build.mutation<
      TelegramSettings,
      { enabled: boolean }
    >({
      query: (body) => ({
        url: '/admin/telegram-settings',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const { useGetTelegramSettingsQuery, useUpdateTelegramSettingsMutation } =
  adminTelegramSettingsApi;
