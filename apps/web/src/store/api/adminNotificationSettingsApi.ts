import { adminApi } from './adminApi';

export interface NotificationSettings {
  emailEnabled: boolean;
  pushEnabled: boolean;
}

/**
 * adminNotificationSettingsApi — runtime-тоггл Email- и Push-уведомлений (ADMIN).
 * GET/PATCH /admin/notification-settings. Инвалидирует тег Admin, поэтому состояние
 * перечитывается после переключения. Зеркалит adminSmsSettingsApi / adminTelegramSettingsApi.
 */
export const adminNotificationSettingsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    getNotificationSettings: build.query<NotificationSettings, void>({
      query: () => ({ url: '/admin/notification-settings' }),
      providesTags: ['Admin'],
    }),
    updateNotificationSettings: build.mutation<
      NotificationSettings,
      Partial<NotificationSettings>
    >({
      query: (body) => ({
        url: '/admin/notification-settings',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetNotificationSettingsQuery,
  useUpdateNotificationSettingsMutation,
} = adminNotificationSettingsApi;
