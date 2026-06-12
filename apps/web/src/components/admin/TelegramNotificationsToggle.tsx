/**
 * Runtime-переключатель Telegram-алертов на странице настроек (ADMIN).
 * Client-island: читает текущее состояние и шлёт PATCH без пересборки.
 */
'use client';

import {
  useGetTelegramSettingsQuery,
  useUpdateTelegramSettingsMutation,
} from '@/store/api/adminTelegramSettingsApi';

export function TelegramNotificationsToggle() {
  const { data, isLoading } = useGetTelegramSettingsQuery();
  const [update, { isLoading: isSaving }] = useUpdateTelegramSettingsMutation();
  const enabled = data?.notificationsEnabled ?? false;

  return (
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
            Telegram-уведомления админу
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Алерты на запрос OTP и входы. Переключается без пересборки.
          </div>
        </div>
        <button
          type="button"
          className={enabled ? 'abtn abtn-primary' : 'abtn'}
          disabled={isLoading || isSaving}
          onClick={() => void update({ enabled: !enabled })}
        >
          {isLoading ? '…' : enabled ? 'Включено' : 'Выключено'}
        </button>
      </div>
    </div>
  );
}
