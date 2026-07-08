/**
 * Runtime-переключатель Telegram-алертов на странице настроек (ADMIN).
 * Client-island: читает текущее состояние и шлёт PATCH без пересборки.
 */
'use client';

import {
  useGetTelegramSettingsQuery,
  useUpdateTelegramSettingsMutation,
} from '@/store/api/adminTelegramSettingsApi';
import { Switch } from '@/components/admin/ui/switch';

export function TelegramNotificationsToggle() {
  const { data, isLoading } = useGetTelegramSettingsQuery();
  const [update, { isLoading: isSaving }] = useUpdateTelegramSettingsMutation();
  const enabled = data?.notificationsEnabled ?? false;

  return (
    <div className="a-card" style={{ padding: 24 }}>
      <div
        className="row gap-16"
        style={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>
            Telegram-уведомления админу
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Алерты на запрос OTP и входы. Переключается без пересборки.
          </div>
        </div>
        <Switch
          checked={enabled}
          disabled={isLoading || isSaving}
          onChange={() => void update({ enabled: !enabled })}
          label="Telegram-уведомления админу"
        />
      </div>
    </div>
  );
}
