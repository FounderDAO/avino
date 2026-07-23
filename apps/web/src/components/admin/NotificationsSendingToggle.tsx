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
import { Switch } from '@/components/admin/ui/switch';

export function NotificationsSendingToggle() {
  const { data, isLoading } = useGetNotificationSettingsQuery();
  const [update, { isLoading: isSaving }] =
    useUpdateNotificationSettingsMutation();

  const emailEnabled = data?.emailEnabled ?? false;
  const pushEnabled = data?.pushEnabled ?? false;

  return (
    <>
      <div className="a-card" style={{ padding: 24 }}>
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
          <Switch
            checked={emailEnabled}
            disabled={isLoading || isSaving}
            onChange={() => void update({ emailEnabled: !emailEnabled })}
            label="Email-уведомления"
          />
        </div>
      </div>

      <div className="a-card" style={{ padding: 24 }}>
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
          <Switch
            checked={pushEnabled}
            disabled={isLoading || isSaving}
            onChange={() => void update({ pushEnabled: !pushEnabled })}
            label="Push-уведомления (моб. приложение)"
          />
        </div>
      </div>
    </>
  );
}
