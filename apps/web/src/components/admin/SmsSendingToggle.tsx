/**
 * Runtime-переключатель отправки SMS на странице настроек (ADMIN).
 * Client-island: читает текущее состояние и шлёт PATCH без пересборки.
 * Выключение → вход по SMS отвечает 503, клиент предложит другой канал.
 */
'use client';

import {
  useGetSmsSettingsQuery,
  useUpdateSmsSettingsMutation,
} from '@/store/api/adminSmsSettingsApi';
import { Switch } from '@/components/admin/ui/switch';

export function SmsSendingToggle() {
  const { data, isLoading } = useGetSmsSettingsQuery();
  const [update, { isLoading: isSaving }] = useUpdateSmsSettingsMutation();
  const enabled = data?.smsEnabled ?? false;

  return (
    <div className="a-card" style={{ padding: 24 }}>
      <div
        className="row gap-16"
        style={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>
            Отправка SMS (OTP-коды)
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Доставка кодов входа по SMS (Eskiz). Выключение → вход по SMS
            недоступен, клиенту предлагается email. Без пересборки.
          </div>
        </div>
        <Switch
          checked={enabled}
          disabled={isLoading || isSaving}
          onChange={() => void update({ enabled: !enabled })}
          label="Отправка SMS (OTP-коды)"
        />
      </div>
    </div>
  );
}
