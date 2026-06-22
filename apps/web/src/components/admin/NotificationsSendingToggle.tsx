/**
 * Runtime-переключатели Email- и Push-уведомлений на странице настроек (ADMIN).
 * Client-island: читает текущее состояние и шлёт PATCH без пересборки.
 * Выключение Email → уведомления на почту не доставляются.
 * Выключение Push  → мобильные push-уведомления не доставляются.
 */
'use client';

import {
  useGetNotificationSettingsQuery,
  useUpdateNotificationSettingsMutation,
} from '@/store/api/adminNotificationSettingsApi';

export function NotificationsSendingToggle() {
  const { data, isLoading } = useGetNotificationSettingsQuery();
  const [update, { isLoading: isSaving }] =
    useUpdateNotificationSettingsMutation();

  const emailEnabled = data?.emailEnabled ?? false;
  const pushEnabled = data?.pushEnabled ?? false;

  return (
    <>
      <div
        className="a-card"
        style={{ padding: 24, maxWidth: 640, marginTop: 18 }}
      >
        <div
          className="row gap-16"
          style={{ alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>
              Email-уведомления
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              Доставка уведомлений на email (лиды, статусы, алерты). Выключение
              → письма не отправляются. Без пересборки.
            </div>
          </div>
          <button
            type="button"
            className={emailEnabled ? 'abtn abtn-primary' : 'abtn abtn-outline'}
            disabled={isLoading || isSaving}
            onClick={() =>
              void update({ emailEnabled: !emailEnabled })
            }
          >
            {isLoading ? '…' : emailEnabled ? 'Включено' : 'Выключено'}
          </button>
        </div>
      </div>

      <div
        className="a-card"
        style={{ padding: 24, maxWidth: 640, marginTop: 18 }}
      >
        <div
          className="row gap-16"
          style={{ alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>
              Push-уведомления (моб. приложение)
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              Доставка push-уведомлений на мобильные устройства (FCM/APNs).
              Выключение → push не отправляются. Без пересборки.
            </div>
          </div>
          <button
            type="button"
            className={pushEnabled ? 'abtn abtn-primary' : 'abtn abtn-outline'}
            disabled={isLoading || isSaving}
            onClick={() =>
              void update({ pushEnabled: !pushEnabled })
            }
          >
            {isLoading ? '…' : pushEnabled ? 'Включено' : 'Выключено'}
          </button>
        </div>
      </div>
    </>
  );
}
